/**
 * User-provided options for Remote Procedure Calls.
 *
 * Every generated service method accepts these options.
 * They are passed on to the `HttpTransport` and can be evaluated there.
 */

export type Method =
  | 'get' | 'GET'
  | 'delete' | 'DELETE'
  | 'head' | 'HEAD'
  | 'options' | 'OPTIONS'
  | 'post' | 'POST'
  | 'put' | 'PUT'
  | 'patch' | 'PATCH'
  | 'purge' | 'PURGE'
  | 'link' | 'LINK'
  | 'unlink' | 'UNLINK';

export type AxiosRequestHeaders = Record<string, string | number | boolean>;

export type AxiosResponseHeaders = Record<string, string> & {
    "set-cookie"?: string[]
};

export type RequestOptions = Record<string, any>

export interface HttpOptions {
    authenticationScheme?: string;
    customTransform?: CustomAxiosTransform;
    defaultTransform?: AxiosTransform;
    requestOptions?: RequestOptions;
    [key: string]: any;
}

export abstract class CustomAxiosTransform {
    // 自定义拦截器
    customRequest?: (config:AxiosRequestConfig) => AxiosRequestConfig; // 自定义请求拦截
    customResponse?: (config:AxiosResponse<any>) => AxiosResponse<any>; // 自定义错误响应拦截
    customRequestError?: (error:Error) => void; // 自定义错误请求拦截
    customResponseError?: (error:Error) => void; // 自定义错误响应拦截
    customResponseReturn?: (res: AxiosResponse, resolve:typeof Promise.resolve, reject: typeof Promise.reject) => void
}

export abstract class AxiosTransform {
    // /**
    //  * @description: Process configuration before request
    //  * @description: Process configuration before request
    //  */
    beforeRequestHook?: (config: AxiosRequestConfig, options: RequestOptions) => AxiosRequestConfig;

    // /**
    //  * @description: Request successfully processed
    //  */
    // transformRequestHook?: (res: AxiosResponse<Result>, options: RequestOptions) => any;

    // /**
    //  * @description: 请求失败处理
    //  */
    // requestCatchHook?: (e: Error, options: RequestOptions) => Promise<any>;

    /**
     * @description: 请求之前的拦截器
     */
    requestInterceptors?: (
        config: Partial<AxiosRequestConfig>,
        options: HttpOptions
    ) => AxiosRequestConfig;

    /**
     * @description: 请求之后的拦截器
     */
    responseInterceptors?: (res: Partial<AxiosResponse<any>>, options: HttpOptions) => AxiosResponse<any>;

    /**
     * @description: 请求之前的拦截器错误处理
     */
    requestInterceptorsCatch?: (error: Error, options: HttpOptions) => void;

    /**
     * @description: 请求之后的拦截器错误处理
     */
    responseInterceptorsCatch?: (error: Error, options: HttpOptions, axiosInstance: Record<string, any>) => void;
}

export interface AxiosRequestConfig<D = any> {
    url?: string;
    method?: Method | string;
    baseURL?: string;
    params?: any;
    timeout?: number;
    data?: D;
    headers?: AxiosRequestHeaders;
    [key: string]: any;
}

export interface AxiosResponse<T = any, D = any>  {
    data: T;
    status: number;
    statusText: string;
    headers: AxiosResponseHeaders;
    config: AxiosRequestConfig<D>;
    request?: any;
  }