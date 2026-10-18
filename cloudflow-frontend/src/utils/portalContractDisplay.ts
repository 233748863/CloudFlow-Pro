import { decimalAmount, groupAmountDigits } from './amountValue';

export const portalContractMoney = (amount: string | null | undefined, currency?: string): string => {
  const value = decimalAmount(amount);
  if (!value) return '未填写';
  const [integer, fraction] = value.toFixed(2).split('.');
  return `${currency || '币种待核对'} ${groupAmountDigits(integer)}.${fraction}`;
};

const contractStatuses: Record<string, string> = { SIGNED: '已签署', ACTIVE: '履行中', EXPIRED: '已到期', TERMINATED: '已终止' };
const termStatuses: Record<string, string> = { PENDING: '待履约', FULFILLED: '已履约', WAIVED: '已豁免', OVERDUE: '已逾期' };
const milestoneStatuses: Record<string, string> = { PENDING: '待进行', IN_PROGRESS: '进行中', DONE: '已完成', OVERDUE: '已逾期', CANCELLED: '已取消' };
const paymentStatuses: Record<string, string> = { PENDING: '待付款', PAID: '已付款', OVERDUE: '已逾期', CANCELLED: '已取消' };

export const portalContractStatus = (status: string): string => contractStatuses[status] || '状态待核对';
export const portalTermStatus = (status: string): string => termStatuses[status] || '状态待核对';
export const portalMilestoneStatus = (status: string): string => milestoneStatuses[status] || '状态待核对';
export const portalPaymentStatus = (status: string): string => paymentStatuses[status] || '状态待核对';
