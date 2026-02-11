/** 联合营销计划列表请求参数 */
export interface JointMarketingPlanListRequest {
  /** 页码 */
  pageNum: number
  /** 每页大小 */
  pageSize: number
  /** 计划名称(模糊查询) */
  name: string
  /** 计划状态 */
  status: string
  /** 接受状态 */
  acceptStatus: string
  /** 是否仅查询创建者发布的计划 */
  onlyOwnerPublish: boolean
  /** 是否仅查询创建者接受的计划 */
  onlyOwnerAccept: boolean
  /** 计划开始时间 */
  startDate: string
  /** 计划结束时间 */
  endDate: string
  /** 接受计划开始时间 */
  acceptStartDate: string
  /** 接受计划结束时间 */
  acceptEndDate: string
  /** 发布商户ID列表 */
  publishMerchantIds?: string[]
}

/** 联合营销计划列表数据 */
export interface JointMarketingPlanListData {
  /** 联合营销计划ID */
  id: string
  /** 联合营销计划名称 */
  name: string
  /** 联合营销计划描述 */
  description: string
  /** 联合营销计划开始时间 */
  startTime: string
  /** 联合营销计划结束时间 */
  endTime: string
  /** 联合营销计划创建者商户ID */
  initiatorMerchantId: number
  /** 联合营销计划状态 */
  status: string
  /** 联合营销计划创建时间 */
  createdTime: string
}

/** 联合营销计划列表响应参数 */
export interface JointMarketingPlanListResponse {
  /** 每页数量 */
  size: number
  /** 总数量 */
  total: number
  /** 当前页码 */
  pageNum: number
  /** 是否还有更多数据 */
  hasMore: boolean
  /** 下一页游标 */
  nextCursor: number
  /** 记录列表 */
  records: JointMarketingPlanListData[]
}

/** 联合营销计划分页请求参数(仅查询自己发布计划、参与计划) */
export interface JointMarketingPlanPageRequest {
  /** 页码 */
  pageNum: number
  /** 每页大小 */
  pageSize: number
  /** 计划名称(模糊查询) */
  name: string
  /** 计划状态 */
  status: string
  /** 接受状态 */
  acceptStatus: string
  /** 是否仅查询创建者发布的计划 */
  onlyOwnerPublish: boolean
  /** 是否仅查询创建者接受的计划 */
  onlyOwnerAccept: boolean
  /** 计划开始时间 */
  startDate: string
  /** 计划结束时间 */
  endDate: string
  /** 接受计划开始时间 */
  acceptStartDate: string
  /** 接受计划结束时间 */
  acceptEndDate: string
  /** 发布商户ID列表 */
  publishMerchantIds: string[]
}

/** 联合营销计划分页记录 */
export interface JointMarketingPlanPageRecord {
  /** 联合营销计划ID */
  id: string
  /** 联合营销计划名称 */
  name: string
  /** 联合营销计划描述 */
  description: string
  /** 联合营销计划开始时间 */
  startTime: string
  /** 联合营销计划结束时间 */
  endTime: string
  /** 联合营销计划创建者商户ID */
  initiatorMerchantId: number
  /** 联合营销计划创建者商户名称 */
  initiatorMerchantName: string
  /** 联合营销计划创建者商户logo */
  initiatorMerchantLogo: string
  /** 联合营销计划状态 DRAFT-草稿; ACTIVE-进行中; PAUSED-暂停; ENDED-结束*/
  status: string
  /** 联合营销计划创建时间 */
  createdTime: string
  /** 联合营销计划加入时间 */
  jointTime: string
  /** 联合营销计划角色 */
  planRole: string
}

/** 联合营销计划分页响应参数(仅查询自己发布计划、参与计划) */
export interface JointMarketingPlanPageResponse {
  /** 当前页码 */
  current: number
  /** 每页大小 */
  size: number
  /** 总数量 */
  total: number
  /** 记录列表 */
  records: JointMarketingPlanPageRecord[]
}

/** 联合营销计划创建请求参数 */
export interface JointMarketingPlanCreateRequest {
  /** 联合营销计划名称 */
  name: string
  /** 联合营销计划描述 */
  description: string
  /** 联合营销计划开始时间 */
  startTime: string
  /** 联合营销计划结束时间 */
  endTime: string
}

/** 联合营销计划更新请求参数 */
export interface JointMarketingPlanUpdateRequest {
  /** 联合营销计划ID */
  id: string
  /** 计划名称 */
  name: string
  /** 计划描述 */
  description: string
  /** 计划开始时间 */
  startTime: string
  /** 计划结束时间 */
  endTime: string
}

/** 联合营销计划详情响应参数 */
export interface JointMarketingPlanDetailResponse {
  /** 联合营销计划ID */
  id: string
  /** 联合营销计划名称 */
  name: string
  /** 联合营销计划描述 */
  description: string
  /** 联合营销计划开始时间 */
  startTime: string
  /** 联合营销计划结束时间 */
  endTime: string
  /** 联合营销计划创建者商户ID */
  initiatorMerchantId: string
  /** 联合营销计划状态 */
  status: string
  /** 联合营销计划创建时间 */
  createdTime: string
}

/** 联合营销规则分配参数 */
export interface JointMarketingRuleAllocations {
  /** 付款方商户ID */
  payerMerchantId: string
  /** 收款方商户ID */
  payeeMerchantId: string
  /** 收款方角色 */
  payeeRole: string
  /** 分配类型 */
  allocationType: string
  /** 分配值 */
  allocationValue: number
  /** 触发阶段 */
  triggerPhase: string
  /** 描述 */
  description: string
}

/** 联合营销规则奖励参数 */
export interface JointMarketingRuleRewards {
  /** 奖励提供方商户ID */
  providerMerchantId: string
  /** 奖励内容ID */
  rewardContentId: string
  /** 奖励数量 */
  rewardQuantity: number
  /** 库存限制 */
  stockLimit: number
  /** 分配列表 */
  allocations: JointMarketingRuleAllocations[]
}

/** 联合营销规则创建请求参数 */
export interface JointMarketingRuleCreateRequest {
  /** 联合营销计划ID */
  planId: string
  /** 规则名称 */
  name: string
  /** 触发商户ID列表 */
  triggerMerchantIds: number[]
  /** 触发门店ID列表 */
  triggerStoreIds: number[]
  /** 触发事件 */
  triggerEvent: string
  /** 最小订单金额 */
  minOrderAmount: number
  /** 商品范围类型 */
  productScopeType: string
  /** 商品范围ID列表 */
  productScopeIds: number[]
  /** 每日限制每个用户 */
  dailyLimitPerUser: number
  /** 总限制 */
  totalLimit: number
  /** 奖励列表 */
  rewards: JointMarketingRuleRewards[]
}

/** 联合营销规则列表分配参数 */
export interface JointMarketingRuleListAllocations {
  /** 分配ID */
  id: string
  /** 规则ID */
  ruleId: string
  /** 奖励ID */
  rewardId: string
  /** 触发阶段 */
  triggerPhase: string
  /** 付款方商户ID */
  payerMerchantId: string
  /** 收款方商户ID */
  payeeMerchantId: string
  /** 收款方角色 */
  payeeRole: string
  /** 分配类型 */
  allocationType: string
  /** 分配值 */
  allocationValue: number
  /** 描述 */
  description: string
  /** 创建者 */
  createdBy: string
  /** 创建时间 */
  createdTime: string
  /** 更新者 */
  updatedBy: string
  /** 更新时间 */
  updatedTime: string
  /** 是否删除 */
  isDeleted: number
  /** 删除时间 */
  deletedTime: string
}

/** 联合营销规则列表奖励参数 */
export interface JointMarketingRuleListRewards {
  /** 奖励ID */
  id: string
  /** 奖励提供方商户ID */
  providerMerchantId: string
  /** 奖励内容ID */
  rewardContentId: string
  /** 奖励数量 */
  rewardQuantity: number
  /** 库存限制 */
  stockLimit: number
  /** 分配列表 */
  allocations: JointMarketingRuleListAllocations[]
}

/** 联合营销规则列表响应参数 */
export interface JointMarketingRuleListResponse {
  /** 联合营销规则ID */
  id: string
  /** 联合营销计划ID */
  planId: string
  /** 联合营销规则名称 */
  name: string
  /** 触发商户ID列表 */
  triggerMerchantIds: number[]
  /** 触发门店ID列表 */
  triggerStoreIds: number[]
  /** 触发事件 */
  triggerEvent: string
  /** 最小订单金额 */
  minOrderAmount: number
  /** 商品范围类型 */
  productScopeType: string
  /** 商品范围ID列表 */
  productScopeIds: number[]
  /** 每日限制每个用户 */
  dailyLimitPerUser: number
  /** 总限制 */
  totalLimit: number
  /** 奖励列表 */
  rewards: JointMarketingRuleListRewards[]
}

/** 可加入计划申请列表请求参数 */
export interface JointMarketingPlanApplyListRequest {
  /** 分页页码 */
  pageNum: number
  /** 分页每页数量 */
  pageSize: number
  /** 计划名称 */
  planName: string
  /** 区域编码列表 */
  regionCodes: string[]
  /** 行业ID列表 */
  industryIds: string[]
  /** 商户ID列表 */
  merchantIds: string[]
}

/** 可加入计划申请列表记录参数 */
export interface JointMarketingPlanApplyListRecord {
  /** 联合营销计划ID */
  id: string
  /** 联合营销计划名称 */
  name: string
  /** 联合营销计划描述 */
  description: string
  /** 联合营销计划开始时间 */
  startTime: string
  /** 联合营销计划结束时间 */
  endTime: string
  /** 联合营销计划创建者商户ID */
  initiatorMerchantId: string
  /** 联合营销计划创建者商户名称 */
  initiatorMerchantName: string
  /** 联合营销计划创建者商户logo */
  initiatorMerchantLogo: string
  /** 联合营销计划状态 */
  status: string
  /** 联合营销计划创建时间 */
  createdTime: string
  /** 联合营销计划加入时间 */
  jointTime: string
  /** 联合营销计划角色 */
  planRole: string
}

/** 可加入计划申请列表响应参数 */
export interface JointMarketingPlanApplyListResponse {
  /** 分页页码 */
  current: number
  /** 分页每页数量 */
  size: number
  /** 总记录数 */
  total: number
  /** 可加入计划申请列表 */
  records: JointMarketingPlanApplyListRecord[]
}

/** 联合营销邀请记录列表请求参数 */
export interface JointMarketingInviteListRequest {
  /** 分页页码 */
  pageNum: number
  /** 分页每页数量 */
  pageSize: number
  /** 邀请状态 */
  status?: string
  /** 邀请商户ID列表 */
  invitationMerchantIds?: string[]
  /** 邀请开始时间 */
  inviteStartDate?: string
  /** 邀请结束时间 */
  inviteEndDate?: string
  /** 接受开始时间 */
  acceptStartDate?: string
  /** 接受结束时间 */
  acceptEndDate?: string
  /** 是否按邀请时间升序排序 */
  orderByAsc?: boolean
}

/** 联合营销邀请记录列表记录参数 */
export interface JointMarketingInviteListRecord {
  /** 联合营销计划ID */
  planId: string
  /** 联合营销计划名称 */
  planName: string
  /** 联合营销计划状态 */
  planStatus: string
  /** 联合营销计划开始时间 */
  planStartTime: string
  /** 联合营销计划结束时间 */
  planEndTime: string
  /** 邀请记录ID */
  participantId: string
  /** 邀请状态 */
  participantStatus: string
  /** 邀请过期时间 */
  participantExpiryTime: string
  /** 邀请加入时间 */
  participantJoinTime: string
  /** 邀请时间 */
  inviteTime: string
  /** 邀请商户ID */
  merchantId: string
  /** 邀请商户名称 */
  merchantName: string
}

/** 联合营销邀请记录列表响应参数 */
export interface JointMarketingInviteListResponse {
  /** 分页页码 */
  current: number
  /** 分页每页数量 */
  size: number
  /** 总记录数 */
  total: number
  /** 邀请记录列表 */
  records: JointMarketingInviteListRecord[]
}

/** 待审核计划列表请求参数 */
export interface JointMarketingPendingPlanListRequest {
  /** 分页页码 */
  pageNum: number
  /** 分页每页数量 */
  pageSize: number
  /** 计划名称 */
  planName: string
  /** 商户名称 */
  merchantName: string
}

/** 待审核计划列表记录参数 */
export interface JointMarketingPendingPlanListRecord {
  /** 联合营销计划ID */
  id: string
  /** 联合营销计划名称 */
  name: string
  /** 联合营销计划描述 */
  description: string
  /** 联合营销计划开始时间 */
  startTime: string
  /** 联合营销计划结束时间 */
  endTime: string
  /** 联合营销计划创建者商户ID */
  initiatorMerchantId: string
  /** 联合营销计划创建者商户名称 */
  initiatorMerchantName: string
  /** 联合营销计划创建者商户logo */
  initiatorMerchantLogo: string
  /** 联合营销计划状态 */
  status: string
  /** 联合营销计划创建时间 */
  createdTime: string
  /** 联合营销计划加入时间 */
  jointTime: string
  /** 联合营销计划角色 */
  planRole: string
}

/** 待审核计划列表响应参数 */
export interface JointMarketingPendingPlanListResponse {
  /** 分页页码 */
  current: number
  /** 分页每页数量 */
  size: number
  /** 总记录数 */
  total: number
  /** 待审核计划列表 */
  records: JointMarketingPendingPlanListRecord[]
}

/** 审核待审核计划请求参数 */
export interface JointMarketingAuditPendingPlanRequest {
  /** 联合营销计划ID */
  planId: string
  /** 是否通过审核 */
  approve: boolean
  /** 审核拒绝原因 */
  reason?: string
}
