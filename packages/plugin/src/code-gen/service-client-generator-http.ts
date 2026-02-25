import * as ts from 'typescript';
import { assert } from '@protobuf-ts/runtime';
import { DescriptorRegistry, ServiceDescriptorProto, SymbolTable, TypeScriptImports, TypescriptFile } from '@protobuf-ts/plugin-framework';
import { GeneratorBase } from './generator-base';
import { Interpreter } from 'src/interpreter';
import { CommentGenerator } from './comment-generator';
import { createLocalTypeName } from './local-type-name';
import type { MethodInfo } from '@protobuf-ts/runtime-rpc';

/**
 * HTTP service client 代码生成器。
 *
 * 核心职责：
 * 1) 为每个 proto service 注册符号名（接口 + 实现）。
 * 2) 生成 `IxxClient` 接口（只含方法签名）。
 * 3) 生成 `xxClient` 实现类（方法体委托给 HttpTransport.request）。
 * 4) 额外生成一个聚合类 `HttpClient`，把同文件内多个 service client 挂成属性。
 *
 * 生成方式：
 * - 本文件不直接拼字符串，而是使用 TypeScript AST 工厂 (`ts.createXxx`) 构造语法树。
 * - 最终由插件框架统一打印为 .ts 代码。
 */
export class ServiceClientGeneratorHttp extends GeneratorBase {
	// 符号类别常量，注册接口名时使用。
	readonly symbolKindInterface = 'client-interface';
	// 符号类别常量，注册实现类名时使用。
	readonly symbolKindImplementation = 'client';
    // 当前 service 的本地基础名，例如 "UserService"。
    basename: string = '';
    // 跨阶段共享信息：
    // - constructor: 聚合类 HttpClient 要复用的构造参数节点
    // - fileDescriptor: 当前输出文件包含的所有 service 描述符
    httpFileInfo: Record<'constructor'|'fileDescriptor', any> = {
        constructor: [],
        fileDescriptor: []
    }

	constructor(
		// 符号表：注册/查询 descriptor 对应的 TS 命名，避免冲突。
		symbols: SymbolTable,
		// 描述符注册表：把 typeName 解析成真实 protobuf descriptor。
		registry: DescriptorRegistry,
		// import 管理器：统一收集并生成 import 语句（含 type-only）。
		imports: TypeScriptImports,
		// 注释生成器：把 proto 注释挂到生成的 AST 节点。
		comments: CommentGenerator,
		// 解释器：把 descriptor 转成更好用的服务/方法模型。
		interpreter: Interpreter,
		// 生成器配置（受保护 + 只读）：
		// - runtimeImportPath: 通用 runtime 的导入路径
		// - runtimeHttpImportPath: HTTP runtime 的导入路径
		protected readonly options: {
			runtimeImportPath: string;
			runtimeHttpImportPath: string;
		}
	) {
		super(symbols, registry, imports, comments, interpreter);
	}

    /**
     * 第一步：注册符号，让后续 `imports.type(...)` 可以稳定拿到命名。
     */
    registerSymbols(source: TypescriptFile, descriptor: ServiceDescriptorProto): void {
        // 根据 descriptor 计算当前 service 的本地基础名。
        this.basename  = createLocalTypeName(descriptor, this.registry);
        // 接口命名规则：I + basename + Client。
        const interfaceName = `I${this.basename}Client`;
        // 实现类命名规则：basename + Client。
        const implementationName = `${this.basename}Client`;
        // 向符号表注册接口符号。
        this.symbols.register(interfaceName, descriptor, source, this.symbolKindInterface);
        // 向符号表注册实现类符号。
        this.symbols.register(implementationName, descriptor, source, this.symbolKindImplementation);
        // 记录 descriptor，供 generateAllClass() 统一组装 HttpClient 聚合类。
        this.httpFileInfo.fileDescriptor.push(descriptor)
    }

    /**
     * 生成聚合类 `HttpClient`：
     * - 每个 service 作为一个属性（例如 userClient/orderClient）
     * - 构造函数统一透传 vAxios/opt 到每个子 client
     */
    generateAllClass(source: TypescriptFile): ts.ClassDeclaration {
        // 收集 [属性名, 类名]，例如 ['userClient', 'UserClient']。
        const extendsName: string[][] = [];
        // 这里做导入登记，避免最终打印出的文件缺失类型引用。
        this.imports.name(source, 'HttpOptions', this.options.runtimeHttpImportPath, true),
        this.imports.name(source, 'VAxios', this.options.runtimeHttpImportPath, true),
        this.imports.name(source, 'VAxiosInstance', this.options.runtimeHttpImportPath, true);
        this.httpFileInfo.fileDescriptor.forEach((descriptor: ServiceDescriptorProto) => {
            // 拿到该 service 对应的实现类类型名。
            const ServiceClient = this.imports.type(source, descriptor, this.symbolKindImplementation);
            // 拿到服务名（符号表中的稳定命名）。
            const ServiceName = this.symbols.get(descriptor).name;
            // 首字母小写，作为聚合类属性名。
            const name = ServiceName.charAt(0).toLowerCase() + ServiceName.slice(1)
            // 把属性映射记录下来，后续统一生成属性与构造赋值。
            extendsName.push([name, ServiceClient])
        })
       
        const classDecorators: ts.Decorator[] = [];

        const memebers = [
            // 生成属性声明：`fooClient: FooClient`
            ...extendsName.map(([n, k]) => {
                return ts.createProperty(
                    // 无 decorators。
                    undefined, undefined, ts.createIdentifier(n),
                    // 属性类型为对应 client 类。
                    undefined, ts.createTypeReferenceNode(
                        ts.createIdentifier(k),
                        undefined
                    ),undefined
                )
            }),
            // 生成构造函数：
            // this.fooClient = new FooClient(vAxios, opt)
            ts.createConstructor(
                undefined, undefined,
                // 复用实现类构造参数列表。
                this.httpFileInfo.constructor[0],
                ts.createBlock([
                    ...extendsName.map(([n, k]) => {
                        // 访问 this.<属性名>。
                        const access = ts.createPropertyAccess(ts.createThis(), n)
                        return ts.createStatement(ts.createAssignment(
                            access,
                            // new 对应 service client，并透传 [vAxios, opt]。
                            ts.createNew(ts.createIdentifier(k), undefined, this.httpFileInfo.constructor[1])
                        ))
                    })
                ], true)
            ),
        ]

        const statement = ts.createClassDeclaration(
            classDecorators,
            [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
            // 聚合类固定名 HttpClient。
            'HttpClient',
            undefined,
            undefined,
            memebers
        );
        source.addStatement(statement);
        return statement
    }

    /**
     * For the following .proto:
     *
     *   service SimpleService {
     *     rpc Get (GetRequest) returns (GetResponse);
     *   }
     *
     * We generate the following interface:
     *
     *   interface ISimpleServiceClient {
     *     get(request: GetRequest, options?: HttpOptions): Promise<Result<ExampleResponse>>;
     *   }
     *
     */
    generateInterface(source: TypescriptFile, descriptor: ServiceDescriptorProto): ts.InterfaceDeclaration {
        const
            // 把 descriptor 解释为服务模型（包含 methods 列表）。
            interpreterType = this.interpreter.getServiceType(descriptor),
            // 接口名（符号系统保证唯一）。
            IServiceClient = this.imports.type(source, descriptor, this.symbolKindInterface),
            // 收集所有方法签名节点。
            signatures: ts.MethodSignature[] = [];

        for (let mi of interpreterType.methods) {
            // 为当前方法生成签名（参数/返回类型与实现保持一致）。
            const sig = this.createMethodSignatures(source, mi);

            // add comment to the first signature
            if (sig.length > 0) {
                const methodDescriptor = descriptor.method.find(md => md.name === mi.name);
                assert(methodDescriptor);
                this.comments.addCommentsForDescriptor(sig[0], methodDescriptor, 'appendToLeadingBlock');
            }

            signatures.push(...sig);
        }

        // 生成：export interface IxxClient { ... }
        let statement = ts.createInterfaceDeclaration(
            undefined, [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
            // 接口名。
            IServiceClient, undefined, undefined, [...signatures]
        );

        // add to our file
        this.comments.addCommentsForDescriptor(statement, descriptor, 'appendToLeadingBlock');
        source.addStatement(statement);

        return statement;
	}

    /**
     * 生成实现类 `xxClient`。
     *
     * 关键点：
     * - methods 属性引用 ServiceType.methods，用于按 index 取当前方法描述。
     * - defHttp 是 HttpTransport 实例，真正发送 HTTP 请求。
     * - 构造函数里对每个方法执行 bind(this)，防止解构/传引用后 this 丢失。
     */
    generateImplementationClass(source: TypescriptFile, descriptor: ServiceDescriptorProto): ts.ClassDeclaration {
        const
            // 解释服务结构。
            interpreterType = this.interpreter.getServiceType(descriptor),
            // 服务 type 常量名（含 methods 元信息）。
            ServiceType = this.imports.type(source, descriptor),
            // 实现类名。
            ServiceClient = this.imports.type(source, descriptor, this.symbolKindImplementation),
            // 接口名。
            IServiceClient = this.imports.type(source, descriptor, this.symbolKindInterface),
            // 实现类同时实现 ServiceInfo（runtime 约定）。
            ServiceInfo = this.imports.name(source, 'ServiceInfo', this.options.runtimeHttpImportPath, true),
            // HttpTransport 是运行时构造值，不能 type-only。
            HttpTransport = this.imports.name(source, 'HttpTransport', this.options.runtimeHttpImportPath, false),
            // 以下是构造参数类型。
            HttpOptions = this.imports.name(source, 'HttpOptions', this.options.runtimeHttpImportPath, true),
            VAxios = this.imports.name(source, 'VAxios', this.options.runtimeHttpImportPath, true),
            VAxiosInstance = this.imports.name(source, 'VAxiosInstance', this.options.runtimeHttpImportPath, true);

        const classDecorators: ts.Decorator[] = [];
        const constructorDecorators: ts.Decorator[] = [];

        // 生成构造函数签名：
        // constructor(vAxios: VAxios | VAxiosInstance, opt: HttpOptions = {})
        const constructorParamsAll = [ts.createParameter(
            constructorDecorators,
            undefined,
            undefined, ts.createIdentifier("vAxios"), undefined,
            ts.createUnionTypeNode([ // 参数类型：VAxios | VAxiosInstance
                ts.createTypeReferenceNode(VAxios, undefined),
                ts.createTypeReferenceNode(VAxiosInstance, undefined)
            ]),
            undefined
        ), ts.createParameter(
            constructorDecorators,
            undefined,
            undefined, ts.createIdentifier("opt"), undefined,
            ts.createTypeReferenceNode(ts.createIdentifier(HttpOptions), undefined),
            ts.createObjectLiteral([]) 
        )]
        // 与上面参数定义对应的实参引用列表。
        const constructorParams = [ts.createIdentifier("vAxios"), ts.createIdentifier('opt')]
        // 把构造参数缓存下来，供 generateAllClass() 复用。
        this.httpFileInfo.constructor = [constructorParamsAll, constructorParams]
        const members: ts.ClassElement[] = [

            // methods = ServiceType.methods;
            // 每个方法的 request 元数据（path、verb、序列化信息等）都在这里。
            ts.createProperty(
                undefined, undefined, ts.createIdentifier("methods"),
                undefined, undefined, ts.createPropertyAccess(
                    ts.createIdentifier(ServiceType),
                    ts.createIdentifier("methods")
                )
            ),

            ts.createProperty(
                undefined, [ts.createModifier(ts.SyntaxKind.PublicKeyword)], 'defHttp',
                undefined, ts.createTypeReferenceNode(ts.createIdentifier(HttpTransport), undefined), undefined),
            // constructor(...) { this.defHttp = new HttpTransport(vAxios, opt); ... }
            ts.createConstructor(
                undefined, undefined,
                constructorParamsAll,
                ts.createBlock([
                    ts.createStatement(ts.createAssignment(
                        // 初始化 transport 封装器。
                        ts.createPropertyAccess(ts.createThis(), 'defHttp'),
                        ts.createNew(ts.createIdentifier('HttpTransport'), undefined, constructorParams)
                    )),
                    ...interpreterType.methods.map(mi => {
                        // this.xxx = this.xxx.bind(this)
                        // 目的：把方法当回调传出去时，仍然能拿到正确 this.defHttp / this.methods。
                        const methodsName = mi.localName;
                        const access = ts.createPropertyAccess(ts.createThis(), methodsName)
                        return ts.createStatement(ts.createAssignment(
                            access,
                            ts.createCall(
                                ts.createPropertyAccess(
                                    access,
                                    ts.createIdentifier("bind")
                                ),
                                undefined, // 类型参数，这里不需要
                                [ts.createThis()] // bind 方法的参数列表，这里只有一个 this
                            )
                        ))
                    })
                ], true)
            ),


            ...interpreterType.methods.map(mi => {
                // 生成每个 RPC 对应的类方法 AST。
                const declaration = this.createHttp(source, mi);
                // 从 descriptor 找到对应方法注释信息。
                const methodDescriptor = descriptor.method.find(md => md.name === mi.name);
                assert(methodDescriptor);
                // 把 proto 注释挂到生成方法前。
                this.comments.addCommentsForDescriptor(declaration, methodDescriptor, 'appendToLeadingBlock');
                return declaration;
            })
        ]

        // export class MyService implements MyService, ServiceInfo
        const statement = ts.createClassDeclaration(
            classDecorators,
            [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
            ServiceClient,
            undefined,
            [
                ts.createHeritageClause(ts.SyntaxKind.ImplementsKeyword, [
                    // 实现 IxxClient，确保类型签名一致。
                    ts.createExpressionWithTypeArguments(undefined, ts.createIdentifier(IServiceClient)),
                    // 实现 ServiceInfo，满足 runtime-http 侧类型约束。
                    ts.createExpressionWithTypeArguments(undefined, ts.createIdentifier(ServiceInfo)),
                ]),
            ],
            members
        );

        source.addStatement(statement);
        this.comments.addCommentsForDescriptor(statement, descriptor, 'appendToLeadingBlock');
        return statement;
    }

    /**
     * 接口签名复用实现方法的参数/返回类型定义，避免两套逻辑漂移。
     */
    createMethodSignatures(source: TypescriptFile, methodInfo: MethodInfo): ts.MethodSignature[] {
        // 先生成完整方法声明，复用其类型信息。
        const method = this.createHttp(source, methodInfo);
        return [ts.createMethodSignature(
            // 逐项拷贝类型参数、参数、返回类型、方法名、可选标记。
            method.typeParameters,
            method.parameters,
            method.type,
            method.name,
            method.questionToken
        )]
    }

    /**
     * 生成单个 RPC 对应的 HTTP 方法实现。
     *
     * 输出形态大致等价于：
     *   method(input, options?) {
     *     const method = this.methods[index], opt = options;
     *     return this.defHttp.request<I, O>(method, input, opt);
     *   }
     */
	createHttp(
		source: TypescriptFile,
		methodInfo: MethodInfo
	): ts.MethodDeclaration {
		// 导入方法级 options 类型来源。
		let HttpOptions = this.imports.name(
			source,
			'HttpOptions',
			this.options.runtimeHttpImportPath,
			true
		);
		// 导入统一返回包装类型 HttpResult<O>。
		let HttpResult = this.imports.name(
			source,
			'HttpResult',
			this.options.runtimeHttpImportPath,
			true
		);
        // 上传模式下才会真正赋值为类型名。
        let UploadFile = ''
        // methodIndex 用于从 ServiceType.methods 中取当前方法元数据。
		let methodIndex = methodInfo.service.methods.indexOf(methodInfo);
        // 防御性检查，理论上 methodInfo 必须存在于 service.methods。
		assert(methodIndex >= 0);


        // 上传场景特殊化：当 google.api.http.body = "file" 时，
        // 把输入类型从普通消息替换为 UploadFile。
        let isUpload = this.isUpload(methodInfo);
        if (isUpload) {
            // 只有上传场景才导入 UploadFile，避免无用 import。
            UploadFile = this.imports.name(
                source,
                'UploadFile',
                this.options.runtimeHttpImportPath,
                true
            );
        }
        // input 的最终类型：UploadFile | I(请求消息)
        const inType = isUpload 
        ? ts.createTypeReferenceNode(ts.createIdentifier(UploadFile), undefined) 
        : this.makeI(source, methodInfo, true)

		return ts.createMethod(
            // 无 decorators/modifiers/asterisk，生成普通实例方法。
			undefined,
			undefined,
			undefined,
            // 方法名来自 MethodInfo.localName（已做命名规范化）。
			ts.createIdentifier(methodInfo.localName),
			undefined,
			undefined,
			[
				ts.createParameter(
					undefined,
					undefined,
					undefined,
					ts.createIdentifier('input'),
					undefined,
                    // input 类型按上传/普通请求二选一。
					inType
				),
				ts.createParameter(
					undefined,
					undefined,
					undefined,
					ts.createIdentifier('options'),
					ts.createToken(ts.SyntaxKind.QuestionToken),
					ts.createIndexedAccessTypeNode(
                        // options 类型只暴露 HttpOptions["requestOptions"] 这一层，
                        // 避免把 transport 构造级配置误传到方法级调用。
						ts.createTypeReferenceNode(ts.createIdentifier(HttpOptions), undefined),
						ts.createLiteralTypeNode(ts.createStringLiteral('requestOptions'))
					),
					undefined
				),
			],
			ts.createTypeReferenceNode(HttpResult, [
                // 返回值类型为 HttpResult<响应消息类型>。
				this.makeO(source, methodInfo, true),
			]),
			ts.createBlock(
				[
					// const method = this.methods[0], opt = options;
					ts.createVariableStatement(
						undefined,
						ts.createVariableDeclarationList(
							[
								ts.createVariableDeclaration(
									ts.createIdentifier('method'),
									undefined,
									ts.createElementAccess(
										ts.createPropertyAccess(
											ts.createThis(),
											ts.createIdentifier('methods')
										),
										ts.createNumericLiteral(
                                            // 固定下标取当前 rpc 的 descriptor 元数据。
											methodIndex.toString()
										)
									)
								),
								ts.createVariableDeclaration(
									ts.createIdentifier('opt'),
									undefined,
                                    // 给 options 起别名，和生成代码风格对齐。
									ts.createIdentifier('options')
								),
							],
							ts.NodeFlags.Const
						)
					),

					// 调用 runtime-http 的统一入口。method 描述符决定 URL、HTTP method、
                    // 编解码策略等细节，这里只负责透传 input/options。
					ts.createReturn(
						ts.createCall(
                            ts.createPropertyAccess(ts.createPropertyAccess(ts.createThis(), 'defHttp'), 'request'),
							[
                                // 给 request 传入泛型 I/O，提升调用点类型精度。
								inType,
								this.makeO(source, methodInfo, true),
							],
							[
                                // 实参顺序必须与 HttpTransport.request 定义一致。
								ts.createIdentifier('method'),
								ts.createIdentifier('input'),
								ts.createIdentifier('opt'),
							]
						)
					),
				],
				true
			)
		);
	}



    protected isUpload(method: MethodInfo): boolean {
        // 约定：google.api.http.body === 'file' 代表文件上传方法。
        // 该约定来自项目内 HTTP mode 的生成规则。
        // 先判断 google.api.http 选项是否存在。
        if (method.options['google.api.http']) {
            // 再判断 body 是否明确标记为 file。
            if ((method.options['google.api.http'] as any).body && (method.options['google.api.http'] as any).body === 'file') {
                return true
            }
        }
        // 默认不是上传方法。
        return false
    }

    protected makeI(source: TypescriptFile, methodInfo: MethodInfo, isTypeOnly = false): ts.TypeReferenceNode {
        // 解析并导入输入消息类型，输出 AST 类型引用节点。
        return ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source,
            // 把字符串 typeName 解析为 descriptor，再按默认符号导入类型名。
            this.registry.resolveTypeName(methodInfo.I.typeName),
            'default',
            isTypeOnly
        )), undefined);
    }

    protected makeO(source: TypescriptFile, methodInfo: MethodInfo, isTypeOnly = false): ts.TypeReferenceNode {
        // 解析并导入输出消息类型，输出 AST 类型引用节点。
        return ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source,
            // 与 makeI 对称，解析并导入输出消息类型。
            this.registry.resolveTypeName(methodInfo.O.typeName),
            'default',
            isTypeOnly
        )), undefined);
    }

    
}
