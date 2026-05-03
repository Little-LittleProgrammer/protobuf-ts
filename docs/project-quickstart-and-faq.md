# protobuf-ts 项目速览、原理与常见问题

这篇文档是快速读懂项目用的。

如果你只想在较短时间内讲清楚这个仓库，可以按这条主线记：

> `protobuf-ts` 是一个把 `.proto` 契约转换成 TypeScript 类型、消息运行时代码和 RPC/HTTP 客户端代码的工具链。它前半段靠 `protoc` 和插件生成代码，后半段靠 runtime 包承接消息编解码、RPC 调用或 HTTP 调用。

---

## 1. 这个项目是什么

`protobuf-ts` 不是单一运行时库，而是一个 monorepo。

它主要解决三类问题：

1. 把 `.proto` 里的 message、enum、service 生成 TypeScript 代码。
2. 让生成代码具备 protobuf 消息能力，例如二进制编解码、JSON 编解码、默认值创建、反射信息。
3. 为 service 生成可调用的客户端或服务端代码，例如 gRPC、grpc-web、Twirp，以及当前仓库扩展出的 `only_http` HTTP SDK 模式。

可以把它理解成：

```text
.proto 契约
  -> protoc 解析
  -> @protobuf-ts/plugin 生成 TypeScript
  -> runtime / runtime-rpc / runtime-http 承接运行时能力
  -> 业务代码调用生成物
```

---

## 2. 仓库里最重要的几层

### 2.1 编译期：负责生成代码

编译期发生在执行 `protoc` 的时候。

关键包：

- `packages/plugin-framework`
- `packages/plugin`

`plugin-framework` 负责插件基础设施，比如接收 `CodeGeneratorRequest`、组织 descriptor、提供类型查找和源码注释能力。

`plugin` 负责真正的生成策略，比如解析参数、调用 `Interpreter`、选择生成器、输出 TypeScript 文件。

一句话：

> 编译期解决“怎么把 proto 描述符翻译成 TypeScript 文件”。

### 2.2 标准运行时：负责消息和 RPC

关键包：

- `packages/runtime`
- `packages/runtime-rpc`
- `packages/grpc-transport`
- `packages/grpcweb-transport`
- `packages/twirp-transport`

`runtime` 负责 protobuf 消息能力，例如 `MessageType`、二进制编解码、JSON 编解码。

`runtime-rpc` 负责 RPC 抽象，例如 service、method、transport、call 的统一模型。

各类 transport 再把统一 RPC 抽象落到具体协议，比如 gRPC、grpc-web、Twirp。

一句话：

> 标准运行时解决“生成出来的消息和 RPC 客户端怎么真正跑起来”。

### 2.3 only_http 运行时：负责普通 HTTP SDK

关键包：

- `packages/runtime-http`
- `packages/example-http`

`runtime-http` 是 `only_http` 模式的运行时承接层。它不追求完整 protobuf RPC 语义，而是根据生成物里的 `google.api.http` 元信息组装普通 HTTP 请求。

一句话：

> `runtime-http` 解决“怎么把生成的 HTTP client 方法调用变成 URL、Method 和请求配置”。

---

## 3. 核心原理：为什么要分编译期和运行时

`.proto` 是接口契约，但业务代码不能直接执行 `.proto`。

所以项目要分两步：

第一步是编译期：

```text
读取 proto 描述符
  -> 分析 message / enum / service / method / options
  -> 生成 TypeScript 文件
```

第二步是运行时：

```text
业务代码 import 生成文件
  -> 创建消息或调用 client 方法
  -> runtime 包完成编解码、RPC 调用或 HTTP 请求适配
```

这样拆的好处是：

- 生成期可以做复杂的类型分析和代码输出。
- 运行时不需要再读 `.proto` 文件。
- 业务代码拿到的是普通 TypeScript 类型和类。
- 不同协议可以共用同一套 proto 解释和生成基础设施。

可以这样讲：

> `protoc + plugin` 把契约变成代码，`runtime` 让这些代码在业务里可执行。

---

## 4. 标准模式怎么工作

标准模式面向 protobuf 和 RPC。

它通常生成：

- 消息接口
- 枚举
- `MessageType`
- 标准 `ServiceType`
- generic client
- grpc client
- server 定义

运行时依赖：

- `@protobuf-ts/runtime`
- `@protobuf-ts/runtime-rpc`
- 具体 transport 包

调用链可以简化成：

```text
业务代码调用生成的 RPC client
  -> client 按 service/method 找到元信息
  -> runtime-rpc 建立统一 RPC 调用模型
  -> transport 发 gRPC / grpc-web / Twirp 请求
  -> runtime 解码响应消息
```

标准模式适合需要完整 protobuf/RPC 能力的场景。

---

## 5. only_http 模式怎么工作

`only_http` 是 `@protobuf-ts/plugin` 里的一个生成开关，通过参数打开：

```text
--ts_opt=only_http
```

它的目标不是生成标准 gRPC 客户端，而是生成普通 HTTP SDK。

它主要依赖 proto 方法上的 `google.api.http` 注解：

```proto
rpc Report(ReportRequest) returns(ReportReply) {
  option (google.api.http) = {
    post: "/v1/rum/report"
    body: "*"
  };
}
```

这段注解把 RPC 方法补充成了 HTTP 路由：

```text
ReportRequest -> POST /v1/rum/report -> ReportReply
```

`only_http` 模式通常生成：

- `message.ts`：请求和响应类型。
- `service.ts`：HTTP 专用 `ServiceType`，保存方法元信息和 `google.api.http`。
- `service.client.ts`：单个 service 的 HTTP client。
- `http-client.ts`：多个 service client 的聚合入口。

运行时调用链可以简化成：

```text
业务代码调用 httpClient.rum.report(input)
  -> RumClient.report()
  -> HttpTransport.request(method, input, options)
  -> 从 method.options["google.api.http"] 取 URL 和 Method
  -> 调用外部 vAxios.request() 或 vAxios.uploadFile()
```

一句话：

> `only_http` 是把 proto service 和 `google.api.http` 翻译成类型安全的 TypeScript HTTP SDK。

---

## 6. 一次 only_http 调用的完整过程

以 `Report` 方法为例：

```text
1. proto 里声明 ReportRequest、ReportReply 和 Report 方法
2. Report 方法上写 google.api.http，声明 POST /v1/rum/report
3. protoc 把 proto 解析成 CodeGeneratorRequest
4. @protobuf-ts/plugin 读取 descriptor 和 options
5. only_http 分支生成 service.ts 和 service.client.ts
6. service.ts 保存 google.api.http 到 MethodInfo.options
7. service.client.ts 生成 RumClient.report(input)
8. 业务代码调用 httpClient.rum.report(input)
9. RumClient.report() 取出对应 MethodInfo
10. HttpTransport 根据 google.api.http 计算 URL 和 Method
11. 普通请求调用 vAxios.request()
12. 上传请求调用 vAxios.uploadFile()
13. 返回 HttpResult<ReportReply>
```

这条链路里最重要的点是：

- 运行时不会读 `.proto` 文件。
- `google.api.http` 已经在编译期写入生成物。
- 生成的 client 只是强类型门面。
- 真正的 HTTP 请求配置由 `HttpTransport` 生成。
- 真正发网络请求的是外部注入的 `vAxios`。

---

## 7. 常用文件索引

快速看项目时，可以按这个顺序读。

### 7.1 项目入口

- `README.md`
- `packages/README.md`
- `docs/http-only-mode.md`

### 7.2 编译期

- `packages/plugin-framework/src/plugin-base.ts`
- `packages/plugin-framework/src/descriptor-registry.ts`
- `packages/plugin/src/protobufts-plugin.ts`
- `packages/plugin/src/our-options.ts`
- `packages/plugin/src/interpreter.ts`

### 7.3 标准生成器

- `packages/plugin/src/code-gen/message-interface-generator.ts`
- `packages/plugin/src/code-gen/message-type-generator.ts`
- `packages/plugin/src/code-gen/service-type-generator.ts`
- `packages/plugin/src/code-gen/service-client-generator-generic.ts`

### 7.4 only_http 生成器

- `packages/plugin/src/code-gen/http-type-generator.ts`
- `packages/plugin/src/code-gen/service-client-generator-http.ts`

### 7.5 only_http 运行时

- `packages/runtime-http/src/service-type.ts`
- `packages/runtime-http/src/reflection-info.ts`
- `packages/runtime-http/src/rpc-transport.ts`
- `packages/runtime-http/src/http-result.ts`

### 7.6 only_http 示例

- `packages/example-http/Makefile`
- `packages/example-http/protos/service.proto`
- `packages/example-http/service.ts`
- `packages/example-http/service.client.ts`
- `packages/example-http/http-client.ts`

---

## 8. 常见问题 FAQ

### Q1：protobuf-ts 是 protobuf 运行时库，还是代码生成器？

两者都是。

它既有 `@protobuf-ts/plugin` 这种代码生成器，也有 `@protobuf-ts/runtime`、`@protobuf-ts/runtime-rpc` 这种运行时包。

更准确地说，它是：

```text
protoc 插件 + TypeScript 生成器 + protobuf/runtime/RPC 支撑库
```

### Q2：插件直接读取 .proto 文本吗？

不是。

`protoc` 会先把 `.proto` 解析成 `CodeGeneratorRequest`，插件读取的是结构化 descriptor。

所以生成器不是靠字符串搜索，而是遍历 message、enum、service、method 等描述符对象。

### Q3：为什么运行时不需要再读 proto？

因为编译期已经把必要信息写进生成的 TypeScript 文件。

例如 `only_http` 模式会把 `google.api.http` 写入 `service.ts` 的方法 options 中。运行时只需要读取这些生成后的对象。

### Q4：标准模式和 only_http 怎么选？

如果你要完整 protobuf/RPC 能力，选标准模式。

适合场景：

- gRPC
- grpc-web
- Twirp
- protobuf 二进制编解码
- streaming
- 标准 RPC 抽象

如果你要基于 proto 生成普通 HTTP SDK，选 `only_http`。

适合场景：

- 前端调用普通 HTTP API
- 后端已经用 `google.api.http` 描述 REST 路由
- 希望从 proto 自动生成类型和 client
- 不需要完整 gRPC 运行模型

### Q5：only_http 是不是把 gRPC transport 改成 HTTP？

不是。

它不是标准 gRPC 的 HTTP 版本，而是另一条生成目标：

```text
proto service + google.api.http -> TypeScript HTTP SDK
```

所以它更像 SDK 生成方案，不是通用 RPC transport 替代品。

### Q6：google.api.http 为什么这么重要？

纯 RPC 方法只说明输入和输出：

```text
ReportRequest -> ReportReply
```

普通 HTTP 调用还需要 URL 和 Method：

```text
POST /v1/rum/report
```

`google.api.http` 正好提供这层映射，所以 `only_http` 才能知道该请求哪个地址、使用哪个 HTTP 动词。

### Q7：生成的 service.ts 有什么用？

它保存服务和方法元信息。

在 `only_http` 模式下，最关键的是保存：

```ts
options: {
  "google.api.http": {
    post: "/v1/rum/report",
    body: "*"
  }
}
```

运行时的 `HttpTransport` 会根据这部分信息计算 URL 和 Method。

### Q8：生成的 service.client.ts 有什么用？

它提供单个 service 的强类型 client。

例如：

```ts
httpClient.rum.report(input)
```

会进入生成的 `RumClient.report()`，再委托给 `HttpTransport.request()`。

### Q9：http-client.ts 有什么用？

它是聚合入口。

如果项目里有多个 service，`http-client.ts` 会把多个 service client 挂到一个 `HttpClient` 下面，业务代码只需要创建一个总入口。

### Q10：HttpTransport 是真正的网络库吗？

不是。

`HttpTransport` 负责把方法元信息翻译成 HTTP 请求配置。真正发请求的是外部传入的 `vAxios`。

分工是：

```text
生成 client：提供强类型方法
HttpTransport：计算 URL、Method、上传逻辑
vAxios：真正发 HTTP 请求
```

### Q11：vAxios 必须是 axios 吗？

不一定。

它只要满足 `runtime-http` 需要的接口即可，例如提供：

- `request()`
- `uploadFile()`

可以是 axios 封装，也可以是团队自己的 HTTP 工具。

### Q12：only_http 的上传是怎么判断的？

当前实现里使用项目约定：

```text
google.api.http.body === "file"
```

如果满足这个条件，生成器会把输入类型改成 `UploadFile`，运行时会调用 `vAxios.uploadFile()`。

这不是 `google.api.http` 标准里的通用上传规范，而是当前项目对 HTTP mode 的约定。

### Q13：普通请求的参数放在哪里？

当前 `HttpTransport.request()` 普通请求会把 input 放到请求配置的 `params` 字段。

这说明当前实现没有完整区分 query/body/path 参数映射，而是把更多解释交给下层 HTTP 封装或团队约定。

### Q14：only_http 支持完整 google.api.http 语义吗？

当前不是完整支持。

主要使用：

- `get`
- `post`
- `put`
- `delete`
- `patch`
- `body`

复杂能力例如路径变量替换、`additional_bindings`、细粒度 body 字段映射，并不是当前实现的完整主线。

### Q15：为什么 only_http 不直接复用 runtime-rpc？

因为抽象目标不同。

`runtime-rpc` 面向标准 RPC 调用模型，要处理 unary、streaming、metadata、status、transport 抽象。

`runtime-http` 面向普通 HTTP SDK，只需要根据 `google.api.http` 生成 URL、Method、上传判断，然后委托外部 HTTP 库。

强行复用会让两边职责混在一起。

### Q16：这个项目最值得学习的设计点是什么？

最值得学习的是分层：

- `protoc` 负责解析 proto。
- `plugin-framework` 负责插件基础设施。
- `plugin` 负责解释 descriptor 并生成代码。
- `runtime` 负责消息运行时。
- `runtime-rpc` 负责标准 RPC 抽象。
- `runtime-http` 负责 HTTP SDK 分支。
- transport 包负责具体协议落地。

这种拆法让项目可以在同一套 proto 生成基础上支持不同运行目标。

---

## 9. 30 秒口头总结

`protobuf-ts` 是一个面向 TypeScript 的 protobuf 工具链。它通过 `protoc` 插件读取 proto 描述符，生成消息类型、运行时代码和 service client。标准模式走 `runtime`、`runtime-rpc` 和 gRPC/grpc-web/Twirp transport；`only_http` 模式则读取 `google.api.http` 注解，生成普通 HTTP SDK，再由 `runtime-http` 的 `HttpTransport` 把方法调用翻译成 URL、Method 和外部 HTTP 请求。

---

## 10. 3 分钟讲解版本

这个仓库可以按“编译期”和“运行时”理解。编译期由 `protoc` 把 `.proto` 解析成 `CodeGeneratorRequest`，然后 `@protobuf-ts/plugin` 遍历 descriptor，生成 TypeScript 文件。运行时则由生成代码配合不同 runtime 包完成消息处理或服务调用。

标准模式下，生成器会输出消息接口、`MessageType`、标准 `ServiceType` 和各类 RPC client/server。业务调用时，`runtime` 负责 protobuf 消息编解码，`runtime-rpc` 提供统一 RPC 抽象，具体 transport 把调用发到 gRPC、grpc-web 或 Twirp。

`only_http` 是同一个插件里的 HTTP SDK 生成分支。它通过 `--ts_opt=only_http` 打开，重点读取 proto 方法上的 `google.api.http`。生成时，它会把 URL、HTTP Method、body 等信息写进 `service.ts` 的方法 options 中，同时生成 `service.client.ts` 和聚合的 `http-client.ts`。

运行时调用 `httpClient.rum.report(input)` 时，生成的 client 会取出对应 `MethodInfo`，交给 `HttpTransport.request()`。`HttpTransport` 从 `method.options["google.api.http"]` 计算 URL 和 Method，判断是否上传，然后调用外部注入的 `vAxios.request()` 或 `vAxios.uploadFile()`。所以 `only_http` 的本质不是标准 gRPC transport，而是用 proto 契约生成类型安全的普通 HTTP SDK。

---

## 11. 最后记住三句话

1. `protobuf-ts` 的核心是“proto 描述符解释 + TypeScript 代码生成 + 运行时分层”。
2. 标准模式服务于 protobuf/RPC，`only_http` 模式服务于普通 HTTP SDK。
3. `google.api.http` 是 `only_http` 的关键桥梁，它把 RPC 方法映射成 HTTP URL 和 Method。
