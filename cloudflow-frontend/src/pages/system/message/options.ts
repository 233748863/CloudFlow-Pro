import type { MessageCategory, MessageChannelType, MessageSendStatus } from '@/services/api/message';

export const CHANNEL_LABELS: Record<MessageChannelType, string> = {
  INTERNAL: '站内消息', EMAIL: '邮件', SMS: '短信', WECOM: '企业微信',
  DINGTALK: '钉钉', FEISHU: '飞书', WEBHOOK: '回调通知',
};
export const CATEGORY_LABELS: Record<MessageCategory, string> = {
  TODO: '待办', CC: '抄送', ANNOUNCEMENT: '公告', SYSTEM: '系统', BIZ_REMINDER: '业务提醒',
};
export const SEND_STATUS_LABELS: Record<MessageSendStatus, string> = {
  PENDING: '等待发送', CLAIMED: '已领取待发送', SENDING: '发送中', RETRYABLE: '等待安全重试',
  UNKNOWN: '结果未确认', SUCCESS: '站内送达 / 外部接纳', FAILED: '发送失败',
  CANCELLED: '已取消', SKIPPED: '已跳过',
};
export const SKIP_REASON_LABELS: Record<string, string> = {
  UNSUBSCRIBED: '用户已取消订阅', QUIET_HOURS: '处于免打扰时段', DEDUPED: '重复消息',
  NO_CHANNEL: '无可用渠道', NOT_IMPLEMENTED: '渠道尚未接入',
  CHANNEL_DISABLED: '渠道已停用', CHANNEL_CHANGED: '渠道配置已变更',
  SOURCE_NOT_CONFIGURED: '业务来源验证尚未配置，已停止外发', SOURCE_CANCELLED: '来源业务已取消',
  TEMPLATE_CHANGED: '模板已变更或停用', RECEIVER_UNAVAILABLE: '接收人不可用',
  NO_IM_MAPPING: '员工没有有效的企业微信绑定，或管理员已停止管理',
  IM_DISABLED: '企业通信接入未启用', IM_MESSAGE_DISABLED: '当前租户的企业微信应用消息未启用',
  IM_MESSAGE_TENANT_UNAVAILABLE: '当前企业已停用或到期', IM_SECRET_UNAVAILABLE: '企业通信凭据不可用',
  IM_CONFIGURATION_INVALID: '企业通信配置不完整或格式不正确',
  IM_MESSAGE_CONTENT_INVALID: '消息内容过长或详情链接无效，请核对模板',
  IM_MESSAGE_PROVIDER_UNAVAILABLE: '企业微信暂不可用，等待安全重试',
  IM_MESSAGE_PROVIDER_REJECTED: '企业微信拒绝了此次发送',
  IM_MESSAGE_RECIPIENT_REJECTED: '员工不在应用可见范围内或没有接收许可',
  IM_MESSAGE_TOKEN_REJECTED: '企业微信访问凭据已失效，等待安全重试',
  IM_MESSAGE_OUTCOME_UNKNOWN: '发送结果未确认，请核验后处理',
  IM_MESSAGE_CONFIGURATION_INVALID: '企业微信发送配置无效',
  IM_MESSAGE_PREFLIGHT_UNAVAILABLE: '发送前的账号与绑定检查暂不可用，等待安全重试',
  IM_MESSAGE_LOCAL_RECEIVER_REQUIRED: '企业微信通知须选择本地员工',
  IM_MESSAGE_ATTACHMENTS_UNSUPPORTED: '企业微信通知不支持邮件附件，请使用详情链接',
};
export const channelOptions = Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }));
export const categoryOptions = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
export const statusOptions = [{ value: 'ENABLED', label: '启用' }, { value: 'DISABLED', label: '停用' }];
