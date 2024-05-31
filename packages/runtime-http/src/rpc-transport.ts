import { lowerCamelCase } from "@protobuf-ts/runtime";
import type { MethodInfo } from "./reflection-info";
import type {RpcOptions} from "./rpc-options";
import { createAxios } from "@q-front-npm/http";


/**
 * A `RpcTransport` executes Remote Procedure Calls defined by a protobuf
 * service.
 *
 * This interface is the contract between a generated service client and
 * some wire protocol like grpc, grpc-web, Twirp or other.
 *
 * The transport receives reflection information about the service and
 * method being called.
 *
 * Some rules:
 *
 * a) An implementation **should** accept default `RpcOptions` (or an
 * interface that extends `RpcOptions`) in the constructor.
 *
 * b) An implementation **must** merge the options given to `mergeOptions()`
 * with its default options. If no extra options are implemented, or only
 * primitive option values are used, using `mergeRpcOptions()` will
 * produce the required behaviour.
 *
 * c) An implementation **must** pass `RpcOptions.jsonOptions` and
 * `RpcOptions.binaryOptions` to the `fromBinary`, `toBinary`, `fromJson`
 * and `toJson` methods when preparing a request or parsing a response.
 *
 * d) An implementation may support arbitrary other options, but they **must
 * not** interfere with options keys of the binary or JSON options.
 */

// interface a {
//     /**
//      * Merge call options with default options.
//      * Generated service clients will call this method with the users'
//      * call options and pass the result to the execute-method below.
//      */
//     mergeOptions(options?: Partial<RpcOptions>): RpcOptions;

//     /**
//      * Execute an unary RPC.
//      */
//     unary<I extends object>(
//         method: MethodInfo<I>,
//         input: I, options: RpcOptions): HttpResult<I>
// }
export class RpcTransport {
    
    defaultOptions: RpcOptions;
    vAxios: ReturnType<typeof createAxios>
    constructor(options: RpcOptions) {
        this.defaultOptions = options;
        this.vAxios = createAxios(options)
    }
    
    request(method: MethodInfo, input: any, opt?: RpcOptions['requestOptions']) {
        let url = this.makeUrl(method);
        let mt = this.makeMethod(method);
        return this.vAxios.request({
            url,
            method: mt,
            ...input
        }, opt)

    }

    protected makeMethod(method: MethodInfo): string {
        if (method.options['google.api.http']) {
            if ((method.options['google.api.http'] as any).get) {
                return 'GET'
            } else if ((method.options['google.api.http'] as any).post) {
                return 'POST'
            } else if ((method.options['google.api.http'] as any).put) {
                return 'PUT'
            } else if ((method.options['google.api.http'] as any).delete) {
                return 'DELETE'
            } else if ((method.options['google.api.http'] as any).patch) {
                return 'PATCH'
            }
        }
        return ''
    }
    /**
     * Create an URI for a RPC call.
     *
     * Takes the `baseUrl` option and appends:
     * - slash "/"
     * - package name
     * - dot "."
     * - service name
     * - slash "/"
     * - method name
     *
     * If the service was declared without a package, the package name and dot
     * are omitted.
     *
     * The method name is CamelCased just as it would be in Go, unless the
     * option `useProtoMethodName` is `true`.
     */
    protected makeUrl(method: MethodInfo): string {
        if (method.options['google.api.http']) {
            const url = 
                (method.options['google.api.http'] as any).get || 
                (method.options['google.api.http'] as any).post || 
                (method.options['google.api.http'] as any).put || 
                (method.options['google.api.http'] as any).delete || 
                (method.options['google.api.http'] as any).patch;
            return url;
        }
        let methodName = method.name;
        methodName = lowerCamelCase(methodName);
        return `${method.service.typeName}/${methodName}`;
    }

}
