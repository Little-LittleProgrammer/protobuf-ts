import * as ts from 'typescript';
import { assert } from '@protobuf-ts/runtime';
import { DescriptorRegistry, ServiceDescriptorProto, SymbolTable, TypeScriptImports, TypescriptFile } from '@protobuf-ts/plugin-framework';
import { GeneratorBase } from './generator-base';
import { Interpreter } from 'src/interpreter';
import { CommentGenerator } from './comment-generator';
import { createLocalTypeName } from './local-type-name';
import type { MethodInfo } from '@protobuf-ts/runtime-rpc';

export class ServiceClientGeneratorHttp extends GeneratorBase {
	readonly symbolKindInterface = 'client-http-interface';
	readonly symbolKindImplementation = 'client-http';

	constructor(
		symbols: SymbolTable,
		registry: DescriptorRegistry,
		imports: TypeScriptImports,
		comments: CommentGenerator,
		interpreter: Interpreter,
		protected readonly options: {
			runtimeImportPath: string;
			runtimeHttpImportPath: string;
		}
	) {
		super(symbols, registry, imports, comments, interpreter);
	}

    registerSymbols(source: TypescriptFile, descriptor: ServiceDescriptorProto): void {
        const basename = createLocalTypeName(descriptor, this.registry);
        const interfaceName = `I${basename}Client`;
        const implementationName = `${basename}Client`;
        this.symbols.register(interfaceName, descriptor, source, this.symbolKindInterface);
        this.symbols.register(implementationName, descriptor, source, this.symbolKindImplementation);
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
            interpreterType = this.interpreter.getServiceType(descriptor),
            IServiceClient = this.imports.type(source, descriptor, this.symbolKindInterface),
            signatures: ts.MethodSignature[] = [];

        for (let mi of interpreterType.methods) {
            const sig = this.createMethodSignatures(source, mi);

            // add comment to the first signature
            if (sig.length > 0) {
                const methodDescriptor = descriptor.method.find(md => md.name === mi.name);
                assert(methodDescriptor);
                this.comments.addCommentsForDescriptor(sig[0], methodDescriptor, 'appendToLeadingBlock');
            }

            signatures.push(...sig);
        }

        // export interface MyService {...
        let statement = ts.createInterfaceDeclaration(
            undefined, [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
            IServiceClient, undefined, undefined, [...signatures]
        );

        // add to our file
        this.comments.addCommentsForDescriptor(statement, descriptor, 'appendToLeadingBlock');
        source.addStatement(statement);

        return statement;
	}

    generateImplementationClass(source: TypescriptFile, descriptor: ServiceDescriptorProto): ts.ClassDeclaration {
        const
            interpreterType = this.interpreter.getServiceType(descriptor),
            ServiceType = this.imports.type(source, descriptor),
            ServiceClient = this.imports.type(source, descriptor, this.symbolKindImplementation),
            IServiceClient = this.imports.type(source, descriptor, this.symbolKindInterface),
            ServiceInfo = this.imports.name(source, 'ServiceInfo', this.options.runtimeHttpImportPath, true),
            HttpTransport = this.imports.name(source, 'HttpTransport', this.options.runtimeHttpImportPath, false),
            HttpOptions = this.imports.name(source, 'HttpOptions', this.options.runtimeHttpImportPath, true),
            VAxios = this.imports.name(source, 'VAxios', this.options.runtimeHttpImportPath, true),
            VAxiosInstance = this.imports.name(source, 'VAxiosInstance', this.options.runtimeHttpImportPath, true);

        const classDecorators: ts.Decorator[] = [];
        const constructorDecorators: ts.Decorator[] = [];
        const members: ts.ClassElement[] = [
            // typeName = Haberdasher.typeName;
            ts.createProperty(
                undefined, undefined, ts.createIdentifier("typeName"),
                undefined, undefined, ts.createPropertyAccess(
                    ts.createIdentifier(ServiceType),
                    ts.createIdentifier("typeName")
                )
            ),

            // methods = Haberdasher.methods;
            ts.createProperty(
                undefined, undefined, ts.createIdentifier("methods"),
                undefined, undefined, ts.createPropertyAccess(
                    ts.createIdentifier(ServiceType),
                    ts.createIdentifier("methods")
                )
            ),

            // options = Haberdasher.options;
            ts.createProperty(
                undefined, undefined, ts.createIdentifier("options"),
                undefined, undefined, ts.createPropertyAccess(
                    ts.createIdentifier(ServiceType),
                    ts.createIdentifier("options")
                )
            ),
            ts.createProperty(
                undefined, [ts.createModifier(ts.SyntaxKind.PublicKeyword)], 'defHttp',
                undefined, ts.createTypeReferenceNode(ts.createIdentifier(HttpTransport), undefined), undefined),
            // constructor(@Inject(RPC_TRANSPORT)  HttpTransport) {}
            ts.createConstructor(
                undefined, undefined,
                [ts.createParameter(
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
                )],
                ts.createBlock([
                    ts.createStatement(ts.createAssignment(
                        ts.createPropertyAccess(ts.createThis(), 'defHttp'),
                        ts.createNew(ts.createIdentifier('HttpTransport'), undefined, [ts.createIdentifier("vAxios"), ts.createIdentifier('opt')])
                    )),
                    ...interpreterType.methods.map(mi => {
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
                const declaration = this.createHttp(source, mi);
                const methodDescriptor = descriptor.method.find(md => md.name === mi.name);
                assert(methodDescriptor);
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
                    ts.createExpressionWithTypeArguments(undefined, ts.createIdentifier(IServiceClient)),
                    ts.createExpressionWithTypeArguments(undefined, ts.createIdentifier(ServiceInfo)),
                ]),
            ],
            members
        );

        source.addStatement(statement);
        this.comments.addCommentsForDescriptor(statement, descriptor, 'appendToLeadingBlock');
        return statement;
    }

    createMethodSignatures(source: TypescriptFile, methodInfo: MethodInfo): ts.MethodSignature[] {
        const method = this.createHttp(source, methodInfo);
        return [ts.createMethodSignature(
            method.typeParameters,
            method.parameters,
            method.type,
            method.name,
            method.questionToken
        )]
    }

	createHttp(
		source: TypescriptFile,
		methodInfo: MethodInfo
	): ts.MethodDeclaration {
		let HttpOptions = this.imports.name(
			source,
			'HttpOptions',
			this.options.runtimeHttpImportPath,
			true
		);
		let HttpResult = this.imports.name(
			source,
			'HttpResult',
			this.options.runtimeHttpImportPath,
			true
		);
        let UploadFile = ''
		let methodIndex = methodInfo.service.methods.indexOf(methodInfo);
		assert(methodIndex >= 0);


        let isUpload = this.isUpload(methodInfo);
        if (isUpload) {
            UploadFile = this.imports.name(
                source,
                'UploadFile',
                this.options.runtimeHttpImportPath,
                true
            );
        }
        const inType = isUpload 
        ? ts.createTypeReferenceNode(ts.createIdentifier(UploadFile), undefined) 
        : this.makeI(source, methodInfo, true)

		return ts.createMethod(
			undefined,
			undefined,
			undefined,
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
					inType
				),
				ts.createParameter(
					undefined,
					undefined,
					undefined,
					ts.createIdentifier('options'),
					ts.createToken(ts.SyntaxKind.QuestionToken),
					ts.createIndexedAccessTypeNode(
						ts.createTypeReferenceNode(ts.createIdentifier(HttpOptions), undefined),
						ts.createLiteralTypeNode(ts.createStringLiteral('requestOptions'))
					),
					undefined
				),
			],
			ts.createTypeReferenceNode(HttpResult, [
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
											methodIndex.toString()
										)
									)
								),
								ts.createVariableDeclaration(
									ts.createIdentifier('opt'),
									undefined,
									ts.createIdentifier('options')
								),
							],
							ts.NodeFlags.Const
						)
					),

					// return this.defHttp.request("unary", this._transport, method, opt, input);
					ts.createReturn(
						ts.createCall(
                            ts.createPropertyAccess(ts.createPropertyAccess(ts.createThis(), 'defHttp'), 'request'),
							[
								inType,
								this.makeO(source, methodInfo, true),
							],
							[
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
        if (method.options['google.api.http']) {
            if ((method.options['google.api.http'] as any).body && (method.options['google.api.http'] as any).body === 'file') {
                return true
            }
        }
        return false
    }

    protected makeI(source: TypescriptFile, methodInfo: MethodInfo, isTypeOnly = false): ts.TypeReferenceNode {
        return ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source,
            this.registry.resolveTypeName(methodInfo.I.typeName),
            'default',
            isTypeOnly
        )), undefined);
    }

    // TODO: methodInfo.O.typeName不存在, 需要更改MessageType
    protected makeO(source: TypescriptFile, methodInfo: MethodInfo, isTypeOnly = false): ts.TypeReferenceNode {
        return ts.createTypeReferenceNode(ts.createIdentifier(this.imports.type(source,
            this.registry.resolveTypeName(methodInfo.O.typeName),
            'default',
            isTypeOnly
        )), undefined);
    }

    
}
