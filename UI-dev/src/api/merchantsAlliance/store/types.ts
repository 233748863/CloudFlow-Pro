// 商家店铺营业状态
export const STORE_BUSINESS_STATUS = {
  OPEN: '营业中', //营业中
  CLOSED: '已关店', //已关店
  RESTING: '休息中', //休息中
}
// 商家店铺审核状态
export const STORE_AUDIT_STATUSES = {
  PENDING: '待审核', //待审核
  APPROVED: '已通过', //已通过
  REJECTED: '已拒绝', //已拒绝
}
// 商家店铺审核类型
export const STORE_AUDIT_TYPES = {
  CREATE: '创建', //创建
  DELETE: '删除', //删除
  REVISION: '修改', //修改
}

// 平台行业
export interface PlatformIndustry {
  id: string //行业id
  weight?: number //排名权重
  name: string //行业名称
  description?: string //行业描述
  enable: boolean //是否启用
}

export interface PlatformIndustryListRequest {
  page?: number //页码
  pageSize?: number //每页数量
  name?: string //行业名称
  createdTimeStart?: string //创建时间开始
  createdTimeEnd?: string //创建时间结束
  enable?: boolean //是否启用
  id?: string //行业id
}

export interface PlatformIndustryListResponse {
  current: number //当前页码
  size: number //每页大小
  total: number //总记录数
  records: PlatformIndustry[] //行业记录列表
}

// 平台行业创建请求参数
export interface PlatformIndustryCreateRequest {
  weight: number //排名权重
  name: string //行业名称
  description?: string //行业描述
  enable: boolean //是否启用
}

// 平台行业编辑请求参数
export interface PlatformIndustryEditRequest extends PlatformIndustryCreateRequest {
  id: number //行业id
}

// 商家店铺创建请求参数
export interface StoreCreateRequest<T> {
  name: string //店铺名称
  merchantId?: string // 商户ID
  description?: string //店铺简介
  industryId?: number //行业分类ID
  regionCode: string //区域编码
  addressDetail: string //详细地址
  phone: string //店铺联系电话
  logoUrl: string //店铺logo图片URL
  images?: string[] //店铺图片URL列表
  businessHours?: T //营业时间
  licenseNo: string //店铺营业执照号
  licenseImages: string[] //店铺营业执照图片URL列表
}

// 商家店铺列表请求参数
export interface StoreListRequest {
  page?: number //页码
  pageSize?: number //每页数量
  businessStatus?: string[] //店铺营业状态列表
  keyword?: string //搜索关键词
}

// 商家店铺列表记录
export interface Store {
  id: string //门店ID
  name: string //门店名称
  addressDetail: string //详细地址
  phone: string //门店电话
  logoUrl: string //门店Logo URL
  businessHours: string //营业时间
  businessStatus: string[] //营业状态: OPEN(营业中), CLOSED(已关店), RESTING(休息中),可用值:营业中,已关店,休息中
  enable: boolean //是否被禁用: true-已禁用; false-未禁用
}

// 删除门店请求参数
export interface DeleteStoreRequest {
  storeId: string //门店ID
  reason: string //删除原因
}

// 商家店铺列表响应参数
export interface StoreListResponse {
  page: number //页码
  pageSize: number //每页数量
  total: number //总记录数
  records: Store[] //店铺列表
}

// 商家店铺详情响应参数
export interface StoreInfoResponse {
  storeId: string //门店ID
  name: string //门店名称
  regionCode: string //区域编码
  addressDetail: string //详细地址
  phone: string //门店电话
  logoUrl: string //门店Logo URL
  images: string[] // 门店图片URL列表
  industryId?: string //行业分类ID
  businessHours?: string //营业时间
  businessStatus: string //营业状态: OPEN(营业中), CLOSED(已关店), RESTING(休息中),可用值:营业中,已关店,休息中
  enable: boolean //是否启用: true-启用; false-禁用
  auditing: boolean //是否审核中: true-审核中; false-已审核
}

// 商家店铺资质详情响应参数
export interface StoreQualificationResponse {
  storeId: string //门店ID
  licenseNo: string //门店营业执照编号
  licenseImages: string[] //门店资质图片列表
  auditing: boolean //是否审核中: true-审核中; false-已审核
}

// 更新店铺营业状态请求参数
export interface UpdateStatusBizRequest {
  storeId: string //门店ID
  businessStatus: string //营业状态: OPEN(营业中), CLOSED(已关店), RESTING(休息中),可用值:营业中,已关店,休息中
  businessHours?: string //营业时间
  modifyReason?: string //修改原因
}

// 更新店铺信息请求参数
export interface UpdateStoreInfoRequest {
  storeId: string //门店ID
  industryId?: number //行业分类ID
  name?: string //店铺名称
  description?: string //店铺简介
  phone?: string //店铺联系电话
  logoUrl?: string //店铺logo图片URL
  images?: string[] //店铺图片URL列表
  regionCode?: string //区域编码
  addressDetail?: string //详细地址
  modifyReason: string // 修改原因
}

// 更新店铺资质请求参数
export interface UpdateStoreQualificationRequest {
  storeId: string // 门店ID
  licenseNo: string //营业执照号
  licenseImages: string[] //商家资质图片URL列表
  modifyReason: string //修改原因
}

// 商家店铺审核记录列表请求参数
export interface StoreListAuditRequest{
  storeId: string
  sortDesc?: boolean //是否按创建时间降序排序
}

// 商家店铺审核记录列表响应参数
export interface StoreListAuditResponse {
  auditId: string //审核记录ID
  auditType: string //审核类型,可用值:CREATE,DELETE,REVISION,BIZ_STATUS,PENDING,REVISING,APPROVED,REJECTED
  auditStatus: string //审核状态,可用值:CREATE,DELETE,REVISION,BIZ_STATUS,PENDING,REVISING,APPROVED,REJECTED
  createdTime: string //提交审核时间
  auditTime: string //审核时间
  auditRemark: string //审核备注
  modifyReason: string //修改原因
}

// 商家店铺审核列表请求参数
export interface StoreAuditListRequest {
  pageNum: number //页码
  pageSize: number //每页数量
  merchantId: string //商家ID
  name: string //店铺名称
  industryIds: number[] //行业分类ID列表
  auditTypes: number[] //审核类型列表
  auditStatuses: string[] //审核状态列表
  orderByCreateTime: boolean //是否按创建时间排序
  startDate: string //开始日期
  endDate: string //结束日期
}

// 处理商家店铺审核请求参数
export interface StoreAuditHandleRequest {
  auditId: string //审核记录ID
  auditResult: string //审核结果
  auditRemark?: string //审核备注
}

// 商家店铺审核列表记录
export interface StoreAudit {
  auditId: string //审核记录ID
  storeName: string //门店名称
  merchantName: string //商户名称
  industryName: string //行业名称
  addressDetail: string //详细地址
  logoUrl: string //门店Logo URL
  auditStatus: string //审核状态,可用值:CREATE,DELETE,REVISION,BIZ_STATUS,PENDING,REVISING,APPROVED,REJECTED
  auditType: string //审核类型,可用值:CREATE,DELETE,REVISION,BIZ_STATUS,PENDING,REVISING,APPROVED,REJECTED
  createdTime: string //提交审核时间
}

// 商家店铺审核列表响应参数
export interface StoreAuditResponse {
  current: number //当前页码
  size: number //每页数量
  total: number //总记录数
  records: StoreAudit[] //审核记录列表
}

// 商家店铺审核详情响应参数
export interface StoreAuditDetailResponse {
  auditId: string //审核记录ID
  storeId: string //门店ID
  storeName: string //门店名称
  merchantName: string //商户名称
  merchantId: string //商户ID
  industryName: string //行业名称
  description: string //店铺简介
  regionCode: string //区域编码
  location: string //位置
  addressDetail: string //详细地址
  phone: string //联系电话
  logoUrl: string //logo图片URL
  images: string[] //图片URL列表
  businessHours: string //营业时间
  licenseNo: string //营业执照号
  licenseImages: string[] //资质图片URL列表
  auditStatus: string //审核状态,可用值:CREATE,DELETE,REVISION,BIZ_STATUS,PENDING,REVISING,APPROVED,REJECTED
  auditType: string //审核类型,可用值:CREATE,DELETE,REVISION,BIZ_STATUS,PENDING,REVISING,APPROVED,REJECTED
  auditBy: string //审核人
  auditRemark: string //审核备注
  auditTime: string //审核时间
  modifyReason: string //修改原因
  enable: boolean //是否启用: true-启用; false-禁用
  createdTime: string //创建时间
}

// 商家店铺详情响应参数
export interface StoreDetailResponse {
  merchantId: string, //商家ID
  merchantName: string, //商家名称
  merchantLogoUrl: string, //商家logo图片URL
  merchantBusinessStatus: string, //商家营业状态,可用值:OPEN(营业中), CLOSED(已关店), RESTING(休息中)
  merchantContactPhone: string, //商家联系电话
  storeId: string, //门店ID
  name: string, //店铺名称
  regionCode: string, //区域编码
  location: string, //位置
  addressDetail: string, //详细地址
  phone: string, //联系电话
  logoUrl: string, //店铺logo图片URL
  images: string[], //店铺图片URL列表
  businessHours: string, //营业时间
  industryId: number, //行业分类ID
  licenseNo: string, //营业执照号
  licenseImages: string[], //商家资质图片URL列表
  businessStatus: string, //店铺营业状态,可用值:OPEN(营业中), CLOSED(已关店), RESTING(休息中)
  auditStatus: string, //审核状态,可用值:CREATE,DELETE,REVISION,BIZ_STATUS,PENDING,REVISING,APPROVED,REJECTED
  auditType: string, //审核类型,可用值:CREATE,DELETE,REVISION,BIZ_STATUS,PENDING,REVISING,APPROVED,REJECTED
  auditRemark: string, //审核备注
  auditTime: string, //审核时间
  auditId: number, //审核记录ID
  auditName: string, //审核人
  createdTime: string, //创建时间
  enable: boolean, //是否启用: true-启用; false-禁用
}