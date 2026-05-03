@protobuf-ts/plugin-framework
=============================

一个用于使用 TypeScript 创建 protoc 插件的框架。

Google Protocol Buffer 编译器 (protoc) 拥有一个插件系统。通过 
protoc 插件，可以为 .proto 文件生成任何语言的代码，而不仅仅是 
protoc 直接支持的语言。 

protoc 插件通过 stdin 接收 `CodeGeneratorRequest`（一个 protobuf 消息），
并通过 stdout 返回 `CodeGeneratorResponse`。 
 
本框架旨在让使用 TypeScript 编写 protoc 插件变得尽可能简单。它对生成 
TypeScript 代码提供了特别支持，但也可用于生成其他语言的代码。 



### 特性

- 提供符号表，可用于跟踪任何语言中生成的类型 
  
- 对使用 TypeScript 编译器 API 生成 TypeScript 代码提供特别支持。
  例如，它提供了一个简单的 API 来从包或符号表中导入对象。

- 提供插件基类，支持参数、错误处理、支持的特性以及简单的设置。

- 构建描述符树，从而可以轻松查找嵌套消息的父级等。

- 构建查找对象，以便查找给定类型名称的描述符 

- 提供字符串格式化对象，可以像用户输入那样打印消息字段。
  
- 提供源代码注释查找功能，可用于轻松查找 .proto 中给定元素的注释

- 提供便捷方法，用于检查字段是否被声明为 optional 或作为 oneof 成员 


### 入门指南

- 查看 [descriptor.proto](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/descriptor.proto)
  和 [plugin.proto](https://github.com/protocolbuffers/protobuf/blob/master/src/google/protobuf/compiler/plugin.proto) 的类型和注释，
  以熟悉 protoc 的插件系统。
- 查看 `descriptor-registry.ts`，看看它是否能帮助你处理编译器发送给你的描述符 proto。
- 查看 `plugin-base.ts`，了解一个可以帮助处理一些基础工作的基类。
- 查看使用本框架的 [protobuf-ts](https://github.com/timostamm/protobuf-ts/) 的源代码。    


### 版权

- 文件 [plugin.ts](https://github.com/timostamm/protobuf-ts/blob/master/packages/plugin-framework/src/google/protobuf/compiler/plugin.ts) 和 [descriptor.ts](https://github.com/timostamm/protobuf-ts/blob/master/packages/plugin-framework/src/google/protobuf/descriptor.ts) 版权归 2008 Google Inc. 所有，采用 BSD-3-Clause 许可证授权
- 所有其他文件均采用 Apache-2.0 许可证授权，详见 [LICENSE](https://github.com/timostamm/protobuf-ts/blob/master/packages/plugin-framework/LICENSE)。 

