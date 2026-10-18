import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Textarea } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { consumableLedgerApi, consumableRequestApi, type ConsumableLedgerRow, type ConsumableQuery, type ConsumableRequestResult, type ConsumableRequestView, type ConsumableSubmitRequest } from '@/services/api/consumableLedger';
import { getErrorMessage } from '@/utils/errorMessage';
import { ConsumableField, ConsumableMutationNotice, ConsumablePagination, ConsumableSelect, ConsumableTableState, moneyText, requestStatusLabel, transactionLabel, useConsumableMutation, useConsumablePage } from './consumable/consumableUi';
import ConsumableRequestEditor from './consumable/ConsumableRequestEditor';
import ConsumableIssueDialog from './consumable/ConsumableIssueDialog';
import ConsumableLedgerActionDialog from './consumable/ConsumableLedgerActionDialog';

function SubmitDialog({ request, onClose, onSaved }: { request: ConsumableRequestView; onClose: () => void; onSaved: () => void }) {
  const mutation = useConsumableMutation<ConsumableSubmitRequest, ConsumableRequestResult>(`request:submit:${request.requestId}`, (body) => consumableRequestApi.submit(request.requestId, body));
  const submit = async () => { const result = await mutation.run((operationKey) => ({ operationKey, version: request.version })); if (result) onSaved(); };
  return <BaseDialog open title={`提交审批 · ${request.requestNo}`} onClose={() => { if (!mutation.busy) onClose(); }} footer={<><Button variant="outline" onClick={onClose} disabled={mutation.busy}>{mutation.result ? '完成' : '关闭'}</Button>{!mutation.result && <Button onClick={() => void submit()} disabled={mutation.busy}>{mutation.busy ? '提交中…' : mutation.frozen ? '按原请求重试' : '确认提交'}</Button>}</>}>
    <div className="space-y-4"><p className="text-sm text-cf-body">审批人由已发布规则及负责人配置决定；原申请人不能审批本人申请，审批通过后由仓管分批发料。</p><ConsumableMutationNotice error={mutation.error} pending={!!mutation.frozen} operationKey={mutation.frozen?.operationKey} onDiscard={mutation.discard} busy={mutation.busy} />{mutation.result && <p role="status">{mutation.result.replayed ? '已返回首次提交结果。' : '申请已提交。'}{mutation.result.approvalPending ? '正在创建真实审批实例，请刷新详情查看进度。' : `提交结果：${requestStatusLabel[mutation.result.status]}`}</p>}</div>
  </BaseDialog>;
}

function CancelDialog({ request, onClose, onSaved }: { request: ConsumableRequestView; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancel = async () => {
    if (!reason.trim()) { setError('请填写取消原因'); return; }
    setBusy(true); setError('');
    try { await consumableRequestApi.cancel(request.requestId, { version: request.version, reason: reason.trim() }); onSaved(); onClose(); }
    catch (failure) { setError(getErrorMessage(failure, '取消失败')); }
    finally { setBusy(false); }
  };
  return <BaseDialog open title={`取消未发料申请 · ${request.requestNo}`} onClose={() => { if (!busy) onClose(); }} footer={<><Button variant="outline" onClick={onClose} disabled={busy}>关闭</Button><Button onClick={() => void cancel()} disabled={busy}>确认取消</Button></>}><div className="space-y-4"><p className="text-sm text-cf-subtle">仅本人可取消尚未发料的草稿、驳回或已批准申请；审批中及已经发料的申请不能取消。</p>{error && <p role="alert" className="text-rose-600">{error}</p>}<ConsumableField label="取消原因"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={255} disabled={busy} rows={3} /></ConsumableField></div></BaseDialog>;
}

type Scope = 'SELF' | 'DEPARTMENT' | 'DISPATCH';

function RequestWorkspace() {
  const { user, hasPermission } = useAuth();
  const [search] = useSearchParams();
  const tabs = [{ value: 'SELF', label: '我的申请', permission: 'oa:consumable-request:list' }, { value: 'DEPARTMENT', label: '部门范围', permission: 'oa:consumable-request:dept-list' }, { value: 'DISPATCH', label: '待发料 / 发料记录', permission: 'oa:consumable-request:dispatch' }].filter((tab) => hasPermission(tab.permission));
  const [scope, setScope] = useState<Scope>(() => (tabs.find((tab) => tab.value === search.get('scope')) ?? tabs[0]).value as Scope);
  const [query, setQuery] = useState<ConsumableQuery>({ pageNum: 1, pageSize: 10 });
  const [filters, setFilters] = useState({ requestNo: '', status: '', applicantName: '', deptId: '' });
  const [detail, setDetail] = useState<ConsumableRequestView | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editor, setEditor] = useState<'new' | ConsumableRequestView | null>(null);
  const [operation, setOperation] = useState<'submit' | 'cancel' | 'issue' | null>(null);
  const [returnRow, setReturnRow] = useState<ConsumableLedgerRow | null>(null);
  const loader = useCallback(() => consumableRequestApi.list(scope, query), [scope, query]);
  const { data, loading, error, refresh } = useConsumablePage(loader);
  const cost = hasPermission('oa:consumable-ledger:cost');
  const canDetail = scope === 'DISPATCH' || hasPermission('oa:consumable-request:query');
  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try { setDetail(await consumableRequestApi.detail(id, scope === 'DISPATCH')); }
    catch (failure) { toast.error(getErrorMessage(failure, '领用详情不可见')); }
    finally { setLoadingDetail(false); }
  };
  useEffect(() => { const id = search.get('requestId'); if (id && canDetail) void openDetail(id); }, [search, scope, canDetail]);
  const changeScope = (value: Scope) => { setScope(value); setQuery({ pageNum: 1, pageSize: 10 }); setFilters({ requestNo: '', status: '', applicantName: '', deptId: '' }); setDetail(null); };
  const saved = (result: ConsumableRequestResult) => { setEditor(null); void refresh(); void openDetail(result.requestId); };
  const closeOperation = () => { setOperation(null); if (detail) void openDetail(detail.requestId); };
  const own = detail && detail.applicantId === String(user?.id);
  const unissued = detail?.items.every((item) => item.issuedQuantity === 0 && item.returnedQuantity === 0);
  const returnStock = async (id: string) => {
    try { setReturnRow(await consumableLedgerApi.detail(id)); }
    catch (failure) { toast.error(getErrorMessage(failure, '台账详情加载失败')); }
  };
  const applyFilters = () => {
    if (filters.deptId && !/^[1-9]\d*$/.test(filters.deptId)) { toast.error('部门编号必须为正整数'); return; }
    setQuery({ pageNum: 1, pageSize: 10, requestNo: filters.requestNo.trim() || undefined, status: filters.status || undefined, applicantName: filters.applicantName.trim() || undefined, deptId: filters.deptId || undefined });
  };
  return <section className="admin-source-page consumable-request-page"><TablePageLayout
    actions={<header className="admin-source-header"><div><p className="admin-source-kicker">CONSUMABLE REQUESTS</p><h2 className="flex items-center gap-2"><ClipboardList size={22} />耗材领用</h2><span>本人申请、真实审批、分批发料与退回记录</span></div><div className="flex gap-2"><Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} />刷新</Button>{hasPermission('oa:consumable-request:add') && hasPermission('oa:consumable-request:lookup') && <Button onClick={() => setEditor('new')}><Plus size={16} />新建申请</Button>}</div></header>}
    filters={<section className="card space-y-4 p-4"><nav className="flex flex-wrap gap-2" aria-label="领用数据范围">{tabs.map((tab) => <Button key={tab.value} variant={scope === tab.value ? 'default' : 'outline'} aria-pressed={scope === tab.value} onClick={() => changeScope(tab.value as Scope)}>{tab.label}</Button>)}</nav><p className="text-xs text-cf-subtle">{scope === 'SELF' ? '仅显示当前登录人的申请，管理员也不扩大此范围。' : scope === 'DEPARTMENT' ? '仅显示授权部门范围，筛选只能缩小范围。' : '仅显示已批准或已发足的申请；退回不恢复批准发料额度。'}</p><div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5"><ConsumableField label="申请编号"><Input value={filters.requestNo} onChange={(event) => setFilters((previous) => ({ ...previous, requestNo: event.target.value }))} /></ConsumableField><ConsumableField label="状态"><ConsumableSelect label="申请状态" value={filters.status} onChange={(value) => setFilters((previous) => ({ ...previous, status: value }))} options={[{ value: '', label: '全部状态' }, ...Object.entries(requestStatusLabel).filter(([value]) => scope !== 'DISPATCH' || ['APPROVED', 'ISSUED'].includes(value)).map(([value, label]) => ({ value, label }))]} /></ConsumableField>{scope !== 'SELF' && <><ConsumableField label="申请人姓名"><Input value={filters.applicantName} onChange={(event) => setFilters((previous) => ({ ...previous, applicantName: event.target.value }))} /></ConsumableField><ConsumableField label="部门编号（可选）"><Input value={filters.deptId} onChange={(event) => setFilters((previous) => ({ ...previous, deptId: event.target.value }))} /></ConsumableField></>}<Button onClick={applyFilters}>查询</Button></div></section>}
    table={<InnerTableSurface><table className="unity-data-table admin-source-table min-w-[940px]"><thead><tr><th>申请编号</th><th>申请人 / 部门</th><th>用途</th><th>申请 / 期望日期</th><th>状态</th>{cost && <th>申请估价</th>}<th>操作</th></tr></thead><tbody><ConsumableTableState columns={cost ? 7 : 6} loading={loading} error={error} empty={!data.rows.length} onRetry={() => void refresh()} />{!loading && !error && data.rows.map((row) => <tr key={row.requestId}><td className="font-medium">{row.requestNo}</td><td>{row.applicantName}<div className="text-xs text-cf-subtle">{row.deptName}</div></td><td className="max-w-64 break-words">{row.purpose}</td><td>{row.applyDate}<div className="text-xs text-cf-subtle">{row.expectDate || '未指定期望日期'}</div></td><td>{requestStatusLabel[row.status]}</td>{cost && <td>{moneyText(row.totalAmount)}</td>}<td><Button variant="ghost" size="sm" disabled={!canDetail || loadingDetail} onClick={() => void openDetail(row.requestId)}>查看 / 办理</Button></td></tr>)}</tbody></table></InnerTableSurface>}
    pagination={<ConsumablePagination total={data.total} page={query.pageNum ?? 1} onChange={(pageNum) => setQuery((previous) => ({ ...previous, pageNum }))} />} />
    {detail && !operation && !editor && !returnRow && <BaseDialog open title={`领用申请 · ${detail.requestNo}`} description={`${requestStatusLabel[detail.status]} · 当前版本 ${detail.version}`} width="extra-wide" onClose={() => setDetail(null)} footer={<><Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>{own && unissued && ['DRAFT', 'REJECTED'].includes(detail.status) && hasPermission('oa:consumable-request:edit') && hasPermission('oa:consumable-request:lookup') && <Button variant="outline" onClick={() => setEditor(detail)}>编辑草稿</Button>}{own && detail.status === 'DRAFT' && hasPermission('oa:consumable-request:submit') && <Button onClick={() => setOperation('submit')}>提交审批</Button>}{own && unissued && ['DRAFT', 'REJECTED', 'APPROVED'].includes(detail.status) && hasPermission('oa:consumable-request:cancel') && <Button variant="outline" onClick={() => setOperation('cancel')}>取消申请</Button>}{detail.status === 'APPROVED' && hasPermission(['oa:consumable-request:dispatch', 'oa:consumable-request:issue'], true) && <Button onClick={() => setOperation('issue')}>分批发料</Button>}</>}>
      <div className="space-y-5"><dl className="grid gap-4 sm:grid-cols-3">{[['申请人', detail.applicantName], ['归属部门', detail.deptName], ['申请 / 期望日期', `${detail.applyDate} / ${detail.expectDate || '未指定'}`], ['用途', detail.purpose], ['审批实例', detail.instanceId || (detail.status === 'APPROVING' ? '正在绑定审批实例' : '无流程实例')], ['取消原因', detail.cancelReason || '—']].map(([label, value]) => <div key={label}><dt className="text-xs text-cf-subtle">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>)}</dl>
        {cost && <div className="flex flex-wrap gap-5 rounded-md bg-[var(--cf-surface-muted)] p-3 text-sm"><span>申请估价：{moneyText(detail.totalAmount)}</span><span>累计发料成本：{moneyText(detail.issuedAmount)}</span><span>累计退回成本：{moneyText(detail.returnedAmount)}</span></div>}
        <div className="overflow-x-auto"><table className="unity-data-table min-w-[820px]"><thead><tr><th>耗材 / 型号</th><th>单位</th><th>申请量</th><th>批准量</th><th>累计已发</th><th>累计已退</th><th>待发量</th>{cost && <th>估价</th>}<th>说明</th></tr></thead><tbody>{detail.items.map((item) => <tr key={item.itemId}><td>{item.consumableName}<div className="text-xs text-cf-subtle">{item.model || '—'}</div></td><td>{item.unit}</td><td>{item.applyQuantity}</td><td>{item.approvedQuantity}</td><td>{item.issuedQuantity}</td><td>{item.returnedQuantity}</td><td>{item.approvedQuantity - item.issuedQuantity}</td>{cost && <td>{moneyText(item.amount)}</td>}<td>{item.remark || '—'}</td></tr>)}</tbody></table></div>
        <section><h3 className="mb-2 text-sm font-medium">发料与退回记录</h3><div className="overflow-x-auto"><table className="unity-data-table min-w-[700px]"><thead><tr><th>时间</th><th>耗材</th><th>类型</th><th>数量</th><th>操作人</th><th>关联</th></tr></thead><tbody>{detail.transactions?.length ? detail.transactions.map((row) => <tr key={row.ledgerId}><td>{row.operateTime}</td><td>{row.consumableName}</td><td>{row.reversalOfLedgerId ? '冲正 · ' : ''}{transactionLabel[row.transactionType]}{row.reversed ? '（已冲正）' : ''}</td><td>{row.quantity} {row.unit}</td><td>{row.operatorName}</td><td><div className="flex flex-wrap gap-2">{hasPermission('oa:consumable-ledger:list') ? <Link className="text-sm underline" to={`/admin/consumable-ledger?ledgerId=${row.ledgerId}`}>台账 #{row.ledgerId}</Link> : `台账 #${row.ledgerId}`}{row.transactionType === 'OUTBOUND' && !row.reversed && !row.reversalOfLedgerId && row.returnedQuantity < Math.abs(row.quantity) && hasPermission(['oa:consumable:return', 'oa:consumable-ledger:list'], true) && <Button size="sm" variant="outline" onClick={() => void returnStock(row.ledgerId)}>退回登记</Button>}</div></td></tr>) : <tr><td colSpan={6} className="py-8 text-center text-cf-subtle">尚无库存流转；审批不会直接扣库存。</td></tr>}</tbody></table></div></section>
      </div>
    </BaseDialog>}
    {editor && <ConsumableRequestEditor key={editor === 'new' ? 'new' : editor.requestId} initial={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={saved} />}
    {detail && operation === 'submit' && <SubmitDialog key={detail.requestId} request={detail} onClose={closeOperation} onSaved={() => void refresh()} />}
    {detail && operation === 'cancel' && <CancelDialog request={detail} onClose={closeOperation} onSaved={() => void refresh()} />}
    {detail && operation === 'issue' && <ConsumableIssueDialog key={detail.requestId} request={detail} onClose={closeOperation} onSaved={() => void refresh()} />}
    {returnRow && <ConsumableLedgerActionDialog row={returnRow} action="return" onClose={() => { setReturnRow(null); if (detail) void openDetail(detail.requestId); }} onSaved={() => void refresh()} />}
  </section>;
}

export default function ConsumableRequestPage() {
  const { hasPermission } = useAuth();
  return hasPermission(['oa:consumable-request:list', 'oa:consumable-request:dept-list', 'oa:consumable-request:dispatch']) ? <RequestWorkspace /> : <p role="alert" className="p-6 text-cf-subtle">无耗材领用查询权限。</p>;
}
