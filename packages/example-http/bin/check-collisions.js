const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const {pathToFileURL} = require('url');
const ts = require('typescript');

const exampleRoot = path.resolve(__dirname, '..');
const plugin = path.resolve(exampleRoot, '../plugin/bin/protoc-gen-ts');
const dist = path.join(exampleRoot, 'dist');
const basicProto = (packageName, services = 'service ExampleService { rpc Get(Req) returns (Resp); }') =>
    `syntax = "proto3"; package ${packageName}; message Req {} message Resp {} ${services}`;

function compileConsumer(source, workspace) {
    const filename = path.join(workspace, 'consumer.ts');
    fs.writeFileSync(filename, source);
    const program = ts.createProgram([filename], {
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        target: ts.ScriptTarget.ES2017,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        types: [],
    });
    return ts.getPreEmitDiagnostics(program)
        .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
        .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

async function checkBundle(workspace) {
    assert.strictEqual(fs.existsSync(path.join(dist, '@protobuf-ts')), false);
    const sdk = require(path.join(dist, 'example-http.cjs.min.js'));
    const expectedExports = ['HttpClient', 'analytics', 'desktop', 'finance', 'google', 'rum'];
    assert.deepStrictEqual(Object.keys(sdk).sort(), expectedExports.sort());
    for (const name of ['BookService', 'EmptyResp', 'ReportService']) {
        assert.strictEqual(sdk[name], undefined);
    }
    assert.strictEqual(sdk.desktop.v3.BookService.typeName, 'desktop.v3.BookService');
    assert.strictEqual(sdk.desktop.v4.BookService.typeName, 'desktop.v4.BookService');
    assert.strictEqual(sdk.finance.v1.ReportService.typeName, 'finance.v1.ReportService');
    assert.strictEqual(sdk.analytics.v1.ReportService.typeName, 'analytics.v1.ReportService');
    assert.ok(sdk.rum.Rum && sdk.rum.Rum1);

    const esmFilename = path.join(dist, `.collision-${process.pid}.mjs`);
    let esm;
    try {
        fs.copyFileSync(path.join(dist, 'example-http.esm.min.js'), esmFilename);
        esm = await import(pathToFileURL(esmFilename).href);
    } finally {
        if (fs.existsSync(esmFilename)) fs.unlinkSync(esmFilename);
    }
    assert.deepStrictEqual(Object.keys(esm).sort(), expectedExports);

    const entrypoint = path.join(dist, 'types/index');
    const types = `import {HttpClient, desktop, analytics, finance, rum} from ${JSON.stringify(entrypoint)};
declare const client: HttpClient;
client.desktop.v3.bookService.get({});
client.desktop.v3.bookService.defHttp({});
client.desktop.v4.bookService.get({});
client.analytics.v1.reportService.get({});
client.finance.v1.reportService.get({});
client.rum.rum.report({} as rum.ReportRequest);
client.rum.rum1.reportAbc({} as rum.ReportRequest);
const v3: desktop.v3.EmptyResp = {};
const v4: desktop.v4.EmptyResp = {};
const analyticsResponse: analytics.v1.EmptyResp = {};
const financeResponse: finance.v1.EmptyResp = {};
void [v3, v4, analyticsResponse, financeResponse];`;
    assert.deepStrictEqual(compileConsumer(types, workspace), []);
    const legacyErrors = compileConsumer(
        `import {HttpClient, BookService} from ${JSON.stringify(entrypoint)};
declare const client: HttpClient;
client.bookService.get({});
void BookService;`, workspace);
    assert.strictEqual(legacyErrors.length, 2, legacyErrors.join('\n'));
    assert(legacyErrors.some(message => message.includes('bookService')));
    assert(legacyErrors.some(message => message.includes('BookService')));

    for (const Client of [sdk.HttpClient, esm.HttpClient]) {
        const calls = [];
        const client = new Client({
            request: config => {
                calls.push(config.url);
                return Promise.resolve({code: 200, data: {}, msg: 'ok'});
            },
            uploadFile: () => { throw new Error('unexpected upload'); },
        });
        assert.strictEqual(client.bookService, undefined);
        await Promise.all([
            client.desktop.v3.bookService.get({}),
            client.desktop.v3.bookService.defHttp({}),
            client.desktop.v4.bookService.get({}),
            client.analytics.v1.reportService.get({}),
            client.finance.v1.reportService.get({}),
        ]);
        assert.deepStrictEqual(calls, [
            'desktop.v3.BookService/get',
            'desktop.v3.BookService/defHttp',
            'desktop.v4.BookService/get',
            'analytics.v1.ReportService/get',
            'finance.v1.ReportService/get',
        ]);
    }
    console.log('PASS: CJS/ESM exports and calls, strict declarations, same-name services');
}

function runFixture(workspace, label, files, entrypoints, options, check) {
    const source = path.join(workspace, label, 'source');
    const output = path.join(workspace, label, 'output');
    fs.mkdirSync(output, {recursive: true});
    for (const [filename, content] of Object.entries(files)) {
        const destination = path.join(source, filename);
        fs.mkdirSync(path.dirname(destination), {recursive: true});
        fs.writeFileSync(destination, content);
    }
    const result = spawnSync('protoc', [
        `--proto_path=${source}`,
        `--plugin=protoc-gen-ts=${plugin}`,
        `--ts_out=${output}`,
        `--ts_opt=only_http${options ? ',' + options : ''}`,
        ...entrypoints,
    ], {encoding: 'utf8'});
    if (result.error) throw result.error;
    check(result, output);
    console.log(`PASS: ${label}`);
}

function expectError(expression) {
    return result => {
        assert.notStrictEqual(result.status, 0, 'expected generation to fail');
        assert.match(result.stderr, expression);
    };
}

function read(output, filename) {
    return fs.readFileSync(path.join(output, filename), 'utf8');
}

async function main() {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'protobuf-ts-http-collisions-'));
    try {
        await checkBundle(workspace);
        const normal = basicProto('sample.v3');
        runFixture(workspace, 'imported-service-not-emitted', {
            'imported.proto': basicProto('sample.v4'),
            'consumer.proto': 'syntax = "proto3"; package sample.v3; import "imported.proto"; message Consumer { sample.v4.Req value = 1; }',
        }, ['consumer.proto'], '', (result, output) => {
            assert.strictEqual(result.status, 0, result.stderr);
            assert.strictEqual(fs.existsSync(path.join(output, 'http-client.ts')), false);
            assert(!read(output, 'index.ts').includes('v4'));
        });
        runFixture(workspace, 'imported-conflicting-filename-not-emitted', {
            'http-client.proto': basicProto('external'),
            'consumer.proto': 'syntax = "proto3"; package sample; import "http-client.proto"; message Consumer { external.Req value = 1; }',
        }, ['consumer.proto'], '', (result, output) => {
            assert.strictEqual(result.status, 0, result.stderr);
            assert.strictEqual(fs.existsSync(path.join(output, 'http-client.ts')), false);
        });
        for (const [label, files, options] of [
            ['messages-only', {'message.proto': basicProto('sample.v3', '')}, ''],
            ['client-disabled', {'sample.proto': normal}, 'force_client_none'],
            ['services-disabled', {'sample.proto': normal}, 'force_disable_services'],
        ]) {
            runFixture(workspace, label, files, [Object.keys(files)[0]], options, (result, output) => {
                assert.strictEqual(result.status, 0, result.stderr);
                assert.strictEqual(fs.existsSync(path.join(output, 'http-client.ts')), false);
                assert(fs.existsSync(path.join(output, 'index.ts')));
            });
        }
        runFixture(workspace, 'javascript-declarations', {'sample.proto': normal}, ['sample.proto'], 'output_javascript', (result, output) => {
            assert.strictEqual(result.status, 0, result.stderr);
            assert(fs.existsSync(path.join(output, 'index.js')));
            assert(fs.existsSync(path.join(output, 'index.d.ts')));
            assert(fs.existsSync(path.join(output, '__proto_packages/sample/v3/index.d.ts')));
        });
        runFixture(workspace, 'same-package-across-directories', {
            'first/a.proto': basicProto('shared.version', 'service FirstService { rpc Get(Req) returns (Resp); }'),
            'second/b.proto': 'syntax = "proto3"; package shared.version; message OtherReq {} message OtherResp {} service SecondService { rpc Get(OtherReq) returns (OtherResp); }',
        }, ['first/a.proto', 'second/b.proto'], '', (result, output) => {
            assert.strictEqual(result.status, 0, result.stderr);
            const client = read(output, 'http-client.ts');
            assert(client.includes('firstService:'));
            assert(client.includes('secondService:'));
            const namespace = read(output, '__proto_packages/shared/version/index.ts');
            assert(namespace.includes('first/a'));
            assert(namespace.includes('second/b'));
        });
        runFixture(workspace, 'unnamed-package', {
            'sample.proto': 'syntax = "proto3"; message Req {} message Resp {} service ExampleService { rpc Get(Req) returns (Resp); }',
        }, ['sample.proto'], '', (result, output) => {
            assert.strictEqual(result.status, 0, result.stderr);
            assert(read(output, 'index.ts').includes('export * as _root'));
            assert(read(output, 'http-client.ts').includes('_root: {'));
        });
        runFixture(workspace, 'reserved-package-segment', {'sample.proto': basicProto('default')}, ['sample.proto'], '', (result, output) => {
            assert.strictEqual(result.status, 0, result.stderr);
            assert(read(output, 'index.ts').includes('export * as default$'));
            assert(read(output, 'http-client.ts').includes('default$: {'));
        });
        runFixture(workspace, 'unnamed-and-root-package-collision', {
            'unnamed.proto': 'syntax = "proto3"; message Req {} message Resp {} service UnnamedService { rpc Get(Req) returns (Resp); }',
            'named.proto': basicProto('_root'),
        }, ['unnamed.proto', 'named.proto'], '', expectError(/<no package> and _root share the _root namespace/));
        const rpcProto = basicProto('clashes', 'service ExampleService { rpc FooBar(Req) returns (Resp); rpc Foo_Bar(Req) returns (Resp); }');
        runFixture(workspace, 'normalized-rpc-collision', {'sample.proto': rpcProto}, ['sample.proto'], '', expectError(/clashes\.ExampleService\.FooBar.*clashes\.ExampleService\.Foo_Bar/));
        runFixture(workspace, 'transport-like-rpc-keeps-transport', {
            'sample.proto': basicProto('clashes', 'service ExampleService { rpc _httpTransport(Req) returns (Resp); }'),
        }, ['sample.proto'], '', (result, output) => {
            assert.strictEqual(result.status, 0, result.stderr);
            const client = read(output, 'sample.client.ts');
            assert(client.includes('private _httpTransport: HttpTransport'));
            assert(client.includes('HttpTransport(input:'));
            assert(client.includes('this._httpTransport.request'));
        });
        runFixture(workspace, 'normalized-service-collision', {
            'sample.proto': basicProto('clashes', 'service FooService { rpc Get(Req) returns (Resp); } service fooService { rpc Get(Req) returns (Resp); }'),
        }, ['sample.proto'], '', expectError(/clashes\.FooService.*clashes\.fooService/));
        runFixture(workspace, 'service-and-child-package-collision', {
            'parent.proto': basicProto('clashes', 'service FooService { rpc Get(Req) returns (Resp); }'),
            'child.proto': basicProto('clashes.fooService', 'service ChildService { rpc Get(Req) returns (Resp); }'),
        }, ['parent.proto', 'child.proto'], '', expectError(/clashes\.FooService.*clashes\.fooService/));
        runFixture(workspace, 'http-client-filename-collision', {'http-client.proto': normal}, ['http-client.proto'], '', expectError(/http-client\.ts.*proto output/));
        runFixture(workspace, 'root-index-filename-collision', {'index.proto': normal}, ['index.proto'], '', expectError(/index\.ts.*proto output/));
        runFixture(workspace, 'namespace-index-filename-collision', {
            '__proto_packages/sample/v3/index.proto': normal,
        }, ['__proto_packages/sample/v3/index.proto'], '', expectError(/__proto_packages\/sample\/v3\/index\.ts.*proto output/));
        runFixture(workspace, 'root-export-collision', {'sample.proto': basicProto('HttpClient')}, ['sample.proto'], '', expectError(/HttpClient.*aggregate client/));
        runFixture(workspace, 'protobuf-symbol-collision', {
            'first.proto': 'syntax = "proto3"; package duplicate; message EmptyResp {}',
            'second.proto': 'syntax = "proto3"; package duplicate; message EmptyResp {}',
        }, ['first.proto', 'second.proto'], '', expectError(/duplicate\.EmptyResp.*already defined/));
    } finally {
        fs.rmSync(workspace, {recursive: true, force: true});
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
