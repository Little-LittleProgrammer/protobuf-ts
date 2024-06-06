import type { HttpOptions } from "./rpc-options";

export class HttpResult<T extends object = object> extends Promise<T> {

}


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
    request<T>(config: Record<string, any>, options?: Record<string, any>): Promise<T>
    uploadFile<T>(config: Record<string, any>, params?: UploadFile): Promise<T>
}

export type VAxios = new (options: HttpOptions) => VAxiosInstance