import { Ban, FileSearch, Gauge, ListChecks, Shield } from 'lucide-vue-next'
import {
  activeOptions,
  dateTime,
  enabledOptions,
  number,
  select,
  text,
  type RecordPageConfig
} from '@/pages/shared/recordPageConfig'

const effectOptions = [
  { value: '', label: '全部效果' },
  { value: 'PASS', label: '放行' },
  { value: 'WARN', label: '提醒' },
  { value: 'ALERT', label: '告警' },
  { value: 'BLOCK', label: '阻断' }
]

const dimensionOptions = [
  { value: '', label: '全部维度' },
  { value: 'IP', label: 'IP' },
  { value: 'USER', label: '用户' },
  { value: 'TENANT', label: '租户' },
  { value: 'GLOBAL', label: '全局' }
]

const aclModeOptions = [
  { value: '', label: '全部模式' },
  { value: 'BLACK', label: '黑名单' },
  { value: 'WHITE', label: '白名单' }
]

const securityConfig = (
  config: Omit<RecordPageConfig, 'eyebrow' | 'searchPlaceholder'>
): RecordPageConfig => ({
  eyebrow: 'System Security',
  searchPlaceholder: '名称/编码/关键字',
  ...config
})

export const systemSecurityPageConfigs: RecordPageConfig[] = [
  securityConfig({
    path: '/system/rules',
    title: '业务规则',
    description: '维护跨模块业务规则、阈值、效果和启停状态。',
    icon: ListChecks,
    listPath: '/auth/system/rules/list',
    createPath: '/auth/system/rules',
    updatePath: '/auth/system/rules',
    deletePath: '/auth/system/rules',
    idKey: 'id',
    primaryKey: 'ruleName',
    fields: [
      text('ruleName', '规则名称', { required: true, filter: true }),
      text('ruleCode', '规则编码', { required: true, filter: true }),
      text('module', '模块', { filter: true }),
      number('thresholdValue', '阈值'),
      select('effect', '效果', effectOptions, { filter: true }),
      select('enabled', '状态', enabledOptions, { filter: true }),
      number('priority', '优先级')
    ],
    actions: [
      { label: '启用', tone: 'success', visible: (row) => Number(row.enabled) !== 1, path: (row) => `/auth/system/rules/${row.id}/enabled?enabled=1`, method: 'put' },
      { label: '停用', tone: 'warning', visible: (row) => Number(row.enabled) === 1, path: (row) => `/auth/system/rules/${row.id}/enabled?enabled=0`, method: 'put' }
    ]
  }),
  securityConfig({
    path: '/system/audit-events',
    title: '审计事件',
    description: '查看跨业务审计事件、操作人和事件类型。',
    icon: FileSearch,
    listPath: '/oa/audit/events',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'eventType',
    fields: [
      text('businessType', '业务类型', { filter: true }),
      text('businessId', '业务ID', { filter: true }),
      text('eventType', '事件类型', { filter: true }),
      text('operatorName', '操作人', { filter: true }),
      dateTime('createTime', '事件时间')
    ]
  }),
  securityConfig({
    path: '/system/api-ratelimit',
    title: '接口限流',
    description: '维护接口限流规则、维度、RPS、突发量和拒绝策略。',
    icon: Gauge,
    listPath: '/auth/system/api-ratelimit/page',
    createPath: '/auth/system/api-ratelimit',
    updatePath: '/auth/system/api-ratelimit',
    deletePath: '/auth/system/api-ratelimit',
    deleteMode: 'single',
    idKey: 'id',
    primaryKey: 'ruleName',
    fields: [
      text('ruleName', '规则名称', { required: true, filter: true }),
      text('ruleCode', '规则编码', { required: true, filter: true }),
      text('serviceName', '服务名', { filter: true }),
      text('pathPattern', '路径模式', { required: true }),
      text('httpMethod', '方法'),
      select('dimension', '维度', dimensionOptions, { filter: true }),
      number('rps', 'RPS', { required: true }),
      number('burst', '突发量'),
      select('status', '状态', activeOptions, { filter: true }),
      number('priority', '优先级')
    ],
    actions: [
      { label: '启用', tone: 'success', visible: (row) => String(row.status) !== 'ACTIVE', path: (row) => `/auth/system/api-ratelimit/${row.id}/status?status=ACTIVE`, method: 'put' },
      { label: '停用', tone: 'warning', visible: (row) => String(row.status) === 'ACTIVE', path: (row) => `/auth/system/api-ratelimit/${row.id}/status?status=INACTIVE`, method: 'put' }
    ]
  }),
  securityConfig({
    path: '/system/ip-acl',
    title: 'IP 访问控制',
    description: '维护 IP 黑白名单、规则类型、优先级和生效状态。',
    icon: Shield,
    listPath: '/auth/system/ipAcl/page',
    createPath: '/auth/system/ipAcl',
    updatePath: '/auth/system/ipAcl',
    deletePath: '/auth/system/ipAcl',
    deleteMode: 'single',
    idKey: 'id',
    primaryKey: 'ruleName',
    fields: [
      text('ruleName', '规则名称', { required: true, filter: true }),
      text('ruleCode', '规则编码', { required: true, filter: true }),
      text('ipPattern', 'IP 范围', { required: true, filter: true }),
      text('ruleType', '规则类型'),
      select('mode', '模式', aclModeOptions, { filter: true }),
      number('priority', '优先级'),
      select('status', '状态', activeOptions, { filter: true }),
      dateTime('expireAt', '过期时间')
    ],
    actions: [
      { label: '启用', tone: 'success', visible: (row) => String(row.status) !== 'ACTIVE', path: (row) => `/auth/system/ipAcl/${row.id}/status?status=ACTIVE`, method: 'put' },
      { label: '停用', tone: 'warning', visible: (row) => String(row.status) === 'ACTIVE', path: (row) => `/auth/system/ipAcl/${row.id}/status?status=INACTIVE`, method: 'put' }
    ]
  }),
  securityConfig({
    path: '/system/user-blacklist',
    title: '用户黑名单',
    description: '维护受限用户、原因、过期时间和解禁操作。',
    icon: Ban,
    listPath: '/auth/system/userBlacklist/page',
    createPath: '/auth/system/userBlacklist',
    updatePath: '/auth/system/userBlacklist',
    deletePath: '/auth/system/userBlacklist',
    deleteMode: 'single',
    idKey: 'id',
    primaryKey: 'userName',
    fields: [
      number('userId', '用户ID', { required: true, filter: true }),
      text('userName', '用户名称', { filter: true }),
      text('reason', '原因', { type: 'textarea', table: true }),
      select('status', '状态', activeOptions, { filter: true }),
      dateTime('expireAt', '过期时间'),
      text('opUserName', '操作人')
    ],
    actions: [
      { label: '解禁', tone: 'success', visible: (row) => String(row.status) === 'ACTIVE', path: (row) => `/auth/system/userBlacklist/${row.id}/unban` }
    ]
  })
]

export const systemSecurityPageConfigByPath = new Map(systemSecurityPageConfigs.map((config) => [config.path, config]))
