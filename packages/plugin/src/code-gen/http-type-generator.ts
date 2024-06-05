import {
    addCommentBlockAsJsDoc,
    DescriptorRegistry,
    ServiceDescriptorProto,
    SymbolTable,
    TypescriptFile,
    TypeScriptImports,
    typescriptLiteralFromValue
} from "@protobuf-ts/plugin-framework";
import {Interpreter} from "../interpreter";
import {CommentGenerator} from "./comment-generator";
import * as ts from "typescript";
import {GeneratorBase} from "./generator-base";
import { lowerCamelCase } from "@protobuf-ts/runtime";


export class ServiceTypeGeneratorHttp extends GeneratorBase {



    constructor(symbols: SymbolTable, registry: DescriptorRegistry, imports: TypeScriptImports, comments: CommentGenerator, interpreter: Interpreter,
                private readonly options: {
                    runtimeHttpImportPath: string;
                }) {
        super(symbols, registry, imports, comments, interpreter);
    }


    // export const Haberdasher = new ServiceType("spec.haberdasher.Haberdasher", [
    //     { name: "MakeHat", localName: "makeHat", I: Size, O: Hat },
    // ], {});
    generateServiceType(source: TypescriptFile, descriptor: ServiceDescriptorProto): void {

        const
            // identifier for the service
            MyService = this.imports.type(source, descriptor),
            ServiceType = this.imports.name(source, "ServiceType", this.options.runtimeHttpImportPath),
            interpreterType = this.interpreter.getServiceType(descriptor);

        const args: ts.Expression[] = [
            // typeName
            ts.createStringLiteral(interpreterType.typeName), 
            /**
             * [{
                    name: 'Report',
                    options: { 'google.api.http': { post: '/v1/rum/report', body: '*' } },
                    I: ReportRequest,
                    O: ReportReply, 
                },]
             */
            this.createMethodInfoLiterals(source, interpreterType.methods)
        ];

        if (Object.keys(interpreterType.options).length) {
            args.push(
                typescriptLiteralFromValue(interpreterType.options)
            );
        }

        const exportConst = ts.createVariableStatement(
            [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
            ts.createVariableDeclarationList(
                [ts.createVariableDeclaration(
                    ts.createIdentifier(MyService),
                    undefined,
                    ts.createNew(
                        ts.createIdentifier(ServiceType),
                        undefined,
                        args
                    )
                )],
                ts.NodeFlags.Const
            )
        );

        // add to our file
        source.addStatement(exportConst);

        // add comments
        let comment = this.comments.makeDeprecatedTag(descriptor);
        comment += this.comments.makeGeneratedTag(descriptor).replace("@generated from ", "@generated ServiceType for ");
        addCommentBlockAsJsDoc(exportConst, comment);

        return;
    }

    createMethodInfoLiterals(source: TypescriptFile, methodInfos: readonly any[]): ts.ArrayLiteralExpression {
        const mi = methodInfos
            .map(mi => ServiceTypeGeneratorHttp.denormalizeMethodInfo(mi))
            .map(mi => this.createMethodInfoLiteral(source, mi));
        return ts.createArrayLiteral(mi, true);
    }


    createMethodInfoLiteral(source: TypescriptFile, methodInfo: any): ts.ObjectLiteralExpression {
        methodInfo = ServiceTypeGeneratorHttp.denormalizeMethodInfo(methodInfo);
        const properties: ts.PropertyAssignment[] = [];

        // name: The name of the method as declared in .proto
        // localName: The name of the method in the runtime.
        // idempotency: The idempotency level as specified in .proto.
        // serverStreaming: Was the rpc declared with server streaming?
        // clientStreaming: Was the rpc declared with client streaming?
        // options: Contains custom method options from the .proto source in JSON format.
        for (let key of ["name", "localName", "idempotency", "serverStreaming", "clientStreaming", "options"] as const) {
            if (methodInfo[key] !== undefined) {
                properties.push(ts.createPropertyAssignment(
                    key, typescriptLiteralFromValue(methodInfo[key])
                ));
            }
        }

        const idx = methodInfo.I.typeName.split('.').length- 1

        // I: The generated type handler for the input message.
        // TODO change
        properties.push(ts.createPropertyAssignment(
            ts.createIdentifier('I'),
            ts.createObjectLiteral([
                ts.createPropertyAssignment(
                    ts.createIdentifier('typeName'),
                    ts.createStringLiteral(methodInfo.I.typeName.split('.')[idx])
                )
            ], false) // false 表示单行
        ));

        // O: The generated type handler for the output message.
        // TODO change
        properties.push(ts.createPropertyAssignment(
            ts.createIdentifier('O'),
            ts.createObjectLiteral([
                ts.createPropertyAssignment(
                    ts.createIdentifier('typeName'),
                    ts.createStringLiteral(methodInfo.I.typeName.split('.')[idx])
                )
            ], false) // false 表示单行
        ));

        return ts.createObjectLiteral(properties, false);
    }

    /**
     * Turn normalized method info returned by normalizeMethodInfo() back into
     * the minimized form.
     */
    static denormalizeMethodInfo(info: any): any{
        let partial: any = {...info};
        delete partial.service;
        if (info.localName === lowerCamelCase(info.name)) {
            delete partial.localName;
        }
        if (!info.serverStreaming) {
            delete partial.serverStreaming;
        }
        if (!info.clientStreaming) {
            delete partial.clientStreaming;
        }
        if (info.options && Object.keys(info.options).length) {
            delete partial.info;
        }
        if (info.idempotency === undefined) {
            delete partial.idempotency;
        }
        return partial;
    }

}
