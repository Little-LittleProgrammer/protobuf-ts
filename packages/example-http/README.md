# HTTP 命名冲突样例

此包的 proto 同时覆盖：`desktop.v3` / `desktop.v4` 同名 `BookService` 与 `EmptyResp`，相同目录但不同 package 的 `ReportService`，以及同包拆文件的 `rum` 服务。生成入口按 **proto package** 分层，而不是按目录分层；预期调用为 `client.desktop.v3.bookService`、`client.desktop.v4.bookService`，不提供根级 `BookService` 或 `client.bookService`。

在仓库根目录运行（使用 `.nvmrc` 对应的 mise Node）：

```sh
mise exec -- make -C packages/example-http collision-check
```

`protos/` 是示例的唯一 SDK 源码；`npm run build` 会先将其生成为被忽略的 `generated/`，再把 `example-http.cjs.min.js`、`example-http.esm.min.js` 和声明文件打到被忽略的 `dist/`。无须提交生成的 TypeScript。`npm pack --pack-destination artifacts` 可将构建结果打成 tarball（不包含 `generated/` 或测试脚本）。

检查会重新构建插件、生成样例、构建 CJS/ESM/声明文件，然后核对 Node 原生加载的 CJS/ESM 导出与 fake transport 调用、`skipLibCheck: false` 的 TypeScript 消费者，以及以下临时 proto 的成功或预期失败：仅导入未输出、纯消息、禁用客户端/服务、JS 声明、同包跨目录、无 package、关键字 package、RPC/服务名规范化碰撞、属性与子 package 碰撞、聚合文件/入口文件名碰撞、根导出碰撞和 proto 自身的同名符号。临时 proto 会在运行后清理。
