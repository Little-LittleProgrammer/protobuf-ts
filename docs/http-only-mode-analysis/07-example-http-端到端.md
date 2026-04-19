# example-http 端到端分析

## 1. 为什么这个示例最重要

`packages/example-http` 是理解 `only_http` 模式的最好入口。

因为它完整覆盖了：

- proto 定义
- 生成命令
- 生成产物
- 最终 SDK 形态

相比只读设计文档，这个目录直接展示了真实输出。

## 2. proto 定义

示例服务定义在：

- `packages/example-http/protos/service.proto`
- `packages/example-http/protos/service1.proto`

其中 `service.proto` 里定义了两个方法：

- `Report`
- `transforming`

前者是普通 POST，后者是上传。

```proto
rpc Report(ReportRequest) returns(ReportReply) {
  option (google.api.http) = {
    post: "/v1/rum/report",
    body: "*",
  };
}

rpc transforming(ReportRequest) returns(ReportReply) {
  option (google.api.http) = {
    post: "/v1/rum/transforming",
    body: "file",
  };
}
```

## 3. 生成命令

`Makefile` 里的生成命令说明了几个事实：

- 开启了 `only_http`
- 把 long 转成 `number`
- 保留 proto 原字段名

因此生成的消息接口更偏向“直接服务前端业务对象”的风格。

## 4. 生成出的 message.ts

`message.ts` 里只包含：

- `ReportRequest`
- `ReportReply`
- 内部嵌套结构
- 枚举

这说明在 `only_http` 模式下，消息的主要价值是类型声明，而不是消息对象运行时能力。

## 5. 生成出的 service.ts

`service.ts` 中的 `Rum` 是一个 `ServiceType` 实例。

它把服务名和方法元信息固定下来，方法信息里保留：

- `name`
- `google.api.http`
- `I`
- `O`

运行时 client 再从这里读取方法数组。

## 6. 生成出的 service.client.ts

`service.client.ts` 才是业务最直接会用到的文件。

例如：

```ts
report(input: ReportRequest, options?: HttpOptions["requestOptions"]): HttpResult<ReportReply>;
transforming(input: UploadFile, options?: HttpOptions["requestOptions"]): HttpResult<ReportReply>;
```

这里能直接看出：

- `Report` 保持原始请求类型
- `transforming` 被转成 `UploadFile`

这正是 `body === "file"` 规则生效后的结果。

## 7. 生成出的 http-client.ts

由于示例里有多个 service，所以生成了聚合入口：

```ts
export class HttpClient {
  rum: RumClient;
  rum1: Rum1Client;
}
```

这样业务方只需要构造一次：

```ts
const client = new HttpClient(vAxios, opt);
```

就可以访问多个服务客户端。

## 8. 端到端调用过程

如果用 `Report` 方法举例，完整调用过程是：

1. 业务调用 `client.rum.report(input)`
2. `RumClient.report()` 取 `this.methods[0]`
3. 调 `this.defHttp.request(method, input, opt)`
4. `HttpTransport.makeUrl()` 得到 `/v1/rum/report`
5. `HttpTransport.makeMethod()` 得到 `POST`
6. 调 `vAxios.request({ url, method, params: input }, opt)`

如果用上传方法 `transforming`：

1. 业务调用 `client.rum.transforming(fileInput)`
2. `RumClient.transforming()` 取 `this.methods[1]`
3. 调 `HttpTransport.request()`
4. `isUpload()` 判定为 `true`
5. 调 `vAxios.uploadFile(...)`

## 9. 这个示例说明了什么

这个示例说明 `only_http` 模式的设计目标非常明确：

- 用 proto 定义前后端接口契约
- 用 `google.api.http` 定义路由与请求方式
- 自动生成前端可直接消费的 HTTP SDK

它不是标准 RPC demo，而是面向业务接入的 SDK 生成 demo。
