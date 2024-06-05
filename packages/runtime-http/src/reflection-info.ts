
/**
 * Describes a protobuf service for runtime reflection.
 */
export interface ServiceInfo {

    /**
     * The protobuf type name of the service, including package name if
     * present.
     */
    readonly typeName: string;

    /**
     * Information for each rpc method of the service, in the order of
     * declaration in the source .proto.
     */
    readonly methods: MethodInfo[];

    /**
     * Contains custom service options from the .proto source in JSON format.
     */
    readonly options: { [extensionName: string]:  JsonValue};
}

export type JsonValue = number | string | boolean | null | JsonObject | JsonArray;

/**
 * Represents a JSON object.
 */
export type JsonObject = { [k: string]: JsonValue };


// should be replaced by JsonValue = ... JsonValue[] but that throws off jasmine toEqual with TS2589
interface JsonArray extends Array<JsonValue> {
}


/**
 * Describes a protobuf service method for runtime reflection.
 */
export interface MethodInfo<I extends object = any, O extends object = any> {

    /**
     * The service this method belongs to.
     */
    readonly service: ServiceInfo

    /**
     * The name of the method as declared in .proto
     */
    readonly name: string;

    /**
     * The name of the method in the runtime.
     */
    readonly localName: string;

    /**
     * The idempotency level as specified in .proto.
     *
     * For example, the following method declaration will set
     * `idempotency` to 'NO_SIDE_EFFECTS'.
     *
     * ```proto
     * rpc Foo (FooRequest) returns (FooResponse) {
     *   option idempotency_level = NO_SIDE_EFFECTS
     * }
     * ```
     *
     * See `google/protobuf/descriptor.proto`, `MethodOptions`.
     */
    readonly idempotency: undefined | 'NO_SIDE_EFFECTS' | 'IDEMPOTENT';

    /**
     * The generated type handler for the input message.
     * Provides methods to encode / decode binary or JSON format.
     */
    readonly I: {
        typeName: string
    } ;

    /**
     * Contains custom method options from the .proto source in JSON format.
     */
    readonly options: { [extensionName: string]: JsonValue };

}


/**
 * Version of `MethodInfo` that does not include "service", and also allows
 * the following properties to be omitted:
 * - "localName": can be omitted if equal to lowerCamelCase(name)
 * - "serverStreaming": omitting means `false`
 * - "clientStreaming": omitting means `false`
 * - "options"
 */
// "localName" | "idempotency" | "serverStreaming" | "clientStreaming" | "options"
export type PartialMethodInfo<I extends object = any, O extends object = any> =
    PartialPartial<Omit<MethodInfo<I, O>, "service">, any>;


// Make all properties in T optional, except those whose keys are in the union K.
type PartialPartial<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>;


/**
 * Turns PartialMethodInfo into MethodInfo.
 */
export function normalizeMethodInfo<I extends object = any, O extends object = any>(method: PartialMethodInfo<I, O>, service: ServiceInfo): MethodInfo<I, O> {
    let m = method as any;
    m.service = service;
    m.localName = m.localName ?? lowerCamelCase(m.name);
    m.options = m.options ?? {};
    m.idempotency = m.idempotency ?? undefined;
    return m as MethodInfo<I, O>;
}

export function lowerCamelCase(snakeCase: string): string {
    let capNext = false;
    const sb = [];
    for (let i = 0; i < snakeCase.length; i++) {
        let next = snakeCase.charAt(i);
        if (next == '_') {
            capNext = true;
        } else if (/\d/.test(next)) {
            sb.push(next);
            capNext = true;
        } else if (capNext) {
            sb.push(next.toUpperCase());
            capNext = false;
        } else if (i == 0) {
            sb.push(next.toLowerCase());
        } else {
            sb.push(next);
        }
    }
    return sb.join('');
}