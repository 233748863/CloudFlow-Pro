import { PrintButton } from '@/components/printing/PrintButton';
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BaseDialog, Button, Pagination } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { decimalAmount } from '@/utils/amountValue';
import { salaryStatusText } from '@/utils/hrPayrollDisplay';
import type { HrRecord } from '@/services/api/hr';
import { ruleGet, rulePost } from '@/services/api/hr/rules';
import { HrCrudPanel } from '../HrDomainWorkspace';
import { RulePage } from '../rules/RuleWorkspace';

const money = (value: unknown) => decimalAmount(String(value ?? 0))?.toFixed(2) ?? '—';

export default function HrEssPayrollPage() {
  const { hasPermission } = useAuth();
  const [search] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<HrRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<HrRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const result = await ruleGet<{ rows: HrRecord[]; total: number }>('/ess/salary-slips', { pageNum: page, pageSize }); setRows(result.rows); setTotal(result.total); } catch (error) { toast.error(getErrorMessage(error, '工资单加载失败')); } }, [page, pageSize]);
  useEffect(() => { void load(); }, [load]);
  const open = useCallback(async (id: number) => { try { setDetail(await ruleGet(`/ess/salary-slips/${id}`)); } catch (error) { toast.error(getErrorMessage(error, '工资单详情加载失败')); } }, []);
  useEffect(() => { const id = Number(search.get('id')); if (id > 0) void open(id); }, [search, open]);
  const fields: Record<string, string> = { grossTotal: '应发', deductionTotal: '扣款', taxAmount: '本期个税', netTotal: '实发', cumulativeTaxableIncome: '累计应税所得', cumulativeDeduction: '累计扣除', cumulativeTaxPayable: '累计应纳税', cumulativeTaxPaid: '累计已预扣税' };
  return <RulePage title="我的工资单" description="仅展示本人已确定工资单，可确认收悉和下载 PDF。" actions={<Button variant="outline" onClick={() => void load()}>刷新</Button>}>
    <HrCrudPanel title="本人工资单" rows={rows} columns={[{ key: 'periodMonth', label: '月份' }, ...Object.entries(fields).slice(0, 4).map(([key, label]) => ({ key, label, render: (row: HrRecord) => money(row[key]) })), { key: 'status', label: '状态', render: row => salaryStatusText(row.status) }, { key: 'employeeConfirmed', label: '确认', render: row => row.employeeConfirmed ? '已确认' : '待确认' }]} actions={row => [{ label: '查看工资单', semantic: 'view', onClick: () => void open(row.id) }]} />
    <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
    <BaseDialog open={detail !== null} title={`工资单 ${detail?.periodMonth || ''}`} width="wide" onClose={() => { if (!busy) setDetail(null); }} footer={detail && <div className="flex gap-2"><PrintButton bizType="SALARY_SLIP" bizId={detail.id} disabled={busy} />{!detail.employeeConfirmed && hasPermission('hr:ess:slip:confirm') && <Button disabled={busy} onClick={() => { setBusy(true); void rulePost(`/ess/salary-slips/${detail.id}/confirm`).then(async () => { toast.success('已确认收悉'); await load(); setDetail(null); }).catch(error => toast.error(getErrorMessage(error, '确认失败'))).finally(() => setBusy(false)); }}>确认收悉</Button>}</div>}>
      {detail && <dl className="grid gap-4 md:grid-cols-2">{Object.entries(fields).map(([key, label]) => <div key={key} className="flex justify-between gap-4 rounded border border-[var(--cf-border)] p-3"><dt>{label}</dt><dd>{money(detail[key])}</dd></div>)}</dl>}
    </BaseDialog>
  </RulePage>;
}
