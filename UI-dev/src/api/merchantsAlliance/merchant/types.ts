// 商家创建请求参数
export interface MerchantCreateRequest {
  merchantId?: number //商家ID
  merchantName: string //商家名称
  logoUrl: string //商家logo
  images?: string[] //商家图片
  description?: string //商家描述
  contactName: string //联系人姓名
  contactPhone: string //联系人手机号
  industryId?: number //行业id
  agentId?: number //代理商id
  legalPerson: string //法人姓名
  licenseNo: string //营业执照号
  licenseImages: string[] //营业执照图片
  regionCode?: string //区域编码
  subMchId: number //子商户id(用于收款)
  addressDetail: string //商家详细地址
}

// 商家审核列表查询参数
export interface MerchantAuditListRequest {
  pageNum?: number //页码
  pageSize?: number //每页数量
  auditStatuses?: string[] //审核状态列表
  auditTypes?: string[] //审核类型列表
  startDate?: string //查询开始时间(yyyy-MM-dd)
  endDate?: string //查询结束时间(yyyy-MM-dd)
  orderByCreateTime?: boolean //是否按创建时间排序: true-按创建时间排序; false-按审核时间排序
}

// 商家审核列表记录
export interface MerchantAuditListRecords {
  auditId: number //审核id
  merchantName: string //商家名称
  logoUrl: string //商家logo
  contactName: string //联系人姓名
  contactPhone: string //联系人手机号
  addressDetail: string //商家详细地址
  auditStatus: string //审核状态
  auditType: string //审核类型
  agentId: number //代理商id
  agentName: string //代理商名称
  industryId?: number //行业id
  legalPerson: string //法人姓名
  licenseNo: string //营业执照号
  enable: boolean //是否启用
}

// 商家审核列表响应参数
export interface MerchantAuditListResponse {
  current: number //当前页码
  size: number //每页大小
  total: number //总记录数
  records: MerchantAuditListRecords[] //审核记录列表
}

// 商家审核详情响应参数
export interface MerchantAuditDetailResponse {
  auditId: string //审核id
  name: string //商家名称
  logoUrl: string //商家logo
  images: string[] //商家图片
  description: string //商家描述
  contactName: string //联系人姓名
  contactPhone: string //联系人手机号
  regionCode: string //区域编码
  location: string //商家位置
  addressDetail: string //商家详细地址
  industryName: string //行业名称
  businessStatus: string //商家状态
  auditStatus: string //审核状态
  auditType: string //审核类型
  auditRemark: string //审核备注
  auditTime: string //审核时间
  modifyReason: string // 修改原因
  agentId: number //代理商id
  agentName: string //代理商名称
  legalPerson: string //法人姓名
  licenseNo: string //营业执照号
  licenseImages: string[] //营业执照图片
  createdTime: string //创建时间
  enable: boolean //是否启用
}

// 商家审核处理请求参数
export interface MerchantAuditHandleRequest {
  auditId: string //审核记录ID
  auditResult: string //审核结果
  auditRemark?: string //审核备注
}

// 商家列表查询参数
export interface MerchantListRequest {
  pageNum?: number //页码
  pageSize?: number //每页数量
  name?: string //商家名称
  businessStatus?: string[] //商家状态列表
  enable?: boolean //是否启用
  orderByCreateTime?: boolean //是否按创建时间排序: true-按创建时间排序; false-按审核时间排序
}

// 商家列表记录
export interface MerchantListRecords {
  id: number //商家ID
  merchantName: string //商家名称
  logoUrl: string //商家logo
  contactName: string //联系人姓名
  contactPhone: string //联系人手机号
  addressDetail: string //商家详细地址
  agentId: number //代理商id
  agentName: string //代理商名称
  industryId: number //行业id
  industryName: string //行业名称
  businessStatus: string //商家状态
  enable: boolean //是否启用
  createdTime: string //创建时间
}

// 商家列表响应参数
export interface MerchantListResponse {
  current: number //当前页码
  size: number //每页大小
  total: number //总记录数
  records: MerchantListRecords[] //商家记录列表
}

// 门店列表记录
export interface StoreList {
  id: number //门店ID
  name: string //门店名称
  addressDetail: string //门店详细地址
  phone: string //门店联系电话
  logoUrl: string //门店logo
  businessHours: string //门店营业时间
  businessStatus: string //门店经营状态
  enable: boolean //是否启用
}

// 商家详情响应参数
export interface MerchantDetailsResponse {
  id: number //商家ID
  name: string //商家名称
  logoUrl: string //商家logo
  images: string[] //商家图片
  description: string //商家描述
  contactName: string //联系人姓名
  contactPhone: string //联系人手机号
  regionCode: string //区域编码
  location: string //商家位置
  addressDetail: string //商家详细地址
  industryId: number //行业id
  industryName: string //行业名称
  legalPerson: string //法人姓名
  licenseNo: string //营业执照号
  licenseImages: string[] //营业执照图片
  businessStatus: string //商家状态
  createdTime: string //创建时间
  enable: boolean //是否启用
  auditEnum: string //审核状态
  auditType: string //审核类型
  auditRemark: string //审核备注
  auditTime: string //审核时间
  auditId: number //审核id
  auditName: string //审核人姓名
  stores: StoreList[] //门店列表
}

// 商家信息响应参数
export interface MerchantInfoResponse {
  id: string //商家ID
  name: string //商家名称
  logoUrl: string //商家logo
  images: string[] //商家图片
  description: string //商家描述
  contactName: string //联系人姓名
  contactPhone: string //联系人手机号
  regionCode: string //区域编码
  location: string //商家位置
  addressDetail: string //商家详细地址
  industryId: number //行业id
  businessStatus: string //商家状态
  createdTime: string //创建时间
  auditing: boolean //是否审核中
  enable: boolean //是否启用
  modifyReason: string // 修改原因
}

// 商家资质响应参数
export interface MerchantQualificationResponse {
  id: number //商家资质ID
  name: string //商家名称
  legalPerson: string //法人姓名
  licenseNo: string //营业执照号
  licenseImages: string[] //营业执照图片
  auditing: boolean //是否审核中
  modifyReason: string // 修改原因
}

// 商家信息更新请求参数
export interface MerchantInfoUpdateRequest {
  name: string //商家名称
  logoUrl: string //商家logo
  images: string[] //商家图片
  description: string //商家描述
  contactName: string //联系人姓名
  contactPhone: string //联系人手机号
  industryId: number //行业id
  regionCode: string //区域编码
  addressDetail: string //商家详细地址
  modifyReason: string // 修改原因
}

// 商家资质上传请求参数
export interface MerchantQualificationUploadRequest {
  legalPerson: string //法人姓名
  licenseNo: string //营业执照号
  licenseImages: string[] //营业执照图片
  modifyReason: string // 修改原因
}

// 商家审核列表查询参数
export interface AuditListRequest {
  pageNum?: number //页码
  pageSize?: number //每页数量
  auditStatuses?: string[] //审核状态列表
  auditTypes?: string[] //审核类型列表
  startDate?: string //查询开始时间(yyyy-MM-dd)
  endDate?: string //查询结束时间(yyyy-MM-dd)
  orderByCreateTime?: boolean //是否按创建时间排序: true-按创建时间排序; false-按审核时间排序
}

// 商家审核列表
export interface AuditListRecords {
  auditId: number //审核记录ID
  auditType: string //审核类型
  auditStatus: string //审核状态
  createdTime: string //创建时间
  auditTime: string //审核时间
  auditRemark: string //审核备注
  modifyReason: string // 修改原因
}

// 商家审核列表响应参数
export interface AuditListResponse {
  current: number //当前页码
  size: number //每页大小
  total: number //总记录数
  records: AuditListRecords[] //审核记录列表
}

/**
 * 联合营销计划商家列表查询参数
 */
export interface JointMarketingPlanMerchantListRequest {
  pageNum: number
  pageSize: number
  regionCodes?: string[]
  industryIds?: string[]
  merchantName?: string
}

/**
 * 联合营销计划商家列表记录
 */
export interface JointMarketingPlanMerchantListRecords {
  /** 商家ID */
  merchantId: string
  /** 商家名称 */
  merchantName: string
  /** 商家logo URL*/
  merchantLogoUrl: string
  /** 商家描述 */
  description: string
  /** 联系人姓名 */
  contactName: string
  /** 联系人手机号 */
  contactPhone: string
  /** 商家地址 */
  merchantAddress: string
  /** 商家业务状态 */
  merchantBusinessStatus: string
  /** 行业名称 */
  industryName: string
}

/**
 * 联合营销计划商家列表响应参数
 */
export interface JointMarketingPlanMerchantListResponse {
  current: number
  size: number
  total: number
  records: JointMarketingPlanMerchantListRecords[]
}
