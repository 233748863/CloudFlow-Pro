import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button, ListResultFooter } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { downloadBlob } from '@/utils/download';
import { hrAdvanceApi } from '@/services/api/hr/advances';
import type { AdvanceQuery, AdvanceSummary } from '@/services/api/hr/advanceTypes';
import { Hr09ErrorNotice, Hr09Input, Hr09Notice, Hr09Page, Hr09Select, Hr09State, Hr09Value, asOptions, dateTimeText, useHr09Mutation, useHr09Resource } from '../components/Hr09Shared';
import { AdvanceApprovalDialog, AdvanceDraftDialog, AdvanceFinanceDialog } from './AdvanceDialogs';
import './advances.css';

const statuses = { APPLYING: '申请中', APPROVED: '审批通过，待放款', PAID: '已放款', REPAYING: '还款中', CLEARED: '已还清', WRITTEN_OFF: '余额已核销' };
const approvals = { DRAFT: '未提交草稿', SUBMITTED: '审批中', APPROVED: '审批通过', REJECTED: '已拒绝', CANCELLED: '已撤回' };
const repaymentStatuses = { RESERVED: '工资或结算已预约，尚未还款', POSTED: '已实际入账', RELEASED: '预约已释放', REVERSED: '原款已关联冲正' };
const repaymentTypes = { SALARY: '工资扣还', MANUAL: '人工还款', SETTLEMENT: '离职结算' };
const amount = (value: string) => `${value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}元`;

function AdvanceDetailDialog({ advanceId, mine, onClose, onChanged }: { advanceId: string; mine: boolean; onClose: () => void; onChanged: () => void }) {
  const { hasPermission } = useAuth();
  const detail = useHr09Resource(signal => hrAdvanceApi.detail(advanceId, mine, signal), [advanceId, mine]);
  const [page, setPage] = useState(1);
  const repayments = useHr09Resource(signal => hrAdvanceApi.repayments(advanceId, mine, { pageNum: page, pageSize: 20 }, signal), [advanceId, mine, page, detail.data?.advance.version]);
  const [action, setAction] = useState<'edit' | 'repay' | 'writeoff' | 'submit' | 'withdraw'>();
  const downloader = useHr09Mutation();
  const changed = () => { setAction(undefined); detail.refresh(); repayments.refresh(); onChanged(); };
  const record = detail.data?.advance;
  return <>
    <BaseDialog open title={mine ? '本人借款详情' : '员工借款详情'} onClose={onClose} width="wide" panelClassName="advance-workspace"
      footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onClose}>关闭</Button><Button variant="outline" onClick={() => { detail.refresh(); repayments.refresh(); }}>刷新详情</Button>
        {detail.data?.canEdit && <Button onClick={() => setAction('edit')}>编辑草稿</Button>}
        {mine && record?.status === 'APPLYING' && record.approvalStatus === 'DRAFT' && hasPermission('hr:advance:submit') && <Button onClick={() => setAction('submit')}>提交审批</Button>}
        {mine && record?.status === 'APPLYING' && record.approvalStatus === 'SUBMITTED' && hasPermission('hr:advance:submit') && <Button variant="outline" onClick={() => setAction('withdraw')}>撤回申请</Button>}
        {!mine && detail.data?.canRepay && <Button onClick={() => setAction('repay')}>登记实际还款</Button>}
        {!mine && detail.data?.canWriteoff && <Button variant="warning" onClick={() => setAction('writeoff')}>核销本金</Button>}
      </div>}>
      {detail.loading ? <Hr09State loading title="正在读取借款详情" /> : detail.error ? <Hr09State error title="借款详情读取失败" description={detail.error.message} onRetry={detail.refresh} /> : record ? <div className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Hr09Value label="员工">{record.employeeName}</Hr09Value><Hr09Value label="借款单号">{record.advanceNo}</Hr09Value><Hr09Value label="状态">{statuses[record.status]} · {approvals[record.approvalStatus]}</Hr09Value>
          <Hr09Value label="申请金额">{amount(record.amount)}</Hr09Value><Hr09Value label="实际未还本金">{amount(record.outstandingAmount)}</Hr09Value><Hr09Value label="工资或结算预约">{amount(record.reservedAmount)}</Hr09Value>
          <Hr09Value label="实际已还">{amount(record.repaidAmount)}</Hr09Value><Hr09Value label="已核销本金">{amount(record.writtenOffAmount)}</Hr09Value><Hr09Value label="实际放款时间">{record.paidTime ? dateTimeText(record.paidTime) : '尚未实际放款'}</Hr09Value>
          <Hr09Value label="还款方式">{record.repayMode === 'SALARY_DEDUCT' ? `${record.repayStartMonth}起，计划${record.repayMonths}期，每期${record.monthlyDeductAmount}元，末期按余额` : '一次性归还'}</Hr09Value>
          <div className="sm:col-span-2"><Hr09Value label="用途">{record.purpose}</Hr09Value></div>
        </dl>
        <Hr09Notice>预约金额已包含在未还本金中；实际还款、核销和反向流水分开记录。</Hr09Notice>
        <section className="space-y-3" aria-label="还款流水"><h2 className="text-base font-semibold text-cf-title">还款流水</h2>
          {repayments.loading ? <Hr09State loading title="正在读取还款流水" /> : repayments.error ? <Hr09State error title="还款流水读取失败" description={repayments.error.message} onRetry={repayments.refresh} /> : !repayments.data?.rows.length ? <Hr09State title="暂无还款流水" /> : <div className="grid gap-3">{repayments.data.rows.map(entry => <article className="rounded-lg border border-[var(--cf-border)] p-4" key={entry.repaymentId}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium text-cf-title">{entry.reversalOfId ? '反向入账' : repaymentTypes[entry.repayType]} · {amount(entry.amount)}</p><p className="mt-1 text-sm text-cf-subtle">{repaymentStatuses[entry.status]} · {entry.repayDate || '尚未实际还款'}</p></div>
              {entry.proofFileId && <Button variant="outline" disabled={downloader.busy} onClick={() => void downloader.run(async () => {
                const proof = await hrAdvanceApi.downloadProof(advanceId, entry.proofFileId!);
                const extension = proof.type === 'application/pdf' ? 'pdf' : proof.type === 'image/png' ? 'png' : 'jpg';
                downloadBlob(proof, `还款凭据-${entry.proofFileId}.${extension}`);
              })}>下载凭据</Button>}
            </div>{entry.reversalOfId && <p className="mt-2 text-xs text-cf-subtle">关联原收款：{entry.reversalOfId}</p>}{entry.remark && <p className="mt-2 break-words whitespace-pre-wrap text-sm text-cf-body">{entry.remark}</p>}
          </article>)}</div>}
          {repayments.data && <ListResultFooter total={repayments.data.total} page={page} pageSize={20} summary={`共${repayments.data.total}笔流水`} onPageChange={setPage} />}
          <Hr09ErrorNotice error={downloader.error} />
        </section>
      </div> : <Hr09State error title="未收到完整借款信息" onRetry={detail.refresh} />}
    </BaseDialog>
    {record && action === 'edit' && <AdvanceDraftDialog record={record} onClose={() => setAction(undefined)} onSaved={changed} />}
    {record && (action === 'submit' || action === 'withdraw') && <AdvanceApprovalDialog record={record} withdraw={action === 'withdraw'} onClose={() => setAction(undefined)} onSaved={changed} />}
    {record && (action === 'repay' || action === 'writeoff') && <AdvanceFinanceDialog record={record} kind={action} onClose={() => setAction(undefined)} onSaved={changed} />}
  </>;
}

export function AdvanceWorkspace({ mine }: { mine: boolean }) {
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState<AdvanceQuery>({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<string>();
  const [creating, setCreating] = useState(false);
  const list = useHr09Resource(signal => hrAdvanceApi.list(query, mine, signal), [mine, JSON.stringify(query)]);
  const change = (update: AdvanceQuery) => setQuery(previous => ({ ...previous, pageNum: 1, ...update }));
  const renderCard = (row: AdvanceSummary) => <article key={row.advanceId} className="advance-card">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-words font-semibold text-cf-title">{mine ? row.purpose : row.employeeName}</h2><p className="mt-1 break-all text-xs text-cf-subtle">{row.advanceNo}</p></div><span className="text-sm font-medium text-cf-body">{row.status === 'APPLYING' ? approvals[row.approvalStatus] : statuses[row.status]}</span></div>
    <dl className="mt-4 grid grid-cols-2 gap-3"><Hr09Value label="申请金额">{amount(row.amount)}</Hr09Value><Hr09Value label="实际未还本金">{amount(row.outstandingAmount)}</Hr09Value><Hr09Value label="工资或结算预约">{amount(row.reservedAmount)}</Hr09Value><Hr09Value label="已核销本金">{amount(row.writtenOffAmount)}</Hr09Value></dl>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-cf-subtle">{row.applyDate} · {row.repayMode === 'SALARY_DEDUCT' ? '工资分期扣还' : '一次性归还'}</p><Button variant="outline" onClick={() => setSelected(row.advanceId)}>查看借款</Button></div>
  </article>;
  return <div className="advance-workspace"><Hr09Page title={mine ? '我的借款' : '员工借款管理'}
    description={mine ? '仅显示本人借款，草稿、实际放款和还款结果分别记录。' : '仅显示授权范围内员工；财务核验实际还款凭据，核销单独记账。'}
    actions={<><Button variant="outline" disabled={list.loading} onClick={list.refresh}><RefreshCw size={16} className="mr-2" />刷新</Button>{mine && hasPermission('hr:advance:apply') && <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" />新建借款草稿</Button>}</>}>
    <Hr09Notice>{hasPermission('hr:advance:submit') ? '草稿不占额度；提交时核对已生效固定月薪和已发布规则，经部门负责人、财务审批后等待实际放款。' : '当前可保存本人草稿；有提交权限且额度规则已核定后，才能提交审批。'}</Hr09Notice>
    <form className="advance-filters" onSubmit={event => { event.preventDefault(); change({ keyword: keyword.trim() || undefined }); }}>
      <Hr09Input label={mine ? '借款单号' : '员工姓名或借款单号'} value={keyword} maxLength={64} onChange={event => setKeyword(event.target.value)} />
      <Hr09Select label="借款状态" value={query.status || ''} options={asOptions(statuses)} placeholder="全部状态" onChange={status => change({ status: status || undefined })} />
      <Hr09Select label="审批状态" value={query.approvalStatus || ''} options={asOptions(approvals)} placeholder="全部状态" onChange={approvalStatus => change({ approvalStatus: approvalStatus || undefined })} />
      <Button type="submit" variant="outline">查询</Button>
    </form>
    {list.loading ? <Hr09State loading title="正在读取借款记录" /> : list.error ? <Hr09State error title="借款记录读取失败" description={list.error.message} onRetry={list.refresh} /> : !list.data?.rows.length ? <Hr09State title={mine ? '本人暂无借款记录' : '当前范围暂无借款记录'} /> : <div className="advance-list">{list.data.rows.map(renderCard)}</div>}
    {list.data && <ListResultFooter total={list.data.total} page={query.pageNum || 1} pageSize={20} summary={`共${list.data.total}笔借款`} onPageChange={pageNum => change({ pageNum })} />}
    {creating && <AdvanceDraftDialog onClose={() => setCreating(false)} onSaved={advanceId => { list.refresh(); setSelected(advanceId); }} />}
    {selected && <AdvanceDetailDialog key={`${mine}:${selected}`} advanceId={selected} mine={mine} onClose={() => setSelected(undefined)} onChanged={list.refresh} />}
  </Hr09Page></div>;
}
