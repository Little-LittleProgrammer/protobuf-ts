// 根据服务端返回结构体写入
import type { HttpOptions } from "./rpc-options";

type RefResult<T> = {
    /**
     * 用于 Vue Ref 场景, 如对象是ref, 再使用此属性
     */
    value: T
} 

interface ResultErrors {
    id: string;
    code: string;
    level: string;
    status: string;
    title: string;
    popup_title: string;
    details: string;
}

export interface Result<T> {
    /**
     * code 响应码
     * @generator code === 200
     */
    code: number;
    /**
     * data 实际数据
     */
    data: T & RefResult<T>;
    /**
     * code 响应消息
     * @generator msg = 'success'
     */
    msg: string;
    errors?: ResultErrors 
}

export type HttpResult<T> = Promise<Result<T> & RefResult<Result<T>>>

export interface UploadFile {
    // Other parameters
    data?: Record<string, any>;
    // File parameter interface field name
    name?: string;
    action?: string;
    // file name
    file: File | Blob;
    // file name
    filename?: string;
    [key: string]: any;
}

export interface VAxiosInstance {
    request<T>(config: Record<string, any>, options?: Record<string, any>): HttpResult<T>
    uploadFile<T>(config: Record<string, any>, params?: UploadFile): HttpResult<T>
}

export type VAxios = new (options: HttpOptions) => VAxiosInstance