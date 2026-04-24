# protobuf-ts 架构与 HTTP Only 模式详解

这份文档不是 API 速查，也不是单纯的命令说明，而是一份“新人建立心智模型”的工程说明书。

目标只有一个：

- 让一个第一次接触 `protobuf-ts` 的人，读完后能讲清楚这个项目在解决什么问题、编译期和运行时分别做什么、各个包为什么这样拆、`only_http` 模式又是如何嵌进整条链路里的。

如果你只想记一句话，可以先记这个：

> `protobuf-ts` 是一个围绕 `.proto -> TypeScript 代码 -> 运行时消息/RPC 调用` 的工具链；`only_http` 则是在这条标准链路旁边分出来的一条“面向 HTTP SDK 生成”的专用分支。

---

## 一、先建立全局视角

### 1.1 protobuf-ts 到底是什么

`protobuf-ts` 不是单个库，而是一个 monorepo，核心能力横跨两个阶段：

1. 编译期
   - 把 `.proto` 交给 `protoc`
   - 由 `@protobuf-ts/plugin` 读取 `CodeGeneratorRequest`
   - 生成 TypeScript 代码

2. 运行时
   - 由生成出来的代码配合 runtime 包执行消息创建、序列化、反序列化、RPC 调用

这意味着它本质上是一个“代码生成器 + 多个运行时库 + 示例工程”的组合。

### 1.2 这个仓库在解决什么问题

如果用业务语言说，仓库想解决四类问题：

1. 如何把 `.proto` 契约稳定地翻译成 TypeScript 类型和代码。
2. 如何让这些生成物既能做 protobuf 消息编解码，也能做 RPC 调用。
3. 如何把标准 protobuf/gRPC 能力拆成多个可组合的运行时包，而不是把所有逻辑塞进一个巨型运行时。
4. 如何针对不同调用场景生成不同形态的客户端或服务端代码。

其中第 4 点非常关键，因为它解释了为什么仓库里既有标准模式，也有 `only_http` 这种定制模式。

### 1.3 一张图理解仓库主链路

```text
.proto 文件
  |
  |  protoc 解析
  v
CodeGeneratorRequest
  |
  |  @protobuf-ts/plugin-framework 提供插件基础设施
  |  @protobuf-ts/plugin 负责解释描述符并生成代码
  v
生成的 TypeScript 文件
  |
  |-- 消息接口 / 枚举
  |-- MessageType / ServiceType / Client / Server
  |-- 或 only_http 分支下的 HTTP ServiceType / HTTP Client
  v
运行时包
  |
  |-- @protobuf-ts/runtime
  |-- @protobuf-ts/runtime-rpc
  |-- transport / backend / runtime-http
  v
业务代码调用
```

理解这个项目最重要的不是记 API，而是记住它始终分成三层：

- 协议描述层：`.proto`
- 生成层：`plugin-framework` + `plugin`
- 执行层：`runtime` / `runtime-rpc` / 各种 transport

---

## 二、仓库分层与关键包职责

仓库主目录集中在 `packages/`，下面这些包是理解架构时最关键的。

### 2.1 编译期核心包

#### `packages/plugin-framework`

这是 `protoc` 插件的基础设施层，不直接决定生成什么代码，只负责把“写插件”这件事变简单。

主要职责：

- 从 `stdin` 读取 `CodeGeneratorRequest`
- 把描述符组织成可遍历、可查询的结构
- 提供类型名查找、源码注释查找、描述符关系查找
- 提供 TypeScript AST 生成辅助能力

关键文件：

- `packages/plugin-framework/src/plugin-base.ts`
- `packages/plugin-framework/src/descriptor-registry.ts`
- `packages/plugin-framework/src/descriptor-tree.ts`
- `packages/plugin-framework/src/source-code-info.ts`

一句话概括：

> `plugin-framework` 解决的是“怎么接住 protoc 请求并优雅地分析描述符”。

#### `packages/plugin`

这是实际的 `protoc-gen-ts` 实现，也是整个生成链路的编译期核心。

主要职责：

- 解析插件参数
- 创建 `Interpreter`
- 决定每个描述符应该生成什么
- 选择不同代码生成器
- 组装输出文件并最终交给 TypeScript 编译器打印

关键文件：

- `packages/plugin/src/protobufts-plugin.ts`
- `packages/plugin/src/interpreter.ts`
- `packages/plugin/src/our-options.ts`
- `packages/plugin/src/code-gen/*`

一句话概括：

> `plugin` 决定的是“这个 `.proto` 最终变成哪些 `.ts` 文件，以及每个文件里放什么”。

### 2.2 标准运行时核心包

#### `packages/runtime`

这是消息运行时。标准模式下，生成物对它依赖最重。

主要职责：

- `MessageType` 抽象
- 默认值创建
- 二进制编解码
- JSON 编解码
- 深比较、克隆、类型守卫
- 反射信息

关键文件：

- `packages/runtime/src/message-type.ts`
- `packages/runtime/src/reflection-*.ts`

一句话概括：

> `runtime` 负责“消息本身怎么活起来”。

#### `packages/runtime-rpc`

这是 RPC 抽象层，不关心具体协议是 gRPC、grpc-web 还是 Twirp。

主要职责：

- 定义 `ServiceType`、`MethodInfo`
- 定义 `RpcTransport` 接口
- 定义 unary / streaming 调用模型
- 为各种 transport 提供统一契约

关键文件：

- `packages/runtime-rpc/src/service-type.ts`
- `packages/runtime-rpc/src/rpc-transport.ts`
- `packages/runtime-rpc/src/unary-call.ts`
- `packages/runtime-rpc/src/server-streaming-call.ts`

一句话概括：

> `runtime-rpc` 负责“服务调用这件事的统一抽象”。

### 2.3 协议适配层

这层是对 `runtime-rpc` 的具体落地。

典型包：

- `packages/grpc-transport`
- `packages/grpcweb-transport`
- `packages/twirp-transport`
- `packages/grpc-backend`

作用是把统一的 `MethodInfo + RpcTransport` 契约，映射成具体协议行为。

### 2.4 HTTP Only 相关包

#### `packages/runtime-http`

这是本仓库里为 `only_http` 模式额外增加的一条运行时分支。

它和 `runtime-rpc` 的差异不是“名字不同”，而是设计目标不同：

- `runtime-rpc` 面向标准 protobuf RPC 语义
- `runtime-http` 面向“根据 `google.api.http` 注解组装 HTTP 请求”

关键文件：

- `packages/runtime-http/src/service-type.ts`
- `packages/runtime-http/src/reflection-info.ts`
- `packages/runtime-http/src/rpc-transport.ts`
- `packages/runtime-http/src/http-result.ts`

#### `packages/example-http`

这是理解 `only_http` 的最佳样例工程。

它展示了：

- 如何在 proto 里写 `google.api.http`
- 如何通过 `--ts_opt=only_http` 生成 HTTP 客户端
- 生成产物长什么样
- 运行时调用最终如何落到 `HttpTransport`

---

## 三、标准模式与 only_http 模式的关系

### 3.1 标准模式是什么

标准 `protobuf-ts` 工作流大致是：

1. 为 message 生成 TypeScript interface
2. 生成 `MessageType`
3. 生成标准 `ServiceType`
4. 生成 generic client / grpc client / server 定义
5. 运行时由 `@protobuf-ts/runtime` 和 `@protobuf-ts/runtime-rpc` 承接

这条链路强调的是“完整 protobuf 语义”。

### 3.2 only_http 模式是什么

`only_http` 不是独立插件，而是 `@protobuf-ts/plugin` 的一个生成分支开关。

在当前仓库实现里，它的目标更偏业务 SDK 生成：

- 继续利用 `.proto` 做契约描述
- 读取 `google.api.http` 注解
- 生成轻量 HTTP Client
- 在运行时把方法调用直接转成 HTTP 请求

也就是说，它不是在做“标准 gRPC over HTTP”，而是在做：

> `proto service + google.api.http -> 业务 HTTP SDK`

### 3.3 为什么会有这条分支

因为标准 protobuf RPC 和业务前端 HTTP SDK 的诉求并不完全一样。

标准模式更关注：

- protobuf 消息编解码
- RPC 调用生命周期
- streaming 语义
- 标准 transport 契约

而 `only_http` 更关注：

- 能否从 proto 直接产出前端可用 SDK
- URL 和 Method 是否能从 `google.api.http` 直接拿到
- 是否能兼容上传、业务统一返回包裹、外部 axios 风格实例

所以它本质上是“借用 protobuf-ts 的描述符解析和代码生成基础设施，专门定制一条 REST/HTTP 风格的生成链路”。

### 3.4 两条链路的关键差别

| 对比项 | 标准模式 | only_http 模式 |
| --- | --- | --- |
| 消息运行时 | 强依赖 `@protobuf-ts/runtime` | 弱化，仅生成接口，不生成完整 `MessageType` |
| 服务运行时 | `@protobuf-ts/runtime-rpc` | `@protobuf-ts/runtime-http` |
| 调用协议 | gRPC / grpc-web / Twirp 等 | 普通 HTTP 请求 |
| 方法元信息 | 完整 RPC 元信息 | 面向 HTTP 的轻量方法元信息 |
| 生成目标 | protobuf/RPC 生态完整支持 | 面向业务 HTTP SDK |

新人最容易混淆的一点是：

> `only_http` 不是“把 gRPC transport 改成 HTTP”，而是“把 service 定义解释成另一套生成目标”。

---

## 四、编译期总链路：从 `.proto` 到生成文件

这一部分是整个项目的核心，理解了它，就理解了 `protobuf-ts` 为什么能扩展出不同生成模式。

### 4.1 起点不是 `.proto` 文本，而是描述符请求

开发者通常执行的是类似命令：

```bash
npx protoc \
  --proto_path=./protos \
  --proto_path=./third_party \
  --ts_out=. \
  --ts_opt=only_http \
  --ts_opt=long_type_number \
  --ts_opt=use_proto_field_name \
  $(find protos -name '*.proto')
```

以 `packages/example-http/Makefile` 为例，真正关键的是：

- `--ts_out=.`
- `--ts_opt=only_http`

`protoc` 做了两件事：

1. 解析 `.proto` 语法和 import 关系
2. 把这些信息编码成 `CodeGeneratorRequest` 传给插件

所以插件真正处理的输入不是源码文本，而是 protobuf 描述符对象。

### 4.2 `PluginBase.run()`：接住 protoc 的总入口

`packages/plugin-framework/src/plugin-base.ts` 里的 `PluginBase.run()` 是整个插件体系的入口。

它做的事情非常标准：

1. 从 `stdin` 读取二进制数据
2. 反序列化成 `CodeGeneratorRequest`
3. 调用具体插件的 `generate()`
4. 把输出封装成 `CodeGeneratorResponse`
5. 再写回 `stdout`

这是 `protoc` 插件协议的标准工作方式。

这个抽象的重要性在于：

- 业务插件不用反复关心 stdin/stdout 协议细节
- 参数解析、错误处理、能力声明都能统一处理

### 4.3 `ProtobuftsPlugin.generate()`：本项目真正的主控器

`packages/plugin/src/protobufts-plugin.ts` 的 `generate()` 是编译期核心调度函数。

它大致做了这些事：

1. 解析插件参数
2. 创建 `DescriptorRegistry`
3. 创建 `Interpreter`
4. 创建各类 generator
5. 为每个 proto 文件建立输出文件表
6. 首轮遍历：注册所有符号
7. 次轮遍历：生成消息接口与枚举
8. 三轮遍历：根据模式生成 MessageType / ServiceType / Client / Server
9. 过滤掉不应输出的依赖文件
10. 如有需要再补充 `http-client.ts`
11. 最终统一转译并返回

这说明 `generate()` 并不是简单地“遍历一下就输出字符串”，而是在做一个分阶段的编译过程。

### 4.4 为什么要分阶段遍历

这是理解代码生成器很重要的一点。

`generate()` 至少做了三种遍历：

1. 注册符号
2. 生成消息接口/枚举
3. 生成服务相关内容

之所以这样拆，是因为生成某个文件时往往需要先知道：

- 某个 message 最终在当前文件里叫什么
- 某个 service client 的实现类名是什么
- import 应该指向哪个输出文件

如果不先做“符号注册”，生成过程中就会出现命名冲突、前向引用困难和 import 不稳定。

换句话说：

> 第一轮遍历在建索引，后两轮遍历才在真正产出代码。

---

## 五、DescriptorRegistry：为什么它是整个生成链路的地基

### 5.1 `DescriptorRegistry.createFrom()` 做了什么

`packages/plugin-framework/src/descriptor-registry.ts` 的 `createFrom()` 会把 `CodeGeneratorRequest` 里的 `protoFile[]` 组织成统一的描述符注册表。

内部会构建几类能力：

- `DescriptorTree`
  - 建立文件、消息、枚举、服务的树状父子关系

- `TypeNameLookup`
  - 负责类型名和描述符之间的双向查找

- `SourceCodeInfoLookup`
  - 负责从 `sourceCodeInfo` 找注释和源码位置

- `DescriptorInfo`
  - 负责“这个字段是不是 map / enum / message / extension / optional”等语义判断

- `StringFormat`
  - 负责把描述符格式化成人读得懂的声明文本

这意味着 `DescriptorRegistry` 不是一个简单的数组包装器，而是“描述符分析中心”。

### 5.2 为什么生成器不直接操作原始 descriptor

因为原始 descriptor 虽然完整，但直接使用并不方便。

比如一个生成器如果直接拿到 `FieldDescriptorProto`，它还得自己回答这些问题：

- 这个字段是不是 map？
- 如果是 message 字段，目标 message 是哪个？
- 这个字段是不是用户显式声明的 `optional`？
- 这个描述符的父节点是谁？
- 这个方法的注释在哪？

`DescriptorRegistry` 的价值就在于把这些“编译器辅助能力”集中封装。

所以从架构上说：

> `DescriptorRegistry` 是插件内部的“语义数据库”。

---

## 六、Interpreter：把 descriptor 解释成更适合生成的模型

### 6.1 它不是执行器，而是解释器

`packages/plugin/src/interpreter.ts` 的核心职责，是把底层 descriptor 转成更高层的运行时模型或生成期模型。

它主要做三件事：

1. 构造消息类型信息
2. 构造服务类型信息
3. 读取自定义 option 并转成 JSON

这一步非常重要，因为 protobuf descriptor 原始结构偏底层，而生成器更适合消费“已经解释好的对象”。

### 6.2 `getMessageType()`

在标准模式里，`getMessageType()` 会返回一个运行时 `MessageType` 实例。

这个实例不是生成出来的源代码，而是插件在编译期临时构造出来的内存对象。

它的价值是：

- 可以复用和运行时同一套字段解释逻辑
- 可以统一作为 message 信息的真相来源
- 可以用于读取选项、字段元信息和生成反射代码

### 6.3 `getServiceType()`

`getServiceType()` 会把 `ServiceDescriptorProto` 转成 `runtime-rpc` 风格的 `ServiceType`。

这里拿到的方法信息一般包括：

- `name`
- `localName`
- `I`
- `O`
- `options`
- `idempotency`

这一步是 service 生成器和 client 生成器的共同基础。

### 6.4 `readOptions()` 是整个“扩展能力”的关键

`readOptions()` 是 `Interpreter` 里最值得关注的方法之一。

它的思路不是硬编码“识别某个具体 option”，而是：

1. 根据 descriptor 类型决定应该读哪种 `*Options`
   - 例如 `MethodDescriptorProto` 对应 `google.protobuf.MethodOptions`

2. 从 `descriptor.options` 的 unknown fields 中提取扩展字段数据

3. 临时构造一个 synthetic `MessageType`
   - 字段集合来自该 options 类型对应的所有 extension

4. 用这个 synthetic type 把 unknown bytes 读出来

5. 再转成 JSON 对象

这套做法意味着插件可以在编译期读取自定义 option，而不需要为每个 option 写专门解析器。

这也是为什么 `google.api.http` 能被 `only_http` 利用的根本原因。

### 6.5 一句话理解 Interpreter

如果说 `DescriptorRegistry` 解决的是“怎么找到描述符”，那么 `Interpreter` 解决的是：

> “怎么把描述符解释成生成器真正想消费的结构化语义”。

---

## 七、生成器体系：标准分支和 HTTP 分支如何切换

### 7.1 `ProtobuftsPlugin.generate()` 里并行存在多套 generator

插件初始化时会同时创建多套生成器，例如：

- `MessageInterfaceGenerator`
- `EnumGenerator`
- `MessageTypeGenerator`
- `ServiceTypeGenerator`
- `ServiceTypeGeneratorHttp`
- `ServiceClientGeneratorGeneric`
- `ServiceClientGeneratorGrpc`
- `ServiceClientGeneratorHttp`
- `ServiceServerGeneratorGeneric`
- `ServiceServerGeneratorGrpc`

这意味着：

> 插件不是“启动时选择一种模式，然后只加载那一套逻辑”，而是“统一准备好，再在遍历时按选项分支调用”。

这样做的好处是：

- 架构统一
- 新模式可以在不破坏原主链的前提下插入
- 大部分底层能力可以复用

### 7.2 `only_http` 的分支点在哪里

真正的切换点在 `packages/plugin/src/protobufts-plugin.ts` 的 `if (options.onlyHttp)`。

在标准模式下：

- message 会生成 `MessageType`
- service 会生成标准 `ServiceType`
- 再生成 generic / grpc client 或 server

在 `only_http` 模式下：

- message 仍生成 interface 和 enum
- 但不再生成完整 `MessageType`
- service 改走 `ServiceTypeGeneratorHttp`
- client 改走 `ServiceClientGeneratorHttp`

这说明 `only_http` 不是重写整个插件，而是：

> 复用同一套 descriptor 解释和文件组织基础设施，在“服务和运行时承接方式”上切到另一条分支。

### 7.3 输出文件表为什么重要

`FileTable` 会给每个 proto 文件分配稳定的输出文件名，例如：

- `xxx.ts`
- `xxx.client.ts`
- `xxx.grpc-client.ts`
- `xxx.server.ts`

在 `only_http` 模式下，还会额外补一个汇总文件：

- `http-client.ts`

这意味着生成器关心的不只是“生成什么代码”，还关心“这些代码落在哪个文件里、不同文件如何互相 import”。

---

## 八、HTTP Only 模式的编译期链路

这一节聚焦 `only_http` 这条分支。

### 8.1 触发条件

以 `packages/example-http/Makefile` 为例：

```makefile
npx protoc --proto_path=./protos \
       --proto_path=./third_party \
       --ts_out=. \
       --ts_opt=only_http \
       --ts_opt=long_type_number \
       --ts_opt=use_proto_field_name \
       $(API_PROTO_FILES)
```

只要带上：

```text
--ts_opt=only_http
```

插件内部就会把它解析成：

```ts
options.onlyHttp = true
```

### 8.2 生成目标发生了什么变化

在这条分支里，编译器关注的核心不再是“生成完整 protobuf 消息运行时”，而是：

1. 生成消息 interface 和 enum
2. 生成 HTTP 风格的 `ServiceType`
3. 生成 HTTP client interface
4. 生成 HTTP client implementation
5. 如果有多个 service，再生成聚合的 `HttpClient`

### 8.3 端到端流程图

```text
.proto
  |
  v
protoc
  |
  v
CodeGeneratorRequest
  |
  v
PluginBase.run()
  |
  v
ProtobuftsPlugin.generate()
  |
  |-- parseOptions() / makeInternalOptions()
  |-- DescriptorRegistry.createFrom()
  |-- new Interpreter(...)
  |-- new ServiceTypeGeneratorHttp(...)
  |-- new ServiceClientGeneratorHttp(...)
  |
  v
遍历所有 descriptor
  |
  |-- message -> 生成 interface / enum
  |-- service -> 生成 HTTP ServiceType
  |-- service -> 生成 HTTP Client
  |
  v
额外生成 http-client.ts
```

### 8.4 `google.api.http` 为什么是核心

因为 `only_http` 的路由信息不是靠命名规则猜的，而是直接来自方法 option：

```protobuf
rpc Report(ReportRequest) returns (ReportReply) {
  option (google.api.http) = {
    post: "/v1/rum/report",
    body: "*"
  };
}
```

插件在编译期读取到它后，会把这部分信息放进方法元信息里，供运行时使用。

所以 `only_http` 的本质就是：

> 在编译期把 HTTP 路由语义烘焙进生成代码里。

---

## 九、HTTP ServiceType 是怎么生成出来的

### 9.1 `ServiceTypeGeneratorHttp` 的职责

`packages/plugin/src/code-gen/http-type-generator.ts` 负责生成服务元信息。

生成结果大致长这样：

```ts
export const Rum = new ServiceType("rum.Rum", [
  {
    name: "Report",
    options: {
      "google.api.http": {
        post: "/v1/rum/report",
        body: "*"
      }
    },
    I: { typeName: "ReportRequest" },
    O: { typeName: "ReportReply" }
  }
]);
```

注意这里的 `ServiceType` 是来自 `@protobuf-ts/runtime-http`，不是标准 `runtime-rpc` 的那个版本。

### 9.2 它生成的不是“调用逻辑”，而是“方法元信息”

这个生成器本身不发请求，只负责把 service 信息落盘。

产物里最重要的内容有：

- 服务全名 `typeName`
- 方法数组 `methods`
- 每个方法的 `name / localName / options / I / O`

这些元信息后面会被客户端类拿来调用 `HttpTransport.request()`。

### 9.3 为什么说它是“轻量 ServiceType”

因为在 `only_http` 模式下，`I`、`O` 并不是标准模式里那种完整 `MessageType` 实例，而只是轻量的类型占位信息。

这意味着：

- 它足够让客户端知道“这个方法对应什么输入/输出类型名称”
- 但它不承担标准 protobuf 编解码职责

所以你可以把它理解为：

> 面向 HTTP 客户端的服务元数据对象，而不是完整 RPC 反射对象。

---

## 十、HTTP Client 是怎么生成出来的

### 10.1 `ServiceClientGeneratorHttp` 的四个职责

`packages/plugin/src/code-gen/service-client-generator-http.ts` 主要做四件事：

1. `registerSymbols()`
   - 给接口和实现类注册稳定名称

2. `generateInterface()`
   - 生成 `IxxClient`

3. `generateImplementationClass()`
   - 生成 `xxClient`

4. `generateAllClass()`
   - 生成聚合 `HttpClient`

### 10.2 生成出来的接口长什么样

例如：

```ts
export interface IRumClient {
  report(input: ReportRequest, options?: HttpOptions["requestOptions"]): HttpResult<ReportReply>;
  transforming(input: UploadFile, options?: HttpOptions["requestOptions"]): HttpResult<ReportReply>;
}
```

这里有两个重要信号：

1. 返回值不是标准 `UnaryCall`，而是 `HttpResult<T>`
2. 某些方法会把参数改写成 `UploadFile`

这已经说明它的目标不是标准 RPC 客户端，而是业务 HTTP SDK。

### 10.3 实现类的调用路径

生成出来的实现类大致是：

```ts
export class RumClient implements IRumClient, ServiceInfo {
  methods = Rum.methods;
  public defHttp: HttpTransport;

  constructor(vAxios: VAxios | VAxiosInstance, opt: HttpOptions = {}) {
    this.defHttp = new HttpTransport(vAxios, opt);
  }

  report(input, options) {
    const method = this.methods[0];
    return this.defHttp.request(method, input, options);
  }
}
```

整条调用链非常直接：

1. 业务调用生成的方法
2. 方法根据索引取到对应 `MethodInfo`
3. 交给 `HttpTransport.request()`
4. 由 transport 解析 URL / Method / 上传规则

### 10.4 为什么要生成聚合 `HttpClient`

如果一个 proto 集合里有多个 service，单独 new 多个 client 会比较分散。

于是 `generateAllClass()` 会再生成一个汇总入口：

```ts
export class HttpClient {
  rum: RumClient;
  rum1: Rum1Client;

  constructor(vAxios, opt = {}) {
    this.rum = new RumClient(vAxios, opt);
    this.rum1 = new Rum1Client(vAxios, opt);
  }
}
```

这样业务侧可以把一组服务当成一个 SDK 使用。

---

## 十一、运行时分层：runtime、runtime-rpc、runtime-http 的边界

这一节是新人最应该讲清楚的，因为它体现了项目的分层意识。

### 11.1 `runtime`

负责消息本身：

- 创建默认值
- 反射
- JSON 编解码
- binary 编解码
- equals / clone / merge / is

代表类：

- `MessageType`

### 11.2 `runtime-rpc`

负责标准 RPC 抽象：

- `ServiceType`
- `MethodInfo`
- `RpcTransport`
- unary / streaming call model

它的设计重点是“协议无关的 RPC 统一契约”。

### 11.3 `runtime-http`

负责 `only_http` 分支的轻量运行时：

- `ServiceType`
- `MethodInfo`
- `HttpTransport`
- `HttpResult`
- `HttpOptions`

它的设计重点不是标准 RPC，而是：

- 根据 `google.api.http` 决定 URL
- 根据 option 决定 HTTP 动词
- 根据 `body === "file"` 决定是否走上传逻辑
- 把请求委托给外部注入的 axios 风格实例

### 11.4 为什么不直接复用 `runtime-rpc`

因为两者的建模目标不一致。

`runtime-rpc` 假设的是：

- 统一 RPC transport 接口
- 支持 unary / client streaming / server streaming / duplex
- 支持 protobuf 消息序列化与反序列化

而 `runtime-http` 当前实现假设的是：

- 普通 HTTP 请求即可
- 业务返回结构是统一包裹
- 可能存在上传场景
- 由外部 HTTP 客户端承担真实网络请求

所以从架构上讲，这是“新建一条更薄的运行时分支”，而不是把 `runtime-rpc` 硬改成 HTTP 业务层。

---

## 十二、HttpTransport：运行时真正的执行中心

### 12.1 `HttpTransport` 的定位

`packages/runtime-http/src/rpc-transport.ts` 里的 `HttpTransport` 是 `only_http` 运行时的核心。

生成客户端本身只做一件事：

- 把 `MethodInfo + input + options` 交给它

真正决定 HTTP 请求行为的是 `HttpTransport`。

### 12.2 构造函数说明了它的依赖方式

它支持两种传入方式：

1. 传一个构造器 `VAxios`
2. 传一个现成实例 `VAxiosInstance`

说明这个运行时不打算自己实现网络层，而是把网络层抽象成一个外部依赖。

这是一种典型 adapter 设计。

### 12.3 `request()` 的实际流程

`request()` 大致做以下几步：

1. `makeUrl(method)`
   - 计算请求 URL

2. `makeMethod(method)`
   - 计算 HTTP Method

3. `isUpload(method)`
   - 判断是否为上传

4. 调用外部 HTTP 实现
   - 上传走 `uploadFile()`
   - 普通请求走 `request()`

### 12.4 URL 从哪里来

优先从：

```ts
method.options["google.api.http"]
```

里提取：

- `get`
- `post`
- `put`
- `delete`
- `patch`

如果没有 HTTP 注解，才回退到：

```text
${method.service.typeName}/${lowerCamelCase(method.name)}
```

这说明 `google.api.http` 在这条链路里并不是可选点缀，而是默认主路由来源。

### 12.5 上传为什么是特判

因为当前实现约定：

```ts
method.options["google.api.http"].body === "file"
```

时，调用走上传逻辑，并自动打 `multipart/form-data;charset=UTF-8`。

这其实反映了 `only_http` 的一个明显特征：

> 它不是纯协议抽象，而是已经带有业务 SDK 假设。

### 12.6 返回值模型也体现了业务假设

`packages/runtime-http/src/http-result.ts` 中定义的返回值不是通用 RPC result，而是：

- `code`
- `msg`
- `data`
- `errors`

并且 `HttpResult<T>` 是一个 `Promise<Result<T>>` 风格的包装。

这说明 `runtime-http` 当前更像“面向某类前端 HTTP 接入风格的运行时”，而不是一个完全中立的 HTTP RPC 规范实现。

---

## 十三、example-http：把整条链路串起来看

### 13.1 proto 层长什么样

`packages/example-http/protos/service.proto` 中的 service 定义大致是：

```protobuf
service Rum {
  rpc Report(ReportRequest) returns(ReportReply) {
    option (google.api.http) = {
      post: "/v1/rum/report",
      body: "*",
    };
  }
}
```

这里最重要的信息有三类：

1. service/method 定义
2. 输入输出消息类型
3. `google.api.http` 路由映射

### 13.2 生成后会出现哪些文件

以 `example-http` 为例，关键产物通常包括：

- `message.ts`
  - 消息 interface 和 enum

- `service.ts`
  - HTTP `ServiceType`

- `service.client.ts`
  - 单个 service 的 HTTP client

- `service1.client.ts`
  - 另一个 service 的 HTTP client

- `http-client.ts`
  - 聚合入口

### 13.3 业务调用是怎样落下去的

业务代码大致会这样使用：

```text
new HttpClient(vAxios, opt)
  -> httpClient.rum.report(input)
  -> RumClient.report()
  -> HttpTransport.request()
  -> 根据 google.api.http 得到 POST /v1/rum/report
  -> 调用 vAxios.request()
```

这条链路说明：

- 编译期已经把 method 和 URL 的映射固化到代码里
- 运行时不再重新解析 proto
- 运行时只是读取生成好的元信息

所以整个系统的设计原则很清晰：

> 重逻辑尽量放在编译期，运行时尽量做轻量分发。

---

## 十四、为什么这个项目的设计是合理的

这一节是“看完后能侃侃而谈”的关键部分。

### 14.1 编译期和运行时职责切得很清楚

好的代码生成项目，最怕把所有复杂度都留到运行时。

`protobuf-ts` 的总体方向是：

- 编译期负责理解协议、固化元信息、产出类型和代码
- 运行时负责执行必要动作，不再重新解释 schema

这样做的好处：

- 运行时代码更轻
- 调用路径更直接
- 类型信息更稳定
- 调试更容易

### 14.2 plugin-framework 和 plugin 分离是合理的

如果不拆：

- 描述符树、类型名解析、源码注释读取、TS AST 生成能力都会和具体生成策略耦合在一起

拆开后：

- `plugin-framework` 提供通用插件基础设施
- `plugin` 专注 protobuf-ts 自己的输出策略

这使得仓库不仅在“生成 TS 代码”，还在沉淀“写 protoc 插件的通用能力”。

### 14.3 runtime、runtime-rpc、transport 分层是合理的

如果消息编解码、RPC 抽象、具体协议传输都放在一起，会导致：

- 包体积大
- 职责耦合
- 很难替换 transport

而现在这种分层让它可以做到：

- 只用消息能力时只装 `runtime`
- 做 RPC 时再叠加 `runtime-rpc`
- 需要具体协议时再引入 transport

这是一种很典型的“内核 + 协议适配器”设计。

### 14.4 only_http 能插进来，说明扩展点设计得对

`only_http` 之所以能存在，恰恰证明原工程的扩展点足够清晰：

- 描述符解析层能复用
- 解释器层能复用
- 文件组织和符号系统能复用
- 只需要替换部分 service/client generator 和运行时承接方式

这其实是判断一个代码生成框架是否成熟的重要标准。

---

## 十五、当前 only_http 实现的特征与边界

这一节不是吐槽，而是帮助新人形成真实预期。

### 15.1 它更像“业务 HTTP SDK 生成器”

从当前实现能看出来几个明显特征：

- 返回值模型带业务包裹
- 上传约定写死为 `body === "file"`
- 请求执行依赖外部 `VAxios`
- 消息类型信息是轻量占位，不是完整 `MessageType`

所以它当前更适合被理解为：

> 基于 proto 契约和 HTTP 注解生成前端 SDK 的定制方案。

### 15.2 它不是标准 protobuf RPC 的替代品

如果你的目标是：

- 严格 protobuf binary over HTTP
- 标准 streaming 语义
- 与 gRPC/grpc-web/Twirp 完整对齐

那么标准模式仍然是主路径，`only_http` 不是为这些目标设计的。

### 15.3 它的优点是什么

对于前端业务 SDK 场景，它的优点非常实际：

- 契约统一放在 proto
- URL 和方法签名从注解自动生成
- 减少手写 SDK 和接口漂移
- 可以把多 service 收敛成统一客户端入口

---

## 十六、新人应该怎么读这个仓库

如果你想最快建立完整认知，推荐下面这个阅读顺序。

### 16.1 第一步：先看仓库定位

先看：

- 根目录 `README.md`
- `packages/README.md`

目标不是记命令，而是知道有哪些包、哪些是公开包、哪些是示例。

### 16.2 第二步：理解标准主链

重点读：

- `packages/plugin-framework/src/plugin-base.ts`
- `packages/plugin-framework/src/descriptor-registry.ts`
- `packages/plugin/src/protobufts-plugin.ts`
- `packages/plugin/src/interpreter.ts`
- `packages/runtime/src/message-type.ts`
- `packages/runtime-rpc/src/rpc-transport.ts`

目标是搞清楚：

- 插件怎么吃请求
- 描述符怎么被组织
- 生成器怎么调度
- 标准运行时怎么分层

### 16.3 第三步：再看 only_http 分支

重点读：

- `packages/example-http/Makefile`
- `packages/example-http/protos/*.proto`
- `packages/plugin/src/code-gen/http-type-generator.ts`
- `packages/plugin/src/code-gen/service-client-generator-http.ts`
- `packages/runtime-http/src/rpc-transport.ts`

目标是搞清楚：

- 这条分支是怎么被触发的
- service 和 client 是怎么生成的
- 运行时怎么把方法元信息转成 HTTP 请求

### 16.4 第四步：对照生成结果读

不要只读生成器，也要反过来看生成产物：

- `packages/example-http/message.ts`
- `packages/example-http/service.ts`
- `packages/example-http/service.client.ts`
- `packages/example-http/http-client.ts`

这一步非常重要，因为你最终交付给业务方的不是 generator，而是生成结果。

---

## 十七、如果你要向别人解释这个项目，可以这样讲

下面这段几乎可以直接当你的口头版总结。

### 17.1 30 秒版本

`protobuf-ts` 是一个把 `.proto` 转成 TypeScript 代码的工具链。它前面用 `protoc` + 插件解析描述符，后面用多个 runtime 包承接消息和 RPC。标准模式走完整 protobuf/RPC 语义，而 `only_http` 是在同一套编译基础上分出的一条 HTTP SDK 生成分支，专门读取 `google.api.http` 注解，把 service 方法变成普通 HTTP 客户端调用。

### 17.2 2 分钟版本

整个仓库可以分成三层。第一层是编译期，`plugin-framework` 负责接住 `CodeGeneratorRequest` 并提供描述符分析能力，`plugin` 负责解释描述符并调用不同 generator 产出 TS 文件。第二层是标准运行时，`runtime` 解决消息创建和编解码，`runtime-rpc` 定义统一 RPC 抽象，各种 transport 再把抽象落到 gRPC、grpc-web、Twirp。第三层是定制分支，`only_http` 复用了前面的 descriptor 解析和代码生成框架，但不再生成完整消息运行时，而是生成基于 `google.api.http` 的轻量 HTTP ServiceType 和 Client，再由 `runtime-http` 把方法调用转成 URL、Method、上传逻辑和外部 HTTP 请求。

### 17.3 你应该能回答的几个问题

读完这篇文档后，至少应该能回答：

1. `plugin-framework` 和 `plugin` 的分工是什么？
2. 为什么插件处理的是 `CodeGeneratorRequest` 而不是原始 `.proto` 文本？
3. `DescriptorRegistry` 和 `Interpreter` 分别解决什么问题？
4. 标准模式为什么需要 `runtime` 和 `runtime-rpc` 两层？
5. `only_http` 为什么不直接复用标准 `runtime-rpc`？
6. `google.api.http` 在编译期和运行时分别扮演什么角色？

如果这六个问题都能讲清楚，就已经不是“会用这个项目”，而是“理解这个项目”了。

---

## 十八、关键文件索引

为了方便查阅，下面给一份最有价值的文件清单。

### 全局架构

- `README.md`
- `packages/README.md`

### 编译期基础设施

- `packages/plugin-framework/src/plugin-base.ts`
- `packages/plugin-framework/src/descriptor-registry.ts`
- `packages/plugin-framework/src/descriptor-tree.ts`
- `packages/plugin-framework/src/source-code-info.ts`

### protobuf-ts 主插件

- `packages/plugin/src/protobufts-plugin.ts`
- `packages/plugin/src/interpreter.ts`
- `packages/plugin/src/our-options.ts`

### 标准生成器

- `packages/plugin/src/code-gen/message-interface-generator.ts`
- `packages/plugin/src/code-gen/message-type-generator.ts`
- `packages/plugin/src/code-gen/service-type-generator.ts`
- `packages/plugin/src/code-gen/service-client-generator-generic.ts`

### HTTP Only 生成器

- `packages/plugin/src/code-gen/http-type-generator.ts`
- `packages/plugin/src/code-gen/service-client-generator-http.ts`

### 标准运行时

- `packages/runtime/src/message-type.ts`
- `packages/runtime-rpc/src/service-type.ts`
- `packages/runtime-rpc/src/rpc-transport.ts`

### HTTP Only 运行时

- `packages/runtime-http/src/service-type.ts`
- `packages/runtime-http/src/reflection-info.ts`
- `packages/runtime-http/src/rpc-transport.ts`
- `packages/runtime-http/src/http-result.ts`

### 示例

- `packages/example-http/Makefile`
- `packages/example-http/protos/service.proto`
- `packages/example-http/protos/message.proto`
- `packages/example-http/service.ts`
- `packages/example-http/service.client.ts`
- `packages/example-http/http-client.ts`

---

## 十九、结论

如果只记最后三句话，请记这三句：

1. `protobuf-ts` 的核心不是某个运行时函数，而是“描述符解释 + 多阶段代码生成 + 运行时分层”这套体系。
2. `only_http` 不是独立项目，而是复用同一套生成基础设施后，切换生成目标和运行时承接方式的一条分支。
3. 这个仓库最值得学习的地方，不只是它支持 protobuf，而是它把“插件基础设施、生成策略、运行时协议适配”拆成了清晰可扩展的层次。
