// @generated by protobuf-ts 2.9.7-alpha.2 with parameter only_http
// @generated from protobuf file "message.proto" (package "rum", syntax proto3)
// tslint:disable
/**
 * @generated from protobuf message rum.ReportReply
 */
export interface ReportReply {
}
/**
 * @generated from protobuf message rum.ReportRequest
 */
export interface ReportRequest {
    /**
     * sdk版本
     *
     * @generated from protobuf field: string sdk_ver = 1;
     */
    sdkVer: string;
    /**
     * sdk名称
     *
     * @generated from protobuf field: string sdk_name = 2;
     */
    sdkName: string;
    /**
     * 上报id
     *
     * @generated from protobuf field: string id = 3;
     */
    id: string;
    /**
     * 应用id
     *
     * @generated from protobuf field: string app_id = 4;
     */
    appId: string;
    /**
     * 用户id
     *
     * @generated from protobuf field: string user_id = 5;
     */
    userId: string;
    /**
     * 应用名称
     *
     * @generated from protobuf field: string app_name = 6;
     */
    appName: string;
    /**
     * @generated from protobuf field: repeated rum.ReportRequest.Data data = 7;
     */
    data: ReportRequest_Data[];
    /**
     * 网络
     *
     * @generated from protobuf field: rum.ReportRequest.Networkinfo network_info = 8;
     */
    networkInfo?: ReportRequest_Networkinfo;
}
/**
 * @generated from protobuf message rum.ReportRequest.Data
 */
export interface ReportRequest_Data {
    /**
     * 分类
     *
     * @generated from protobuf field: rum.Category category = 1;
     */
    category: Category;
    /**
     * 子分类
     *
     * @generated from protobuf field: rum.SubCategory sub_category = 2;
     */
    subCategory: SubCategory;
    /**
     * 页面地址
     *
     * @generated from protobuf field: string page_url = 3;
     */
    pageUrl: string;
    /**
     * 指标获取时间，ms级时间戳
     *
     * @generated from protobuf field: uint32 time = 4;
     */
    time: number;
    /**
     * 性能数据
     *
     * @generated from protobuf field: optional rum.ReportRequest.Data.Performance performance = 5;
     */
    performance?: ReportRequest_Data_Performance;
    /**
     * 错误
     *
     * @generated from protobuf field: optional rum.ReportRequest.Data.Error error = 6;
     */
    error?: ReportRequest_Data_Error;
    /**
     * @generated from protobuf field: repeated rum.ReportRequest.Data.BreadcrumbData breadcrumb_data = 7;
     */
    breadcrumbData: ReportRequest_Data_BreadcrumbData[];
}
/**
 * @generated from protobuf message rum.ReportRequest.Data.Performance
 */
export interface ReportRequest_Data_Performance {
    /**
     * 开始时间: 如：400，单位ms
     *
     * @generated from protobuf field: optional double start_time = 1;
     */
    startTime?: number;
    /**
     * 渲染时间: 如 400
     *
     * @generated from protobuf field: optional double render_time = 2;
     */
    renderTime?: number;
    /**
     * 偏移量
     *
     * @generated from protobuf field: optional double value = 3;
     */
    value?: number;
    /**
     * 延迟时间
     *
     * @generated from protobuf field: optional double duration = 4;
     */
    duration?: number;
    /**
     * 延迟事件
     *
     * @generated from protobuf field: optional string name = 5;
     */
    name?: string;
    /**
     * 首次可交互时间
     *
     * @generated from protobuf field: optional double tti = 6;
     */
    tti?: number;
    /**
     * HTML加载完成时间
     *
     * @generated from protobuf field: optional double dom_ready = 7;
     */
    domReady?: number;
    /**
     * 页面完全加载时间
     *
     * @generated from protobuf field: optional double load = 8;
     */
    load?: number;
    /**
     * 首包时间
     *
     * @generated from protobuf field: optional double first_byte = 9;
     */
    firstByte?: number;
    /**
     * dns查询耗时
     *
     * @generated from protobuf field: optional double dns = 10;
     */
    dns?: number;
    /**
     * tcp连接时间
     *
     * @generated from protobuf field: optional double tcp = 11;
     */
    tcp?: number;
    /**
     * ssl完全连接耗时
     *
     * @generated from protobuf field: optional double ssl = 12;
     */
    ssl?: number;
    /**
     * 请求响应耗时
     *
     * @generated from protobuf field: optional double ttfb = 13;
     */
    ttfb?: number;
    /**
     * 内容传输耗时
     *
     * @generated from protobuf field: optional double trans = 14;
     */
    trans?: number;
    /**
     * dom解析耗时
     *
     * @generated from protobuf field: optional double dom_parse = 15;
     */
    domParse?: number;
    /**
     * 资源加载耗时
     *
     * @generated from protobuf field: optional double res = 16;
     */
    res?: number;
}
/**
 * @generated from protobuf message rum.ReportRequest.Data.Error
 */
export interface ReportRequest_Data_Error {
    /**
     * 错误类型
     *
     * @generated from protobuf field: optional string errorType = 1;
     */
    errorType?: string;
    /**
     * 错误uid
     *
     * @generated from protobuf field: optional string errorUid = 2;
     */
    errorUid?: string;
    /**
     * 错误消息
     *
     * @generated from protobuf field: optional string msg = 3;
     */
    msg?: string;
    /**
     * 错误栈
     *
     * @generated from protobuf field: optional double stackTrace = 4;
     */
    stackTrace?: number;
    /**
     * 错误请求数据
     *
     * @generated from protobuf field: optional rum.ReportRequest.Data.Error.ErrorRequest request = 5;
     */
    request?: ReportRequest_Data_Error_ErrorRequest;
    /**
     * 错误响应数据
     *
     * @generated from protobuf field: optional rum.ReportRequest.Data.Error.ErrorResponse response = 6;
     */
    response?: ReportRequest_Data_Error_ErrorResponse;
    /**
     * 错误时长
     *
     * @generated from protobuf field: optional float duration = 7;
     */
    duration?: number;
}
/**
 * 错误元类型
 * optional ErrorMate meta = 4;
 * message ErrorMate {
 *   optional string col = 1;
 *   optional string line = 2;
 * }
 * message stackTrace {
 *   optional repeated string frames
 * }
 *
 * @generated from protobuf message rum.ReportRequest.Data.Error.ErrorRequest
 */
export interface ReportRequest_Data_Error_ErrorRequest {
    /**
     * @generated from protobuf field: optional string method = 1;
     */
    method?: string;
    /**
     * @generated from protobuf field: optional string url = 2;
     */
    url?: string;
    /**
     * @generated from protobuf field: optional string body = 3;
     */
    body?: string;
}
/**
 * @generated from protobuf message rum.ReportRequest.Data.Error.ErrorResponse
 */
export interface ReportRequest_Data_Error_ErrorResponse {
    /**
     * @generated from protobuf field: optional int32 status = 1;
     */
    status?: number;
    /**
     * @generated from protobuf field: optional string body = 2;
     */
    body?: string;
}
/**
 * 用户行为数据
 *
 * @generated from protobuf message rum.ReportRequest.Data.BreadcrumbData
 */
export interface ReportRequest_Data_BreadcrumbData {
    /**
     * @generated from protobuf field: string category = 1;
     */
    category: string;
    /**
     * @generated from protobuf field: float time = 2;
     */
    time: number;
    /**
     * @generated from protobuf field: rum.SeverityLevel level = 3;
     */
    level: SeverityLevel;
}
/**
 * @generated from protobuf message rum.ReportRequest.Networkinfo
 */
export interface ReportRequest_Networkinfo {
    /**
     * 网络状态
     *
     * @generated from protobuf field: rum.EffectiveType effective_type = 1;
     */
    effectiveType: EffectiveType;
    /**
     * 下载速度
     *
     * @generated from protobuf field: uint32 downlink = 2;
     */
    downlink: number;
    /**
     * 延迟
     *
     * @generated from protobuf field: uint32 rtt = 3;
     */
    rtt: number;
}
/**
 * @generated from protobuf enum rum.Category
 */
export enum Category {
    /**
     * 未知
     *
     * @generated from protobuf enum value: Category_Unknown = 0;
     */
    Category_Unknown = 0,
    /**
     * 性能
     *
     * @generated from protobuf enum value: Category_Performance = 1;
     */
    Category_Performance = 1,
    /**
     * 错误
     *
     * @generated from protobuf enum value: Category_Error = 2;
     */
    Category_Error = 2,
    /**
     * 行为
     *
     * @generated from protobuf enum value: Category_Behaviour = 3;
     */
    Category_Behaviour = 3,
    /**
     *
     *
     * @generated from protobuf enum value: Category_Custom = 4;
     */
    Category_Custom = 4
}
/**
 * @generated from protobuf enum rum.EffectiveType
 */
export enum EffectiveType {
    /**
     * @generated from protobuf enum value: Network_Unknown = 0;
     */
    Network_Unknown = 0,
    /**
     * @generated from protobuf enum value: Network_Wifi = 1;
     */
    Network_Wifi = 1,
    /**
     * @generated from protobuf enum value: Network_2G = 2;
     */
    Network_2G = 2,
    /**
     * @generated from protobuf enum value: Network_3G = 3;
     */
    Network_3G = 3,
    /**
     * @generated from protobuf enum value: Network_4G = 4;
     */
    Network_4G = 4
}
/**
 * @generated from protobuf enum rum.SubCategory
 */
export enum SubCategory {
    /**
     * 未知
     *
     * @generated from protobuf enum value: Subtype_Known = 0;
     */
    Subtype_Known = 0,
    /**
     * 白屏时间/首次绘制
     *
     * @generated from protobuf enum value: FirstPaint = 1;
     */
    FirstPaint = 1,
    /**
     * 首屏时间/首次内容绘制
     *
     * @generated from protobuf enum value: FirstContentulPaint = 2;
     */
    FirstContentulPaint = 2,
    /**
     * 最大内容绘制
     *
     * @generated from protobuf enum value: LargestContentfulPaint = 3;
     */
    LargestContentfulPaint = 3,
    /**
     * 最大偏移量
     *
     * @generated from protobuf enum value: CumulativeLayoutShift = 4;
     */
    CumulativeLayoutShift = 4,
    /**
     * 首屏有意义绘制
     *
     * @generated from protobuf enum value: FirstMeaningPaint = 5;
     */
    FirstMeaningPaint = 5,
    /**
     * 首次输入延迟
     *
     * @generated from protobuf enum value: FirstInputDelay = 6;
     */
    FirstInputDelay = 6,
    /**
     * 页面数据
     *
     * @generated from protobuf enum value: Navigation = 7;
     */
    Navigation = 7,
    /**
     * 资源
     *
     * @generated from protobuf enum value: Resource = 9;
     */
    Resource = 9,
    /**
     * 控制台错误
     *
     * @generated from protobuf enum value: ConsoleError = 10;
     */
    ConsoleError = 10,
    /**
     * js报错
     *
     * @generated from protobuf enum value: JsError = 11;
     */
    JsError = 11,
    /**
     * 异步报错
     *
     * @generated from protobuf enum value: PromiseError = 12;
     */
    PromiseError = 12,
    /**
     * 资源请求错误
     *
     * @generated from protobuf enum value: ResourceError = 13;
     */
    ResourceError = 13,
    /**
     * vue错误
     *
     * @generated from protobuf enum value: VueError = 14;
     */
    VueError = 14,
    /**
     * 请求错误
     *
     * @generated from protobuf enum value: FETCH = 15;
     */
    FETCH = 15,
    /**
     * 请求错误
     *
     * @generated from protobuf enum value: XHR = 16;
     */
    XHR = 16
}
/**
 * 行为等级
 *
 * @generated from protobuf enum rum.SeverityLevel
 */
export enum SeverityLevel {
    /**
     * @generated from protobuf enum value: Unknown = 0;
     */
    Unknown = 0,
    /**
     * @generated from protobuf enum value: Else = 1;
     */
    Else = 1,
    /**
     * @generated from protobuf enum value: Error = 2;
     */
    Error = 2,
    /**
     * @generated from protobuf enum value: Warning = 3;
     */
    Warning = 3,
    /**
     * @generated from protobuf enum value: Info = 4;
     */
    Info = 4,
    /**
     * @generated from protobuf enum value: Debug = 5;
     */
    Debug = 5,
    /**
     * * 上报的错误等级
     *
     * @generated from protobuf enum value: Low = 6;
     */
    Low = 6,
    /**
     * @generated from protobuf enum value: Normal = 7;
     */
    Normal = 7,
    /**
     * @generated from protobuf enum value: High = 8;
     */
    High = 8,
    /**
     * @generated from protobuf enum value: Critical = 9;
     */
    Critical = 9
}
