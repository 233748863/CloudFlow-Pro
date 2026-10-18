import type { PortalFinanceRecord } from '@/services/portalFinanceTypes';
import './portal-finance.css';

const statuses: Record<string, string> = {
  PLANNED: '待回款', PENDING: '待回款', PARTIAL: '部分回款', PARTIAL_RECEIVED: '部分回款', RECEIVED: '已回款', COMPLETED: '已完成',
  OVERDUE: '已逾期', WRITTEN_OFF: '已核销', WRITEOFF: '已核销', CANCELLED: '已取消',
  REGISTERED: '已登记', BOUND: '已绑定', WRITEOFF_PARTIAL: '部分核销', WRITEOFF_FULL: '全部核销', VOID: '已作废',
};
export default function PortalFinanceContent({ record }: { record: PortalFinanceRecord }) {
  const fields: [string, string | undefined][] = record.kind === 'RECEIVABLE'
    ? [['回款编号', record.number], ['计划金额', record.plannedAmount], ['已回款金额', record.receivedAmount],
      ['未回款金额', record.outstandingAmount], ['应收日期', record.dueDate], ['实收日期', record.receivedDate]]
    : [['发票号码', record.number], ['发票代码', record.invoiceCode], ['发票类型', record.invoiceType],
      ['开票日期', record.invoiceDate], ['含税金额', record.grossAmount], ['税额', record.taxAmount]];
  return <dl className="finance-fields">{[...fields, ['状态', statuses[record.status] || record.status]].map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value ?? '未填写'}</dd></div>)}</dl>;
}
