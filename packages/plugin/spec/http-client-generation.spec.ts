import {CodeGeneratorRequest, FileDescriptorProto, GeneratedFile, setupCompiler} from '@protobuf-ts/plugin-framework';
import * as ts from 'typescript';
import {ProtobuftsPlugin} from '../src/protobufts-plugin';
import * as path from 'path';

function proto(filename: string, packageName: string, serviceName?: string, methodNames = ['Get']): FileDescriptorProto {
    return FileDescriptorProto.create({
        name: filename,
        package: packageName,
        syntax: 'proto3',
        messageType: [{name: 'Request'}, {name: 'Response'}],
        service: serviceName ? [{
            name: serviceName,
            method: methodNames.map(name => ({
                name,
                inputType: `.${packageName}.Request`,
                outputType: `.${packageName}.Response`,
            })),
        }] : [],
    });
}

function generate(files: FileDescriptorProto[], fileToGenerate: string[], parameter = 'only_http') {
    const request = CodeGeneratorRequest.create({protoFile: files, fileToGenerate, parameter});
    return new ProtobuftsPlugin('test').generate(request)
        .filter(file => file.getContent())
        .map(file => ({name: file.getFilename(), content: file.getContent()}));
}

describe('only_http aggregation', () => {
    const version3 = proto('desktop/v3/book.proto', 'desktop.v3', 'BookService');
    const version4 = proto('desktop/v4/book.proto', 'desktop.v4', 'BookService');

    it('separates same-named services by their protobuf packages', () => {
        const files = generate([version3, version4], [version3.name!, version4.name!]);
        const client = files.find(file => file.name === 'http-client.ts')!.content;
        expect(client).toContain('desktop: {');
        expect(client).toContain('v3: {');
        expect(client).toContain('v4: {');
        expect(client).toContain('bookService: BookServiceClient');
        expect(client).not.toMatch(/^    bookService:/m);
        expect(client).toContain('this.desktop = {');
        expect(client).toContain('@generated from protobuf file "desktop/v3/book.proto"');
        const root = files.find(file => file.name === 'index.ts')!.content;
        expect(root).toContain('export * as desktop from "./__proto_packages/desktop"');
        expect(root).toContain('export { HttpClient } from "./http-client"');
        expect(root).not.toContain('export * from "./desktop/v3/book"');
        expect(files.find(file => file.name === '__proto_packages/desktop/index.ts')!.content).toContain('export * as v4 from "./v4"');
        expect(files.find(file => file.name === '__proto_packages/desktop/v3/index.ts')!.content).toContain('export * from "../../../desktop/v3/book"');
    });

    it('omits services from imported but ungenerated files', () => {
        const files = generate([version3, version4], [version3.name!]);
        const client = files.find(file => file.name === 'http-client.ts')!.content;
        expect(client).toContain('v3: {');
        expect(client).not.toContain('v4: {');
        expect(client).not.toContain('desktop/v4/book.client');
    });

    it('does not create an aggregate when no clients are emitted', () => {
        const message = proto('message.proto', 'only.message');
        for (const [files, names, parameter] of [
            [[message], ['message.proto'], 'only_http'],
            [[version3], [version3.name!], 'only_http,force_client_none'],
            [[version3], [version3.name!], 'only_http,force_disable_services'],
        ] as const) {
            expect(generate([...files], [...names], parameter).some(file => file.name === 'http-client.ts')).toBe(false);
        }
    });

    it('allows an RPC named DefHttp without replacing its transport', () => {
        const service = proto('method.proto', 'methods', 'MethodService', ['DefHttp']);
        const client = generate([service], [service.name!]).find(file => file.name === 'method.client.ts')!.content;
        expect(client).toContain('defHttp(input:');
        expect(client).toContain('private _httpTransport: HttpTransport');
        expect(client).toContain('this._httpTransport.request');
    });

    it('rejects two RPC names that normalize to the same method', () => {
        const service = proto('method.proto', 'methods', 'MethodService', ['FooBar', 'Foo_Bar']);
        expect(() => generate([service], [service.name!])).toThrowError(/methods\.MethodService\.FooBar.*methods\.MethodService\.Foo_Bar/);
    });

    it('rejects an output filename already owned by a proto', () => {
        const service = proto('http-client.proto', 'example', 'ExampleService');
        expect(() => generate([service], [service.name!])).toThrowError(/http-client\.ts.*proto output/);
    });

    it('rejects an output filename already owned by the namespace index', () => {
        const service = proto('index.proto', 'example', 'ExampleService');
        expect(() => generate([service], [service.name!])).toThrowError(/index\.ts.*proto output/);
    });

    it('emits namespace entrypoints for JavaScript output as well', () => {
        const files = generate([version3], [version3.name!], 'only_http,output_javascript');
        expect(files.some(file => file.name === 'index.js')).toBe(true);
        expect(files.some(file => file.name === 'index.d.ts')).toBe(true);
        expect(files.some(file => file.name === '__proto_packages/desktop/v3/index.js')).toBe(true);
    });

    it('type-checks a consumer of both package namespaces without skipLibCheck', () => {
        const generated = new ProtobuftsPlugin('test').generate(CodeGeneratorRequest.create({
            protoFile: [version3, version4],
            fileToGenerate: [version3.name!, version4.name!],
            parameter: 'only_http',
        }));
        const consumer: GeneratedFile = {
            getFilename: () => 'consumer.ts',
            getContent: () => 'import {HttpClient, desktop} from "./index"; declare const client: HttpClient; client.desktop.v3.bookService.get({}); client.desktop.v4.bookService.get({}); desktop.v3.BookService.typeName; desktop.v4.BookService.typeName;',
        };
        const files = [...generated, consumer];
        const [program] = setupCompiler({
            strict: true,
            skipLibCheck: false,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            baseUrl: '.',
            paths: {
                '@protobuf-ts/runtime': ['../runtime/src/index'],
                '@protobuf-ts/runtime-http': ['../runtime-http/src/index'],
            },
        }, files, files.map(file => file.getFilename()));
        const errors = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
        expect(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n'))).toEqual([]);
    });

    it('keeps both same-named services callable at runtime', async () => {
        const generated = generate([version3, version4], [version3.name!, version4.name!]);
        const code = new Map(generated.filter(file => file.name.endsWith('.ts')).map(file => [
            file.name.replace(/\.ts$/, '.js'),
            ts.transpileModule(file.content, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015}}).outputText,
        ]));
        const modules = new Map<string, {exports: any}>();
        const load = (filename: string): any => {
            const cached = modules.get(filename);
            if (cached) return cached.exports;
            const source = code.get(filename);
            if (!source) throw new Error(`Missing generated module ${filename}`);
            const module = {exports: {}};
            modules.set(filename, module);
            new Function('require', 'module', 'exports', source)((importName: string) => {
                if (!importName.startsWith('.')) return require(importName);
                const target = path.posix.normalize(path.posix.join(path.posix.dirname(filename), importName));
                return load(code.has(target + '.js') ? target + '.js' : target + '/index.js');
            }, module, module.exports);
            return module.exports;
        };
        const sdk = load('index.js');
        const calls: string[] = [];
        const client = new sdk.HttpClient({
            request: (config: {url: string}) => { calls.push(config.url); return Promise.resolve({code: 200, data: {}, msg: 'ok'}); },
            uploadFile: () => { throw new Error('unexpected upload'); },
        });
        await client.desktop.v3.bookService.get({});
        await client.desktop.v4.bookService.get({});
        expect(calls).toEqual(['desktop.v3.BookService/get', 'desktop.v4.BookService/get']);
        expect(sdk.desktop.v3.BookService.typeName).toBe('desktop.v3.BookService');
        expect(sdk.desktop.v4.BookService.typeName).toBe('desktop.v4.BookService');
        expect(sdk.BookService).toBeUndefined();
        expect(client.bookService).toBeUndefined();
    });
});
