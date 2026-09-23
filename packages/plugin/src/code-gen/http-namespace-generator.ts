import {DescriptorRegistry, GeneratedFile, SymbolTable} from '@protobuf-ts/plugin-framework';
import * as path from 'path';
import * as ts from 'typescript';
import {OutFile} from '../out-file';
import {InternalOptions} from '../our-options';

interface NamespaceNode {
    children: Map<string, NamespaceNode>;
    files: OutFile[];
    symbols: Map<string, string>;
}

const namespaceDirectory = '__proto_packages';
const reservedKeywords = new Set('break,case,catch,class,const,continue,debugger,default,delete,do,else,enum,export,extends,false,finally,for,function,if,import,in,instanceof,new,null,return,super,switch,this,throw,true,try,typeof,var,void,while,with,as,implements,interface,let,package,private,protected,public,static,yield'.split(','));

export function generateHttpNamespaces(mainFiles: readonly OutFile[], existingFiles: readonly GeneratedFile[], symbols: SymbolTable, hasClient: boolean, registry: DescriptorRegistry, options: InternalOptions): OutFile[] {
    if (!mainFiles.length) return [];
    const root: NamespaceNode = {children: new Map(), files: [], symbols: new Map()};
    const packages = new Map<string, string>();
    for (const file of mainFiles) {
        const packageName = file.fileDescriptor.package || '';
        const namespace = packageName || '_root';
        const previousPackage = packages.get(namespace);
        if (previousPackage !== undefined && previousPackage !== packageName) {
            fail(`Protobuf packages ${previousPackage || '<no package>'} and ${packageName} share the ${namespace} namespace`);
        }
        packages.set(namespace, packageName);
        const names = namespace.split('.');
        let node = root;
        for (const name of names) {
            const part = escapeKeyword(name);
            let child = node.children.get(part);
            if (!child) {
                child = {children: new Map(), files: [], symbols: new Map()};
                node.children.set(part, child);
            }
            node = child;
        }
        for (const symbol of symbols.list(file, 'default')) {
            const previous = node.symbols.get(symbol.name);
            if (previous) {
                fail(`Protobuf package ${file.fileDescriptor.package || '_root'} exports ${symbol.name} from both ${previous} and ${file.getFilename()}`);
            }
            node.symbols.set(symbol.name, file.getFilename());
        }
        node.files.push(file);
    }

    const generated: OutFile[] = [];
    const addFile = (filename: string, lines: string[]): void => {
        const file = new OutFile(filename, mainFiles[0].fileDescriptor, registry, options);
        const source = ts.createSourceFile(filename, lines.join('\n'), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
        for (const statement of source.statements) file.addStatement(statement);
        generated.push(file);
    };
    const emit = (node: NamespaceNode, directory: string): void => {
        for (const [name, child] of node.children) {
            if (node.symbols.has(name)) {
                fail(`Protobuf package namespace ${name} conflicts with ${node.symbols.get(name)}`);
            }
            emit(child, path.posix.join(directory, name));
        }
        const lines = [...node.children].map(([name]) => `export * as ${name} from './${name}';`);
        for (const file of node.files) {
            const relative = path.posix.relative(directory || '.', file.getFilename()).replace(/\.ts$/, '');
            lines.push(`export * from '${relative.startsWith('.') ? relative : './' + relative}';`);
        }
        const filename = directory ? path.posix.join(directory, 'index.ts') : 'index.ts';
        addFile(filename, lines);
    };

    for (const [name, child] of root.children) {
        emit(child, path.posix.join(namespaceDirectory, name));
    }
    const rootLines = [...root.children].map(([name]) => `export * as ${name} from './${namespaceDirectory}/${name}';`);
    if (hasClient) {
        if (root.children.has('HttpClient')) {
            fail('Protobuf package HttpClient conflicts with the generated aggregate client');
        }
        rootLines.unshift("export {HttpClient} from './http-client';");
    }
    addFile('index.ts', rootLines);

    const filenames = new Set(existingFiles.map(file => file.getFilename()));
    for (const file of generated) {
        if (filenames.has(file.getFilename())) {
            fail(`Cannot generate ${file.getFilename()}: a proto output already uses this filename`);
        }
    }
    return generated;
}

export function escapeKeyword(name: string): string {
    return reservedKeywords.has(name) ? name + '$' : name;
}

function fail(message: string): never {
    const error = new Error(message);
    error.name = 'PluginMessageError';
    throw error;
}
