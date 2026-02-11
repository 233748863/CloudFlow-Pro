import request from '/@/utils/request'
import {
  JointMarketingAuditPendingPlanRequest,
  JointMarketingInviteListRequest,
  JointMarketingInviteListResponse,
  JointMarketingPendingPlanListRequest,
  JointMarketingPendingPlanListResponse,
  JointMarketingPlanApplyListRequest,
  JointMarketingPlanApplyListResponse,
  JointMarketingPlanCreateRequest,
  JointMarketingPlanDetailResponse,
  JointMarketingPlanListRequest,
  JointMarketingPlanListResponse,
  JointMarketingPlanPageRequest,
  JointMarketingPlanPageResponse,
  JointMarketingPlanUpdateRequest,
  JointMarketingRuleCreateRequest,
  JointMarketingRuleListResponse,
} from '/@/api/merchantsAlliance/jointMarket/types'

enum ApiPath {
  // 创建计划
  CREATE_PLAN = '/merchant/coupon/joint-marketing/plan/create',
  // 计划列表
  LIST_PLAN = '/merchant/coupon/joint-marketing/plan/query',
  // 分页查询计划列表(仅查询自己发布计划、参与计划)
  LIST_PLAN_PAGE = '/merchant/coupon/joint-marketing/plan/page',
  // 发布计划
  PUBLISH_PLAN = '/merchant/coupon/joint-marketing/plan/publish',
  // 关闭计划
  CLOSE_PLAN = '/merchant/coupon/joint-marketing/plan/close',
  // 更新计划
  UPDATE_PLAN = '/merchant/coupon/joint-marketing/plan/update',
  // 计划详情
  GET_PLAN_DETAIL = '/merchant/coupon/joint-marketing/plan/detail',
  // 邀请参与
  INVITE_PARTICIPANT = '/merchant/coupon/joint-marketing/participant/invite',
  // 接受邀请
  ACCEPT_PARTICIPANT = '/merchant/coupon/joint-marketing/participant/accept',
  // 拒绝邀请
  REJECT_PARTICIPANT = '/merchant/coupon/joint-marketing/participant/reject',
  // 分页查询计划内成员
  LIST_PARTICIPANT = '/merchant/coupon/joint-marketing/participant/page',
  // 移除计划成员
  REMOVE_PARTICIPANT = '/merchant/coupon/joint-marketing/participant/remove',
  // 退出计划
  QUIT_PARTICIPANT = '/merchant/coupon/joint-marketing/participant/quit',
  // 规则列表
  LIST_RULE = '/merchant/coupon/joint-marketing/rule/list',
  // 创建规则
  CREATE_RULE = '/merchant/coupon/joint-marketing/rule/create',
  // 更新规则
  UPDATE_RULE = '/merchant/coupon/joint-marketing/rule/update',
  // 删除规则
  DELETE_RULE = '/merchant/coupon/joint-marketing/rule/delete',
  // 计划统计
  GET_PLAN_STATISTICS = '/merchant/coupon/joint-marketing/plan/statistics',
  // 记录列表
  LIST_RECORD = '/merchant/coupon/joint-marketing/record/page',
  // 可加入计划申请列表
  LIST_PLAN_APPLY = '/merchant/coupon/joint-marketing/plan/apply/join/list',
  // 申请加入计划
  JOIN_PLAN_APPLY = '/merchant/coupon/joint-marketing/participant/apply/join',
  // 邀请记录列表
  LIST_INVITE_RECORD = '/merchant/coupon/joint-marketing/participant/invite/record',
  // 待审核计划列表
  PENDING_INVITE_RECORD = '/merchant/platform/joint/marketing/pending/list',
  // 审核待审核计划
  AUDIT_PENDING_PLAN = '/merchant/platform/joint/marketing/audit',
}

/**
 * 计划列表
 * @param query JointMarketingPlanListRequest
 * @returns JointMarketingPlanListResponse
 */
export function getPlanList(query: JointMarketingPlanListRequest) {
  return request<JointMarketingPlanListResponse>({
    url: ApiPath.LIST_PLAN,
    method: 'post',
    data: query,
  })
}

/**
 * 分页查询计划列表(仅查询自己发布计划、参与计划)
 * @param query JointMarketingPlanPageRequest
 * @returns JointMarketingPlanPageResponse
 */
export function getPlanListPage(query: JointMarketingPlanPageRequest) {
  return request<JointMarketingPlanPageResponse>({
    url: ApiPath.LIST_PLAN_PAGE,
    method: 'post',
    data: query,
  })
}

/**
 * 创建计划
 * @param query JointMarketingPlanCreateRequest
 * @returns void
 */
export function createPlan(query: JointMarketingPlanCreateRequest) {
  return request({
    url: ApiPath.CREATE_PLAN,
    method: 'post',
    data: query,
  })
}

/**
 * 接受邀请
 * @param participantId string 计划ID
 * @returns void
 */
export function acceptParticipant(participantId: string) {
  return request({
    url: ApiPath.ACCEPT_PARTICIPANT,
    method: 'post',
    params: {
      participantId,
    },
  })
}

/**
 * 拒绝邀请
 * @param participantId string 计划ID
 * @returns void
 */
export function rejectParticipant(participantId: string) {
  return request({
    url: ApiPath.REJECT_PARTICIPANT,
    method: 'post',
    params: {
      participantId,
    },
  })
}

/**
 * 计划详情
 * @param planId string 计划ID
 * @returns JointMarketingPlanDetailResponse
 */
export function getPlanDetail(planId: string) {
  return request<JointMarketingPlanDetailResponse>({
    url: ApiPath.GET_PLAN_DETAIL,
    method: 'get',
    params: {
      planId,
    },
  })
}

/**
 * 发布计划
 * @param planId string 计划ID
 * @returns void
 */
export function publishPlan(planId: string) {
  return request({
    url: ApiPath.PUBLISH_PLAN,
    method: 'post',
    params: {
      planId,
    },
  })
}

/**
 * 更新计划
 * @param query JointMarketingPlanUpdateRequest
 * @returns void
 */
export function updatePlan(query: JointMarketingPlanUpdateRequest) {
  return request({
    url: ApiPath.UPDATE_PLAN,
    method: 'post',
    data: query,
  })
}



/**
 * 创建规则
 * @param query JointMarketingRuleCreateRequest
 * @returns void
 */
export function createRule(query: JointMarketingRuleCreateRequest) {
  return request({
    url: ApiPath.CREATE_RULE,
    method: 'post',
    data: query,
  })
}

/**
 * 更新规则
 * @param query JointMarketingRuleUpdateRequest
 * @returns void
 */
export function updateRule(query: JointMarketingRuleCreateRequest) {
  return request({
    url: ApiPath.UPDATE_RULE,
    method: 'post',
    data: query,
  })
}

/**
 * 删除规则
 * @param ruleId string 规则ID
 * @returns void
 */
export function deleteRule(ruleId: string) {
  return request({
    url: ApiPath.DELETE_RULE,
    method: 'post',
    params: {
      ruleId,
    },
  })
}

/**
 * 规则列表
 * @param planId string 计划ID
 * @returns JointMarketingRuleListResponse
 */
export function getRuleList(planId: string) {
  return request<JointMarketingRuleListResponse>({
    url: ApiPath.LIST_RULE,
    method: 'get',
    params: {
      planId,
    },
  })
}

/**
 * 可加入计划申请列表
 * @param query JointMarketingPlanApplyListRequest
 * @returns JointMarketingPlanApplyListResponse
 */
export function getPlanApplyList(query: JointMarketingPlanApplyListRequest) {
  return request<JointMarketingPlanApplyListResponse>({
    url: ApiPath.LIST_PLAN_APPLY,
    method: 'post',
    data: query,
  })
}

/**
 * 申请加入计划
 * @param planId string 计划ID
 * @returns void
 */
export function joinPlanApply(planId: string) {
  return request({
    url: ApiPath.JOIN_PLAN_APPLY,
    method: 'post',
    data: {
      planId,
    },
  })
}

/**
 * 收到的邀请
 * @param query JointMarketingInviteListRequest
 * @returns JointMarketingInviteListResponse
 */
export function getInviteRecordList(query: JointMarketingInviteListRequest) {
  return request<JointMarketingInviteListResponse>({
    url: ApiPath.LIST_INVITE_RECORD,
    method: 'post',
    data: query,
  })
}

/**
 * 待审核计划列表
 * @param query JointMarketingPendingPlanListRequest
 * @returns JointMarketingPendingPlanListResponse
 */
export function getPendingPlanList(query: JointMarketingPendingPlanListRequest) {
  return request<JointMarketingPendingPlanListResponse>({
    url: ApiPath.PENDING_INVITE_RECORD,
    method: 'post',
    data: query,
  })
}

/**
 * 审核待审核计划
 * @param query JointMarketingAuditPendingPlanRequest
 * @returns void
 */
export function auditPendingPlan(query: JointMarketingAuditPendingPlanRequest) {
  return request({
    url: ApiPath.AUDIT_PENDING_PLAN,
    method: 'put',
    data: query,
  })
}
