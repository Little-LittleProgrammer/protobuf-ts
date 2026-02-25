# protobuf-ts HTTP Only 模式 - 代码流程详解

## 一、Proto 文件解析流程 (从 .proto 到 TypeScript)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              从 .proto 文件到生成 TS 文件的完整流程                          │
└─────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  1. 用户执行 protoc 命令                                                                │
│     protoc --ts_out=only_http:. --proto_path=. service.proto                            │
│                                                                                          │
│     protoc 是 protobuf 编译器，它:                                                        │
│     - 读取 .proto 文件                                                                  │
│     - 解析 proto 语法                                                                   │
│     - 调用 protoc-gen-ts 插件 (通过 --ts_out 指定)                                       │
│     - 传递 CodeGeneratorRequest 给插件                                                  │
└─────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  2. protoc-gen-ts 插件接收 CodeGeneratorRequest                                          │
│                                                                                          │
│     CodeGeneratorRequest 包含:                                                          │
│     - protoFile: FileDescriptorProto[] (所有 proto 文件的二进制描述)                    │
│     - parameter: string (命令行参数，如 only_http)                                      │
│     - fileToGenerate: string[] (需要生成的文件列表)                                      │
└─────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  3. DescriptorRegistry.createFrom() - 解析 proto 文件描述符                              │
│                                                                                          │
│     FileDescriptorProto 是 protobuf 定义的描述符，包含了 proto 文件的完整结构:             │
│     - name: 文件名                                                                       │
│     - package: 包名                                                                      │
│     - dependency: 依赖的 proto 文件                                                      │
│     - messageType: 所有消息类型 (DescriptorProto[])                                      │
│     - enumType: 所有枚举类型 (EnumDescriptorProto[])                                    │
│     - service: 所有服务 (ServiceDescriptorProto[])                                       │
│     - options: 文件选项                                                                  │
│                                                                                          │
│     关键类:                                                                              │
│     - DescriptorRegistry: 管理所有描述符的注册表                                          │
│     - DescriptorTree: 构建描述符树                                                       │
│     - TypeNameLookup: 类型名称查找                                                        │
│     - SourceCodeInfoLookup: 源代码信息查找                                               │
└─────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  4. Interpreter - 解释器，将描述符转换为运行时类型                                         │
│                                                                                          │
│     Interpreter 类负责:                                                                 │
│     - 将 ServiceDescriptorProto 转换为 rpc.ServiceType                                   │
│     - 将 DescriptorProto 转换为 rt.IMessageType                                          │
│     - 将 EnumDescriptorProto 转换为 rt.EnumInfo                                          │
│     - 读取自定义选项 (如 google.api.http)                                               │
│                                                                                          │
│     关键方法:                                                                            │
│     - getServiceType(descriptor): 获取服务类型                                            │
│     - getMessageType(descriptor): 获取消息类型                                            │
│     - getEnumInfo(descriptor): 获取枚举信息                                              │
│     - readOptions(): 读取自定义扩展选项                                                   │
└─────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  5. 代码生成器生成 TypeScript 代码                                                       │
│                                                                                          │
│     根据 options.onlyHttp 标志:                                                          │
│     - true:  使用 ServiceTypeGeneratorHttp + ServiceClientGeneratorHttp                 │
│     - false: 使用默认的 ServiceTypeGenerator + 各种 ClientGenerator                     │
└─────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  6. 生成的文件                                                                         │
│     - service.ts: ServiceType 元信息                                                     │
│     - service.client.ts: 客户端接口和实现类                                              │
│     - http-client.ts: 整合的 HttpClient (仅多 service 时)                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、Proto 文件描述符详解

### 2.1 FileDescriptorProto - 文件描述符

```typescript
// 这是 protoc 传递给插件的原始数据结构
interface FileDescriptorProto {
    name: string;                    // 文件名，如 "service.proto"
    package: string;                // 包名，如 "rum"
    dependency: string[];            // 依赖的其他 proto 文件
    messageType: DescriptorProto[];  // 所有消息类型定义
    enumType: EnumDescriptorProto[]; // 所有枚举类型定义
    service: ServiceDescriptorProto[]; // 所有服务定义
    options: FileOptions;            // 文件选项
    sourceCodeInfo: SourceCodeInfo;  // 源码位置信息
    // ... 其他字段
}
```

### 2.2 ServiceDescriptorProto - 服务描述符

```typescript
interface ServiceDescriptorProto {
    name: string;                    // 服务名，如 "Rum"
    method: MethodDescriptorProto[]; // 服务中的所有方法
    options: ServiceOptions;        // 服务选项 (包含自定义选项)
}
```

### 2.3 MethodDescriptorProto - 方法描述符

```typescript
interface MethodDescriptorProto {
    name: string;                    // 方法名，如 "Report"
    inputType: string;              // 输入类型，如 ".rum.ReportRequest"
    outputType: string;             // 输出类型，如 ".rum.ReportReply"
    clientStreaming: boolean;        // 客户端流
    serverStreaming: boolean;       // 服务端流
    options: MethodOptions;         // 方法选项 (包含 google.api.http)
}
```

### 2.4 关键: google.api.http 选项

方法选项中的 `google.api.http` 包含了 HTTP 映射:

```protobuf
rpc Report(ReportRequest) returns (ReportReply) {
    option (google.api.http) = {
        post: "/api/v1/report"
        body: "*"
    };
};
```

这个选项会被 Interpreter.readOptions() 读取为:

```typescript
{
    'google.api.http': {
        post: '/api/v1/report',
        body: '*'
    }
}
```

---

## 三、DescriptorRegistry 详解

### 3.1 创建注册表

```typescript
// protobufts-plugin.ts:244
const registry = DescriptorRegistry.createFrom(request);

// descriptor-registry.ts:54-71
static createFrom(request: CodeGeneratorRequest): DescriptorRegistry {
    const files = request.protoFile;  // 获取所有 proto 文件
    const tree = DescriptorTree.from(...files);  // 构建描述符树
    const nameLookup = TypeNameLookup.from(tree);  // 创建类型名查找
    const sourceCodeLookup = new SourceCodeInfoLookup(...);  // 源码信息查找
    const descriptorInfo = new DescriptorInfo(tree, nameLookup);  // 描述符信息
    const stringFormat = new StringFormat(nameLookup, tree, ...);  // 字符串格式化

    return new DescriptorRegistry(tree, nameLookup, sourceCodeLookup, stringFormat, descriptorInfo);
}
```

### 3.2 遍历所有类型

```typescript
// 遍历文件中的所有类型
registry.visitTypes(fileDescriptor, descriptor => {
    if (DescriptorProto.is(descriptor)) {
        // 处理消息类型
    }
    if (EnumDescriptorProto.is(descriptor)) {
        // 处理枚举类型
    }
    if (ServiceDescriptorProto.is(descriptor)) {
        // 处理服务类型
    }
});
```

---

## 四、Interpreter 详解

### 4.1 获取服务类型

```typescript
// interpreter.ts:240-253
getServiceType(descriptorOrTypeName: string | ServiceDescriptorProto): rpc.ServiceType {
    let descriptor = typeof descriptorOrTypeName === "string"
        ? this.registry.resolveTypeName(descriptorOrTypeName)
        : descriptorOrTypeName;

    let typeName = this.registry.makeTypeName(descriptor);
    let type = this.serviceTypes.get(typeName);

    if (!type) {
        // 构建 ServiceType
        type = this.buildServiceType(
            typeName,
            descriptor.method,
            excludeOptions
        );
        this.serviceTypes.set(typeName, type);
    }
    return type;
}
```

### 4.2 构建方法信息

```typescript
// interpreter.ts:303-346
private buildMethodInfo(methodDescriptor: MethodDescriptorProto, excludeOptions): PartialMethodInfo {
    let info: { [k: string]: any } = {};

    info.name = methodDescriptor.name;                           // 方法名
    info.localName = lowerCamelCase(methodDescriptor.name);     // 本地方法名

    // 读取输入输出类型
    info.I = this.getMessageType(methodDescriptor.inputType);  // 输入消息类型
    info.O = this.getMessageType(methodDescriptor.outputType);  // 输出消息类型

    // 读取自定义选项 (包含 google.api.http)
    info.options = this.readOptions(methodDescriptor, excludeOptions);

    return info as PartialMethodInfo;
}
```

### 4.3 读取自定义选项

```typescript
// interpreter.ts:89-169
readOptions(descriptor, excludeOptions): JsonOptionsMap | undefined {
    // 1. 检查是否有未知字段 (扩展选项存储在未知字段中)
    let unknownFields = rt.UnknownFieldHandler.list(descriptor.options);

    // 2. 确定选项类型 (FieldOptions/MethodOptions/ServiceOptions/etc.)
    let optionsTypeName = ...; // 如 'google.protobuf.MethodOptions'

    // 3. 创建合成类型来读取扩展
    const type = new rt.MessageType(typeName, this.buildFieldInfos(extensions), {});

    // 4. 读取并转换为 JSON
    const json = type.toJson(type.fromBinary(unknownBytes));

    return json; // 包含 google.api.http 等扩展选项
}
```

---

## 五、详细代码流程

### 阶段 1: 参数解析 (.ts:238-243protobufts-plugin)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    用户执行命令                                           │
│  protoc --ts_out=only_http:. --proto_path=. service.proto                               │
└─────────────────────────────────────┬───────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              protobufts-plugin.ts                                        │
│                                                                                          │
│  1. makeInternalOptions() - 解析参数，识别 only_http=true                                │
│  2. 创建代码生成器:                                                                       │
│     - genServiceTypeHttp (HTTP服务类型)                                                  │
│     - genClientHttp (HTTP客户端)                                                         │
│  3. for each fileDescriptor:                                                             │
│     - registry.visitTypes() 遍历所有类型                                                  │
│     - 判断 onlyHttp 标志                                                                 │
└─────────────────────────────────────┬───────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
         ┌────────────────────────┐         ┌────────────────────────┐
         │   options.onlyHttp     │         │  !options.onlyHttp     │
         │   = true (HTTP模式)    │         │  = false (gRPC模式)   │
         └───────────┬────────────┘         └───────────┬────────────┘
                     │                                    │
                     ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                              onlyHttp = true 时的处理流程                                  │
│                                                                                            │
│  1. 生成 ServiceType (ServiceTypeGeneratorHttp)                                          │
│  2. 生成 HTTP Client 接口 (genClientHttp.generateInterface)                              │
│  3. 生成 HTTP Client 实现 (genClientHttp.generateImplementationClass)                   │
│  4. 生成整合的 HttpClient (genClientHttp.generateAllClass)                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、详细代码流程

### 阶段 1: 参数解析 (.ts:238-243protobufts-plugin)

```typescript
// 1. 解析命令行参数
const options = makeInternalOptions(
    this.parseOptions(this.parameters, request.parameter)
)

// 2. only_http 参数会被解析为 options.onlyHttp = true
// see our-options.ts:246, 340-342
if (params?.only_http) {
    o.onlyHttp = true;
}
```

### 阶段 2: 创建代码生成器 (protobufts-plugin.ts:251-260)

```typescript
// 创建各种代码生成器
genServiceTypeHttp = new ServiceTypeGeneratorHttp(...)  // HTTP服务类型生成器
genClientHttp = new ServiceClientGeneratorHttp(...)       // HTTP客户端生成器
```

### 阶段 3: 遍历文件并注册符号 (protobufts-plugin.ts:296-309)

```typescript
registry.visitTypes(fileDescriptor, descriptor => {
    if (ServiceDescriptorProto.is(descriptor)) {
        // 注册 HTTP 客户端符号
        genClientHttp.registerSymbols(outClientCall, descriptor);
    }
});
```

### 阶段 4: 根据模式生成代码 (protobufts-plugin.ts:324-381)

```typescript
if (!options.onlyInterface) {
    registry.visitTypes(fileDescriptor, descriptor => {

        if (options.onlyHttp) {
            // ====== HTTP Only 模式 ======

            // 1. 生成 ServiceType (服务元信息)
            if (ServiceDescriptorProto.is(descriptor)) {
                genServiceTypeHttp.generateServiceType(outMain, descriptor);
            }

            // 2. 生成 HTTP Client
            const clientHttpStyles = optionResolver.getClientStyles(descriptor);
            if (clientHttpStyles.includes(ClientStyle.GENERIC_CLIENT)) {
                // 生成接口
                genClientHttp.generateInterface(outClientCall, descriptor);
                // 生成实现类
                genClientHttp.generateImplementationClass(outClientCall, descriptor);
            }

        } else {
            // ====== gRPC 模式 (默认) ======

            // 生成完整的 MessageType
            if (DescriptorProto.is(descriptor)) {
                genMessageType.generateMessageType(outMain, descriptor, ...);
            }

            // 生成 ServiceType
            if (ServiceDescriptorProto.is(descriptor)) {
                genServiceType.generateServiceType(outMain, descriptor);
                // 生成各种 Client/Server
            }
        }
    });
}
```

### 阶段 5: 生成整合的 HttpClient (protobufts-plugin.ts:413-417)

```typescript
if (options.onlyHttp) {
    // 当存在多个 service 时，生成一个整合的 HttpClient 类
    const httpAllClient = new OutFile('http-client.ts', ...);
    genClientHttp.generateAllClass(httpAllClient)
    tsFiles.push(httpAllClient)
}
```

---

## 三、各生成器详细流程

### 3.1 ServiceTypeGeneratorHttp (http-type-generator.ts)

**功能**: 生成服务元信息 (ServiceType)

**generateServiceType() 流程**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    generateServiceType()                            │
│                                                                     │
│  1. 获取 ServiceType 标识符                                         │
│     MyService = this.imports.type(source, descriptor)               │
│                                                                     │
│  2. 获取解释器中的服务类型                                            │
│     interpreterType = interpreter.getServiceType(descriptor)        │
│                                                                     │
│  3. 创建方法信息数组                                                  │
│     args = [                                                          │
│       typeName: "rum.Rum",                                          │
│       methods: [createMethodInfoLiterals()]                         │
│     ]                                                               │
│                                                                     │
│  4. 生成代码:                                                        │
│     export const Rum = new ServiceType("rum.Rum", [                 │
│       { name: "Report", options: {...}, I: {...}, O: {...} }       │
│     ]);                                                             │
└─────────────────────────────────────────────────────────────────────┘
```

**createMethodInfoLiterals() 流程**:

```
1. 遍历所有方法
2. 对每个方法调用 createMethodInfoLiteral()
3. 生成方法对象:
   {
     name: 'Report',
     localName: 'report',
     options: { 'google.api.http': { post: '/v1/rum/report', body: '*' } },
     I: { typeName: 'ReportRequest' },
     O: { typeName: 'ReportReply' }
   }
```

**生成的代码示例**:
```typescript
// service.ts
export const Rum = new ServiceType("rum.Rum", [
    {
        name: 'Report',
        localName: 'report',
        options: { 'google.api.http': { post: '/api/v1/report', body: '*' } },
        I: { typeName: 'ReportRequest' },
        O: { typeName: 'ReportReply' }
    },
    {
        name: 'Transforming',
        localName: 'transforming',
        options: { 'google.api.http': { post: '/api/v1/transforming', body: 'file' } },
        I: { typeName: 'ReportRequest' },
        O: { typeName: 'ReportReply' }
    }
], {});
```

---

### 3.2 ServiceClientGeneratorHttp (service-client-generator-http.ts)

**功能**: 生成 HTTP 客户端接口和实现类

#### 3.2.1 registerSymbols() - 注册符号

```
1. 创建本地类型名
   basename = createLocalTypeName(descriptor)

2. 注册接口: I{Rum}Client
3. 注册实现类: {Rum}Client

4. 保存 descriptor 到 httpFileInfo.fileDescriptor
   (用于后续生成整合的 HttpClient)
```

#### 3.2.2 generateInterface() - 生成接口

```
┌─────────────────────────────────────────────────────────────────────┐
│                   generateInterface()                                │
│                                                                     │
│  1. 获取解释器中的服务类型                                            │
│     interpreterType = interpreter.getServiceType(descriptor)       │
│                                                                     │
│  2. 遍历所有方法                                                     │
│     for (let mi of interpreterType.methods)                        │
│                                                                     │
│  3. 为每个方法创建方法签名                                            │
│     - report(input: ReportRequest): HttpResult<ReportReply>       │
│     - transforming(input: UploadFile): HttpResult<ReportReply>    │
│                                                                     │
│  4. 生成接口:                                                        │
│     export interface IRumClient {                                   │
│       report(req: ReportRequest): HttpResult<ReportReply>          │
│       transforming(file: UploadFile): HttpResult<ReportReply>     │
│     }                                                               │
└─────────────────────────────────────────────────────────────────────┘
```

**判断文件上传**:
```typescript
protected isUpload(method: MethodInfo): boolean {
    // 检查 google.api.http body 是否为 "file"
    if (method.options['google.api.http']) {
        if ((method.options['google.api.http'] as any).body === 'file') {
            return true
        }
    }
    return false
}
```

#### 3.2.3 generateImplementationClass() - 生成实现类

```
┌─────────────────────────────────────────────────────────────────────┐
│              generateImplementationClass()                          │
│                                                                     │
│  1. 构造函数参数:                                                    │
│     constructor(vAxios: VAxios | VAxiosInstance,                  │
│                 opt: HttpOptions = {})                             │
│                                                                     │
│  2. 创建成员属性:                                                   │
│     - methods = Rum.methods                                         │
│     - defHttp: HttpTransport                                        │
│                                                                     │
│  3. 构造函数实现:                                                   │
│     this.defHttp = new HttpTransport(vAxios, opt)                  │
│     this.report = this.report.bind(this)                          │
│     this.transforming = this.transforming.bind(this)              │
│                                                                     │
│  4. 生成方法实现:                                                    │
│     - report() -> defHttp.request()                                │
│     - transforming() -> defHttp.request() (文件上传)               │
└─────────────────────────────────────────────────────────────────────┘
```

**生成的代码示例**:
```typescript
// service.client.ts
export interface IRumClient {
    report(input: ReportRequest, options?: HttpOptions["requestOptions"]): HttpResult<ReportReply>;
    transforming(input: UploadFile, options?: HttpOptions["requestOptions"]): HttpResult<ReportReply>;
}

export class RumClient$1 implements IRumClient, ServiceInfo {
    methods = Rum.methods;
    public defHttp: HttpTransport;

    constructor(vAxios: VAxios | VAxiosInstance, opt: HttpOptions = {}) {
        this.defHttp = new HttpTransport(vAxios, opt);
        this.report = this.report.bind(this);
        this.transforming = this.transforming.bind(this);
    }

    report(input: ReportRequest, options?: HttpOptions["requestOptions"]): HttpResult<ReportReply> {
        const method = this.methods[0], opt = options;
        return this.defHttp.request(method, input, opt);
    }

    transforming(input: UploadFile, options?: HttpOptions["requestOptions"]): HttpResult<ReportReply> {
        const method = this.methods[1], opt = options;
        return this.defHttp.request(method, input, opt);
    }
}
```

#### 3.2.4 generateAllClass() - 生成整合的 HttpClient

```
┌─────────────────────────────────────────────────────────────────────┐
│                   generateAllClass()                                 │
│                                                                     │
│  当存在多个 Service 时，生成一个整合的 HttpClient 类                 │
│                                                                     │
│  1. 遍历所有已注册的 service descriptor                             │
│     httpFileInfo.fileDescriptor.forEach(...)                        │
│                                                                     │
│  2. 为每个 service 创建属性                                          │
│     rum: RumClient$1                                                │
│     rum1: Rum1Client$1                                              │
│                                                                     │
│  3. 生成构造函数                                                      │
│     constructor(vAxios, opt) {                                      │
│       this.rum = new RumClient$1(vAxios, opt);                     │
│       this.rum1 = new Rum1Client$1(vAxios, opt);                   │
│     }                                                               │
└─────────────────────────────────────────────────────────────────────┘
```

**生成的代码示例**:
```typescript
// http-client.ts
export class HttpClient {
    rum: RumClient$1;
    rum1: Rum1Client$1;

    constructor(vAxios: VAxios | VAxiosInstance, opt: HttpOptions = {}) {
        this.rum = new RumClient$1(vAxios, opt);
        this.rum1 = new Rum1Client$1(vAxios, opt);
    }
}
```

---

### 3.3 HttpTransport (runtime-http/src/rpc-transport.ts)

**功能**: 实际发起 HTTP 请求

**request() 流程**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                   HttpTransport.request()                          │
│                                                                     │
│  1. makeUrl(method) - 从 google.api.http 获取 URL                  │
│     - 解析 options['google.api.http']                              │
│     - 返回: post/get/put/delete/patch 对应的 URL                   │
│                                                                     │
│  2. makeMethod(method) - 获取 HTTP 方法                            │
│     - get -> 'GET'                                                 │
│     - post -> 'POST'                                               │
│     - put -> 'PUT'                                                 │
│     - delete -> 'DELETE'                                          │
│     - patch -> 'PATCH'                                             │
│                                                                     │
│  3. isUpload(method) - 判断是否文件上传                             │
│     - body === 'file' -> true                                      │
│                                                                     │
│  4. 调用 VAxios 发起请求                                            │
│     - 普通请求: vAxios.request({url, method, params})             │
│     - 文件上传: vAxios.uploadFile({url, method}, file)            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 四、完整流程图

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              用户执行 protoc                                     │
│  protoc --ts_out=only_http:. --proto_path=. service.proto                      │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  protobufts-plugin.ts                                                            │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. makeInternalOptions()                                                  │  │
│  │    - 解析参数 only_http=true                                              │  │
│  │    - 设置 options.onlyHttp = true                                         │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. 创建生成器                                                              │  │
│  │    - ServiceTypeGeneratorHttp                                             │  │
│  │    - ServiceClientGeneratorHttp                                            │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. 遍历所有文件 for each fileDescriptor                                    │  │
│  │    registry.visitTypes(fileDescriptor, descriptor => {...})                │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  判断: if (options.onlyHttp)                                                    │
└─────────────────────────────┬───────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ====== HTTP Only 模式 ======                                                    │
│                                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────┐   │
│  │ genServiceTypeHttp.generateServiceType(outMain, descriptor)               │   │
│  │                                                                             │   │
│  │ 输入:ServiceDescriptorProto                                               │   │
│  │ 输出:export const Rum = new ServiceType("rum.Rum", [{...}]);             │   │
│  │                                                                             │   │
│  │ 流程:                                                                       │   │
│  │ 1. interpreter.getServiceType(descriptor) 获取服务方法列表                  │   │
│  │ 2. createMethodInfoLiterals() 生成方法信息数组                              │   │
│  │ 3. 每个方法包含: name, localName, options(I/O类型), I, O                  │   │
│  └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────┐   │
│  │ genClientHttp.generateInterface(outClientCall, descriptor)                │   │
│  │                                                                             │   │
│  │ 输入:ServiceDescriptorProto                                               │   │
│  │ 输出:export interface IRumClient {...}                                     │   │
│  │                                                                             │   │
│  │ 流程:                                                                       │   │
│  │ 1. 遍历所有方法                                                            │   │
│  │ 2. 判断 isUpload() - body === 'file'                                       │   │
│  │ 3. 生成方法签名                                                            │   │
│  │    - 普通: report(input: ReportRequest): HttpResult<ReportReply>          │   │
│  │    - 上传: transforming(input: UploadFile): HttpResult<ReportReply>      │   │
│  └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────┐   │
│  │ genClientHttp.generateImplementationClass(outClientCall, descriptor)      │   │
│  │                                                                             │   │
│  │ 输入:ServiceDescriptorProto                                               │   │
│  │ 输出:export class RumClient implements IRumClient {...}                   │   │
│  │                                                                             │   │
│  │ 流程:                                                                       │   │
│  │ 1. 构造函数: constructor(vAxios, opt)                                      │   │
│  │ 2. 创建 defHttp: HttpTransport                                             │   │
│  │ 3. 绑定方法: this.report = this.report.bind(this)                         │   │
│  │ 4. 实现方法: return this.defHttp.request(method, input, opt)              │   │
│  └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────┐   │
│  │ genClientHttp.generateAllClass(httpAllClient)                              │   │
│  │                                                                             │   │
│  │ 仅当有多个 Service 时生成                                                   │   │
│  │ 输出:export class HttpClient { rum: RumClient; rum1: Rum1Client; ... }    │   │
│  └────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  生成文件:                                                                       │
│  ┌─────────────────┬──────────────────────────────────────────────────────────┐   │
│  │ service.ts     │ 包含 ServiceType 元信息                                  │   │
│  ├─────────────────┼──────────────────────────────────────────────────────────┤   │
│  │ service.client.ts | 包含 IRumClient 接口和 RumClient 实现类              │   │
│  ├─────────────────┼──────────────────────────────────────────────────────────┤   │
│  │ http-client.ts │ 整合所有 Service Client (可选)                          │   │
│  └─────────────────┴──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  用户使用:                                                                       │
│                                                                                   │
│  const client = new HttpClient(axios, { baseURL: '/api' });                       │
│  const result = await client.rum.report({ id: 1, data: "test" });               │
│                                                                                   │
│  result: { code: 200, data: {...}, msg: "success" }                              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 五、关键文件清单

| 文件 | 功能 |
|------|------|
| `packages/plugin/src/protobufts-plugin.ts` | 主插件入口，调度各生成器 |
| `packages/plugin/src/our-options.ts` | 参数定义和解析，包含 `only_http` |
| `packages/plugin/src/code-gen/http-type-generator.ts` | ServiceType 生成器 |
| `packages/plugin/src/code-gen/service-client-generator-http.ts` | HTTP Client 生成器 |
| `packages/runtime-http/src/rpc-transport.ts` | HTTP 传输层 |
| `packages/runtime-http/src/http-result.ts` | 响应结果类型 |
| `packages/runtime-http/src/rpc-options.ts` | 请求选项类型 |

---

## 六、版本历史

| 提交 | 功能 |
|------|------|
| `f64c32b` | 添加 only_interface 功能 |
| `7f971c6` | 添加 http_only 模式，新增 runtime-http 包 |
| `7d1cd6a` | 完成 HTTP 生成和导出 |
| `3c9e31a` | 添加上传文件 URL 支持 |
| `d5dc2c2` | 修复上传接口错误 |
| `b5a2aab` | 更改上传文件时的接口类型 |
| `2706ba3` | 增加 http 导出 |
| `5f78fe3` | 整合 onlyHttp 模式下的所有 client 服务 |
| `f385677` | 整合 onlyHttp 模式下的所有 client 服务 (正式版) |
| `07587df` | 修复返回结构体 |
