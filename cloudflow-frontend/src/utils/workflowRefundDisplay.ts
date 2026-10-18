export interface RefundApprovalField {
  key: string;
  label: string;
  value: string;
}

export const getRefundApproverDescription = (description?: string): string | undefined => {
  if (description?.includes('customerOwnerApproverIds')) return '客户业务负责人';
  if (description?.includes('financeReviewerIds')) return '另一名财务（排除申请人和首审人）';
  return description;
};

export const getRefundApprovalFields = (snapshot: unknown): RefundApprovalField[] | null => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const detail = snapshot as Record<string, unknown>;
  const text = (key: string) => typeof detail[key] === 'string' ? detail[key].trim() : '';
  const amount = text('refundAmount');
  const currency = text('currency');
  const receiptId = text('receiptEventId');
  if (!/^\d{1,12}\.\d{2}$/.test(amount) || !/[1-9]/.test(amount) || !/^[A-Z]{3}$/.test(currency)
    || !/^[1-9]\d*$/.test(receiptId) || typeof detail.reason !== 'string'
    || ['approvalNo', 'customerName', 'receivableName', 'businessOwnerName'].some(key => !text(key))) return null;
  return [
    { key: 'approvalNo', label: '退款申请单号', value: text('approvalNo') },
    { key: 'customerName', label: '客户', value: text('customerName') },
    { key: 'receivableName', label: '回款计划', value: text('receivableName') },
    { key: 'receiptEventId', label: '原收款记录', value: `#${receiptId}` },
    { key: 'refundAmount', label: '本次退款金额', value: `${currency} ${amount}` },
    { key: 'businessOwnerName', label: '客户业务负责人', value: text('businessOwnerName') },
    { key: 'reason', label: '退款原因', value: text('reason') || '未填写' },
  ];
};
