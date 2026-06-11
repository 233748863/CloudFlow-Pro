/**
 * 业务动作权限码定义
 *
 * 从 React 项目提取的权限码，用于前端按钮级权限控制
 * 权限码格式：模块:资源:操作（如 crm:lead:convert）
 *
 * 使用方式：
 * import { CRM_PERMISSIONS } from '@/permissions'
 * permission: CRM_PERMISSIONS.LEAD_CONVERT
 */

/** CRM 客户关系管理权限 */
export const CRM_PERMISSIONS = {
  // 仪表盘
  DASHBOARD_VIEW: 'crm:dashboard:view',

  // 客户管理
  CUSTOMER_LIST: 'crm:customer:list',
  CUSTOMER_CREATE: 'crm:customer:create',
  CUSTOMER_EDIT: 'crm:customer:edit',
  CUSTOMER_DELETE: 'crm:customer:delete',
  CUSTOMER_CLAIM: 'crm:customer:claim',
  CUSTOMER_RELEASE: 'crm:customer:release',

  // 线索管理
  LEAD_LIST: 'crm:lead:list',
  LEAD_CREATE: 'crm:lead:create',
  LEAD_EDIT: 'crm:lead:edit',
  LEAD_DELETE: 'crm:lead:delete',
  LEAD_CONVERT: 'crm:lead:convert',

  // 商机管理
  OPPORTUNITY_LIST: 'crm:opportunity:list',
  OPPORTUNITY_CREATE: 'crm:opportunity:create',
  OPPORTUNITY_EDIT: 'crm:opportunity:edit',
  OPPORTUNITY_DELETE: 'crm:opportunity:delete',
  OPPORTUNITY_WIN: 'crm:opportunity:win',
  OPPORTUNITY_LOSE: 'crm:opportunity:lose',
  OPPORTUNITY_STAGE_UPDATE: 'crm:opportunity:stage:update',

  // 报价管理
  QUOTE_LIST: 'crm:quote:list',
  QUOTE_CREATE: 'crm:quote:create',
  QUOTE_EDIT: 'crm:quote:edit',
  QUOTE_DELETE: 'crm:quote:delete',
  QUOTE_SUBMIT: 'crm:quote:submit',
  QUOTE_SEND: 'crm:quote:send',
  QUOTE_ACCEPT: 'crm:quote:accept',
  QUOTE_EXPIRE: 'crm:quote:expire',
  QUOTE_TO_CONTRACT: 'crm:quote:to-contract',

  // 应收管理
  RECEIVABLE_LIST: 'crm:receivable:list',
  RECEIVABLE_CREATE: 'crm:receivable:create',
  RECEIVABLE_EDIT: 'crm:receivable:edit',
  RECEIVABLE_DELETE: 'crm:receivable:delete',
  RECEIVABLE_CONFIRM: 'crm:receivable:confirm',
  RECEIVABLE_BIND_INVOICE: 'crm:receivable:bind-invoice',
  RECEIVABLE_AGING: 'crm:receivable:aging',

  // 续约管理
  RENEWAL_LIST: 'crm:renewal:list',
  RENEWAL_CREATE: 'crm:renewal:create',
  RENEWAL_EDIT: 'crm:renewal:edit',
  RENEWAL_DELETE: 'crm:renewal:delete',
  RENEWAL_SUBMIT: 'crm:renewal:submit',

  // 工单管理
  TICKET_LIST: 'crm:ticket:list',
  TICKET_CREATE: 'crm:ticket:create',
  TICKET_EDIT: 'crm:ticket:edit',
  TICKET_DELETE: 'crm:ticket:delete',
  TICKET_RESOLVE: 'crm:ticket:resolve',
  TICKET_CLOSE: 'crm:ticket:close',

  // 产品管理
  PRODUCT_LIST: 'crm:product:list',
  PRODUCT_CREATE: 'crm:product:create',
  PRODUCT_EDIT: 'crm:product:edit',
  PRODUCT_DELETE: 'crm:product:delete',

  // 价目表管理
  PRICE_BOOK_LIST: 'crm:price-book:list',
  PRICE_BOOK_CREATE: 'crm:price-book:create',
  PRICE_BOOK_EDIT: 'crm:price-book:edit',
  PRICE_BOOK_DELETE: 'crm:price-book:delete',

  // 销售目标
  SALES_TARGET_LIST: 'crm:sales-target:list',
  SALES_TARGET_CREATE: 'crm:sales-target:create',
  SALES_TARGET_EDIT: 'crm:sales-target:edit',
  SALES_TARGET_DELETE: 'crm:sales-target:delete',

  // 客户公海
  CUSTOMER_POOL_LIST: 'crm:customer-pool:list',
  CUSTOMER_POOL_CLAIM: 'crm:customer-pool:claim',
  CUSTOMER_POOL_AUTO_RELEASE: 'crm:customer-pool:auto-release',

  // 分配规则
  ASSIGNMENT_RULE_LIST: 'crm:assignment-rule:list',
  ASSIGNMENT_RULE_CREATE: 'crm:assignment-rule:create',
  ASSIGNMENT_RULE_EDIT: 'crm:assignment-rule:edit',
  ASSIGNMENT_RULE_DELETE: 'crm:assignment-rule:delete',

  // 联系人管理
  CONTACT_LIST: 'crm:contact:list',
  CONTACT_CREATE: 'crm:contact:create',
  CONTACT_EDIT: 'crm:contact:edit',
  CONTACT_DELETE: 'crm:contact:delete',

  // 跟进记录
  FOLLOW_UP_LIST: 'crm:follow-up:list',
  FOLLOW_UP_CREATE: 'crm:follow-up:create',
  FOLLOW_UP_EDIT: 'crm:follow-up:edit',
  FOLLOW_UP_DELETE: 'crm:follow-up:delete',

  // 审批流
  APPROVAL_CUSTOMER_CLAIM: 'crm:approval:customer-claim',
  APPROVAL_CUSTOMER_LEVEL_CHANGE: 'crm:approval:customer-level-change',
  APPROVAL_OPPORTUNITY_DOWNGRADE: 'crm:approval:opportunity-downgrade',
  APPROVAL_REFUND: 'crm:approval:refund'
} as const

/** OA 办公管理权限 */
export const OA_PERMISSIONS = {
  // 工作台
  WORKPLACE_VIEW: 'oa:workplace:view',

  // 公告管理
  ANNOUNCEMENT_LIST: 'oa:announcement:list',
  ANNOUNCEMENT_CREATE: 'oa:announcement:create',
  ANNOUNCEMENT_EDIT: 'oa:announcement:edit',
  ANNOUNCEMENT_DELETE: 'oa:announcement:delete',

  // 日程管理
  SCHEDULE_LIST: 'oa:schedule:list',
  SCHEDULE_CREATE: 'oa:schedule:create',
  SCHEDULE_EDIT: 'oa:schedule:edit',
  SCHEDULE_DELETE: 'oa:schedule:delete',

  // 会议室管理
  MEETING_ROOM_LIST: 'oa:meeting-room:list',
  MEETING_ROOM_CREATE: 'oa:meeting-room:create',
  MEETING_ROOM_EDIT: 'oa:meeting-room:edit',
  MEETING_ROOM_DELETE: 'oa:meeting-room:delete',

  // 会议纪要
  MEETING_LIST: 'oa:meeting:list',
  MEETING_CREATE: 'oa:meeting:create',
  MEETING_EDIT: 'oa:meeting:edit',
  MEETING_DELETE: 'oa:meeting:delete',
  MEETING_CONFIRM: 'oa:meeting:confirm',
  MEETING_DISPATCH_DECISIONS: 'oa:meeting:dispatch-decisions',
  MEETING_ATTENDANCE: 'oa:meeting:attendance',

  // 项目管理
  PROJECT_LIST: 'oa:project:list',
  PROJECT_CREATE: 'oa:project:create',
  PROJECT_EDIT: 'oa:project:edit',
  PROJECT_DELETE: 'oa:project:delete',
  PROJECT_SUBMIT: 'oa:project:submit',
  PROJECT_ARCHIVE: 'oa:project:archive',
  PROJECT_WBS: 'oa:project:wbs',
  PROJECT_WBS_CREATE: 'oa:project:wbs:create',
  PROJECT_WBS_EDIT: 'oa:project:wbs:edit',
  PROJECT_WBS_DELETE: 'oa:project:wbs:delete',
  PROJECT_MEMBER: 'oa:project:member',
  PROJECT_MEMBER_ADD: 'oa:project:member:add',
  PROJECT_MEMBER_REMOVE: 'oa:project:member:remove',
  PROJECT_MILESTONE: 'oa:project:milestone',
  PROJECT_MILESTONE_CREATE: 'oa:project:milestone:create',
  PROJECT_MILESTONE_EDIT: 'oa:project:milestone:edit',
  PROJECT_MILESTONE_DELETE: 'oa:project:milestone:delete',
  PROJECT_RISK: 'oa:project:risk',
  PROJECT_RISK_CREATE: 'oa:project:risk:create',
  PROJECT_RISK_EDIT: 'oa:project:risk:edit',
  PROJECT_RISK_DELETE: 'oa:project:risk:delete',
  PROJECT_DEPENDENCY: 'oa:project:dependency',
  PROJECT_BASELINE: 'oa:project:baseline',

  // 预算管理
  BUDGET_LIST: 'oa:budget:list',
  BUDGET_CREATE: 'oa:budget:create',
  BUDGET_EDIT: 'oa:budget:edit',
  BUDGET_DELETE: 'oa:budget:delete',
  BUDGET_SUBMIT: 'oa:budget:submit',
  BUDGET_SUBJECT: 'oa:budget:subject',
  BUDGET_ADJUSTMENT: 'oa:budget:adjustment',
  BUDGET_EXECUTION: 'oa:budget:execution',

  // 发票管理
  INVOICE_LIST: 'oa:invoice:list',
  INVOICE_CREATE: 'oa:invoice:create',
  INVOICE_EDIT: 'oa:invoice:edit',
  INVOICE_DELETE: 'oa:invoice:delete',
  INVOICE_VOID: 'oa:invoice:void',
  INVOICE_BIND: 'oa:invoice:bind',
  INVOICE_WRITEOFF: 'oa:invoice:writeoff',

  // 合同管理
  CONTRACT_LIST: 'oa:contract:list',
  CONTRACT_CREATE: 'oa:contract:create',
  CONTRACT_EDIT: 'oa:contract:edit',
  CONTRACT_DELETE: 'oa:contract:delete',
  CONTRACT_THRESHOLD_LIST: 'oa:contract:threshold:list',

  // 资产管理
  ASSET_LIST: 'oa:asset:list',
  ASSET_CREATE: 'oa:asset:create',
  ASSET_EDIT: 'oa:asset:edit',
  ASSET_DELETE: 'oa:asset:delete',

  // 车辆管理
  VEHICLE_LIST: 'oa:vehicle:list',
  VEHICLE_BOOKING: 'oa:vehicle:booking',
  VEHICLE_USAGE: 'oa:vehicle:usage',

  // 报销管理
  EXPENSE_LIST: 'oa:expense:list',
  EXPENSE_CREATE: 'oa:expense:create',
  EXPENSE_EDIT: 'oa:expense:edit',
  EXPENSE_DELETE: 'oa:expense:delete',

  // 付款管理
  PAYMENT_LIST: 'oa:payment:list',
  PAYMENT_CREATE: 'oa:payment:create',
  PAYMENT_EDIT: 'oa:payment:edit',
  PAYMENT_DELETE: 'oa:payment:delete',
  PAYMENT_CONFIRM: 'oa:payment:confirm',

  // 采购管理
  PURCHASE_LIST: 'oa:purchase:list',
  PURCHASE_CREATE: 'oa:purchase:create',
  PURCHASE_EDIT: 'oa:purchase:edit',
  PURCHASE_DELETE: 'oa:purchase:delete',

  // 用印管理
  SEAL_LIST: 'oa:seal:list',
  SEAL_CREATE: 'oa:seal:create',
  SEAL_EDIT: 'oa:seal:edit',
  SEAL_DELETE: 'oa:seal:delete',

  // 证照管理
  LICENSE_LIST: 'oa:license:list',
  LICENSE_CREATE: 'oa:license:create',
  LICENSE_EDIT: 'oa:license:edit',
  LICENSE_DELETE: 'oa:license:delete',

  // 借用管理
  BORROW_LIST: 'oa:borrow:list',

  // 出差管理
  TRIP_LIST: 'oa:trip:list',
  TRIP_CREATE: 'oa:trip:create',
  TRIP_EDIT: 'oa:trip:edit',
  TRIP_DELETE: 'oa:trip:delete',

  // 通讯录
  CONTACT_LIST: 'oa:contact:list',

  // 知识库
  KNOWLEDGE_LIST: 'oa:knowledge:list',
  KNOWLEDGE_CREATE: 'oa:knowledge:create',
  KNOWLEDGE_EDIT: 'oa:knowledge:edit',
  KNOWLEDGE_DELETE: 'oa:knowledge:delete',

  // 访客管理
  VISITOR_LIST: 'oa:visitor:list',
  VISITOR_CREATE: 'oa:visitor:create',
  VISITOR_EDIT: 'oa:visitor:edit',
  VISITOR_DELETE: 'oa:visitor:delete',

  // 值班管理
  DUTY_LIST: 'oa:duty:list',
  DUTY_CREATE: 'oa:duty:create',
  DUTY_EDIT: 'oa:duty:edit',
  DUTY_DELETE: 'oa:duty:delete',

  // 供应商管理
  SUPPLIER_LIST: 'oa:supplier:list',
  SUPPLIER_CREATE: 'oa:supplier:create',
  SUPPLIER_EDIT: 'oa:supplier:edit',
  SUPPLIER_DELETE: 'oa:supplier:delete',

  // 耗材管理
  CONSUMABLE_LIST: 'oa:consumable:list',
  CONSUMABLE_CREATE: 'oa:consumable:create',
  CONSUMABLE_EDIT: 'oa:consumable:edit',
  CONSUMABLE_DELETE: 'oa:consumable:delete',

  // 风险预警
  RISK_LIST: 'oa:risk:list',
  RISK_CREATE: 'oa:risk:create',
  RISK_EDIT: 'oa:risk:edit',
  RISK_DELETE: 'oa:risk:delete'
} as const

/** HR 人力资源权限 */
export const HR_PERMISSIONS = {
  // HR 看板
  DASHBOARD_VIEW: 'hr:dashboard:view',

  // 员工档案
  EMPLOYEES_LIST: 'hr:employees:list',
  EMPLOYEES_CREATE: 'hr:employees:create',
  EMPLOYEES_EDIT: 'hr:employees:edit',
  EMPLOYEES_DELETE: 'hr:employees:delete',

  // 组织管理
  ORGANIZATION_LIST: 'hr:organization:list',
  ORGANIZATION_CREATE: 'hr:organization:create',
  ORGANIZATION_EDIT: 'hr:organization:edit',
  ORGANIZATION_DELETE: 'hr:organization:delete',

  // 招聘管理
  RECRUITMENT_LIST: 'hr:recruitment:list',
  RECRUITMENT_CREATE: 'hr:recruitment:create',
  RECRUITMENT_EDIT: 'hr:recruitment:edit',
  RECRUITMENT_DELETE: 'hr:recruitment:delete',

  // 绩效管理
  PERFORMANCE_LIST: 'hr:performance:list',
  PERFORMANCE_CREATE: 'hr:performance:create',
  PERFORMANCE_EDIT: 'hr:performance:edit',
  PERFORMANCE_DELETE: 'hr:performance:delete',

  // 人事异动
  LIFECYCLE_LIST: 'hr:lifecycle:list',
  LIFECYCLE_CREATE: 'hr:lifecycle:create',
  LIFECYCLE_EDIT: 'hr:lifecycle:edit',
  LIFECYCLE_DELETE: 'hr:lifecycle:delete',

  // 考勤管理
  ATTENDANCE_LIST: 'hr:attendance:list',
  ATTENDANCE_CREATE: 'hr:attendance:create',
  ATTENDANCE_EDIT: 'hr:attendance:edit',
  ATTENDANCE_DELETE: 'hr:attendance:delete',

  // 薪酬福利
  COMPENSATION_LIST: 'hr:compensation:list',
  COMPENSATION_CREATE: 'hr:compensation:create',
  COMPENSATION_EDIT: 'hr:compensation:edit',
  COMPENSATION_DELETE: 'hr:compensation:delete',

  // 员工自助
  ESS_VIEW: 'hr:ess:view',
  ESS_SLIP_VIEW: 'hr:ess:slip:view',
  ESS_CERT_APPLY: 'hr:ess:cert:apply',
  ESS_PROFILE_EDIT: 'hr:ess:profile:edit',
  ESS_LEAVE_VIEW: 'hr:ess:leave:view',
  ESS_BENEFIT_VIEW: 'hr:ess:benefit:view',
  ESS_CONTRACT_SIGN: 'hr:ess:contract:sign',

  // 培训管理
  TRAINING_PLAN_LIST: 'hr:training:plan:list',
  TRAINING_COURSE_LIST: 'hr:training:course:list',
  TRAINING_SESSION_LIST: 'hr:training:session:list',
  TRAINING_ENROLL_LIST: 'hr:training:enroll:list',
  TRAINING_EXAM_LIST: 'hr:training:exam:list',
  TRAINING_CERT_LIST: 'hr:training:cert:list',
  TRAINING_ARCHIVE_VIEW: 'hr:training:archive:view',

  // 人才管理
  TALENT_VIEW: 'hr:talent:view',
  TALENT_REVIEW_LIST: 'hr:talent:review:list',
  TALENT_REVIEW_CALIBRATE: 'hr:talent:review:calibrate',
  TALENT_REVIEW_SESSION: 'hr:talent:review:session',
  TALENT_SUCCESSION_LIST: 'hr:talent:succession:list',
  TALENT_POOL_LIST: 'hr:talent:pool:list',
  TALENT_DEV_LIST: 'hr:talent:dev:list',
  TALENT_ARCHIVE_VIEW: 'hr:talent:archive:view',
  TALENT_ARCHIVE_MINE: 'hr:talent:archive:mine',

  // 福利管理
  BENEFIT_MINE: 'hr:benefit:mine',
  BENEFIT_REQUEST_LIST: 'hr:benefit:request:list',
  BENEFIT_POINT_VIEW: 'hr:benefit:point:view',
  BENEFIT_MALL_BROWSE: 'hr:benefit:mall:browse',
  BENEFIT_ORDER_LIST: 'hr:benefit:order:list',
  BENEFIT_MALL_ITEM_MANAGE: 'hr:benefit:mall:item-manage',

  // 工伤管理
  INJURY_LIST: 'hr:injury:list',
  INJURY_INVESTIGATE: 'hr:injury:investigate',
  INJURY_TREATMENT: 'hr:injury:treatment',
  INJURY_COMPENSATION: 'hr:injury:compensation',
  INJURY_REHAB: 'hr:injury:rehab',

  // 劳动争议
  DISPUTE_LIST: 'hr:dispute:list',
  DISPUTE_MEDIATION: 'hr:dispute:mediation',
  DISPUTE_ARBITRATION: 'hr:dispute:arbitration'
} as const

/** 系统安全权限 */
export const SYSTEM_SECURITY_PERMISSIONS = {
  // 业务规则
  RULE_LIST: 'system:rule:list',
  RULE_CREATE: 'system:rule:create',
  RULE_EDIT: 'system:rule:edit',
  RULE_DELETE: 'system:rule:delete',
  RULE_ENABLE: 'system:rule:enable',
  RULE_DISABLE: 'system:rule:disable',
  RULE_PUBLISH: 'system:rule:publish',
  RULE_VERSION_LIST: 'system:rule:version:list',
  RULE_ROLLBACK: 'system:rule:rollback',
  RULE_HIT_RECORDS: 'system:rule:hit-records',

  // 审计日志
  AUDIT_LIST: 'system:audit:list',
  AUDIT_EVENTS: 'system:audit:events',
  AUDIT_EXPORT: 'system:audit:export',

  // 接口限流
  API_RATE_LIMIT_LIST: 'system:apiRateLimit:list',
  API_RATE_LIMIT_CREATE: 'system:apiRateLimit:create',
  API_RATE_LIMIT_EDIT: 'system:apiRateLimit:edit',
  API_RATE_LIMIT_DELETE: 'system:apiRateLimit:delete',
  API_RATE_LIMIT_ENABLE: 'system:apiRateLimit:enable',
  API_RATE_LIMIT_DISABLE: 'system:apiRateLimit:disable',

  // IP 访问控制
  IP_ACL_LIST: 'system:ipAcl:list',
  IP_ACL_CREATE: 'system:ipAcl:create',
  IP_ACL_EDIT: 'system:ipAcl:edit',
  IP_ACL_DELETE: 'system:ipAcl:delete',
  IP_ACL_ENABLE: 'system:ipAcl:enable',
  IP_ACL_DISABLE: 'system:ipAcl:disable',

  // 用户黑名单
  USER_BLACKLIST_LIST: 'system:userBlacklist:list',
  USER_BLACKLIST_BAN: 'system:userBlacklist:ban',
  USER_BLACKLIST_UNBAN: 'system:userBlacklist:unban',
  USER_BLACKLIST_DELETE: 'system:userBlacklist:delete'
} as const

/** 系统管理权限 */
export const SYSTEM_PERMISSIONS = {
  // 用户管理
  USER_PROFILE_VIEW: 'system:user:profile:view',
  USER_LIST: 'system:user:list',
  USER_CREATE: 'system:user:create',
  USER_EDIT: 'system:user:edit',
  USER_DELETE: 'system:user:delete',

  // 角色管理
  ROLE_LIST: 'system:role:list',
  ROLE_CREATE: 'system:role:create',
  ROLE_EDIT: 'system:role:edit',
  ROLE_DELETE: 'system:role:delete',

  // 菜单管理
  MENU_LIST: 'system:menu:list',
  MENU_CREATE: 'system:menu:create',
  MENU_EDIT: 'system:menu:edit',
  MENU_DELETE: 'system:menu:delete',

  // 部门管理
  DEPT_LIST: 'system:dept:list',
  DEPT_CREATE: 'system:dept:create',
  DEPT_EDIT: 'system:dept:edit',
  DEPT_DELETE: 'system:dept:delete',

  // 岗位管理
  POST_LIST: 'system:post:list',
  POST_CREATE: 'system:post:create',
  POST_EDIT: 'system:post:edit',
  POST_DELETE: 'system:post:delete',

  // 字典管理
  DICT_LIST: 'system:dict:list',
  DICT_CREATE: 'system:dict:create',
  DICT_EDIT: 'system:dict:edit',
  DICT_DELETE: 'system:dict:delete',

  // 参数配置
  CONFIG_LIST: 'system:config:list',
  CONFIG_CREATE: 'system:config:create',
  CONFIG_EDIT: 'system:config:edit',
  CONFIG_DELETE: 'system:config:delete',

  // 文件管理
  FILE_LIST: 'system:file:list',
  FILE_UPLOAD: 'system:file:upload',
  FILE_DELETE: 'system:file:delete',

  // 租户管理
  TENANT_LIST: 'system:tenant:list',
  TENANT_CREATE: 'system:tenant:create',
  TENANT_EDIT: 'system:tenant:edit',
  TENANT_DELETE: 'system:tenant:delete',

  // 日志管理
  LOG_LIST: 'system:log:list',
  LOGIN_LOG_LIST: 'system:login-log:list',
  ONLINE_LIST: 'system:online:list',

  // 缓存监控
  CACHE_LIST: 'system:cache:list',
  CACHE_CLEAR: 'system:cache:clear',

  // 代码生成
  CODE_LIST: 'system:code:list',
  CODE_GENERATE: 'system:code:generate'
} as const

/** 工作流权限 */
export const WORKFLOW_PERMISSIONS = {
  // 流程任务
  TASK_TODO: 'workflow:task:todo',
  TASK_APPROVE: 'workflow:task:approve',
  TASK_REJECT: 'workflow:task:reject',

  // 流程实例
  PROCESS_MINE: 'workflow:process:mine',
  PROCESS_START: 'workflow:process:start',
  PROCESS_CANCEL: 'workflow:process:cancel',

  // 抄送
  COPY_LIST: 'workflow:copy:list',

  // 流程定义
  DEFINITION_LIST: 'workflow:definition:list',
  DEFINITION_VIEW: 'workflow:definition:view',
  DEFINITION_CREATE: 'workflow:definition:create',
  DEFINITION_EDIT: 'workflow:definition:edit',
  DEFINITION_DELETE: 'workflow:definition:delete',

  // 流程监控
  MONITOR_LIST: 'workflow:monitor:list',

  // 部署管理
  DEPLOY_LIST: 'workflow:deploy:list',
  DEPLOY_CREATE: 'workflow:deploy:create',
  DEPLOY_DELETE: 'workflow:deploy:delete',

  // 流程预警
  ALERT_LIST: 'workflow:alert:list',

  // 性能统计
  PERFORMANCE_VIEW: 'workflow:performance:view',

  // 表单管理
  FORM_LIST: 'workflow:form:list',
  FORM_CREATE: 'workflow:form:create',
  FORM_EDIT: 'workflow:form:edit',
  FORM_DELETE: 'workflow:form:delete',

  // 流程分类
  CATEGORY_LIST: 'workflow:category:list',
  CATEGORY_CREATE: 'workflow:category:create',
  CATEGORY_EDIT: 'workflow:category:edit',
  CATEGORY_DELETE: 'workflow:category:delete',

  // 流程导入
  IMPORT_MANAGE: 'workflow:import:manage',

  // 模板管理
  TEMPLATE_ADD: 'workflow:template:add',
  TEMPLATE_LIST: 'workflow:template:list'
} as const

/** 所有权限码（用于类型推断和权限验证） */
export const ALL_PERMISSIONS = {
  ...CRM_PERMISSIONS,
  ...OA_PERMISSIONS,
  ...HR_PERMISSIONS,
  ...SYSTEM_SECURITY_PERMISSIONS,
  ...SYSTEM_PERMISSIONS,
  ...WORKFLOW_PERMISSIONS
} as const

/** 权限码类型 */
export type PermissionCode = typeof ALL_PERMISSIONS[keyof typeof ALL_PERMISSIONS]
