import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, RefreshCw, ShieldCheck } from 'lucide-react';
import { BaseDialog, Button, Pagination, PermissionGuard } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { getImSyncOverview, getImSyncReport, listImSyncRuns, previewImSync } from '@/services/api/im';
import type { ImPage, ImSyncAction, ImSyncEntry, ImSyncHeader, ImSyncOverview, ImSyncReport } from '@/services/api/im';
import { platformHttpStatus } from '@/services/api/platformAccess';
import { getAuthSessionVersion } from '@/utils/authStorage';
import { getErrorMessage } from '@/utils/errorMessage';
import { imScopeError } from './_components/ImScopeFields';
import { ImSyncExecutionPanel } from './_components/ImSyncExecutionPanel';
import { InfrastructureBadge, InfrastructurePageHeader, InfrastructureSelect, InfrastructureTableStateRow } from './_components/InfrastructurePrimitives';
import './im-config.css';

const actions: Record<ImSyncAction, string> = { CREATE: '拟新增', UPDATE: '拟更新', DISABLE: '拟停用', UNCHANGED: '账号无变化', RELEASE: '拟退出范围管理', SKIP: '已停止管理，将跳过', CONFLICT: '冲突' };
const processedActions: Record<ImSyncAction, string> = { CREATE: '已新增', UPDATE: '已更新', DISABLE: '已停用', UNCHANGED: '账号无变化', RELEASE: '已退出范围管理', SKIP: '已停止管理，已跳过', CONFLICT: '冲突，未写入' };
const reasons: Record<string, string> = {
  LOCAL_ROOT_INVALID: '本地接入部门无效', LOCAL_TREE_INVALID: '本地部门层级异常', LOCAL_RECORD_DELETED: '本地记录已删除', LOCAL_RECORD_DISABLED: '本地部门或记录不可用',
  MAPPING_DISABLED: '映射已停用', MAPPING_TARGET_MISSING: '映射对应本地记录不存在', MAPPING_OUTSIDE_ROOT: '本地记录不在接入部门范围内', ROOT_MAPPING_COLLISION: '接入部门本身不能被同步覆盖',
  PARENT_CONFLICT: '上级或所属部门存在冲突', DUPLICATE_NAME: '同级部门名称重复', FIELD_TOO_LONG: '字段超过本地容量', ORDER_OUT_OF_RANGE: '排序值超出本地范围',
  VERSION_EXHAUSTED: '记录版本不可继续更新', PRIMARY_DEPARTMENT_REQUIRED: '多部门成员需要指定主部门', PRIMARY_DEPARTMENT_INVALID: '主部门不属于该成员或本次范围',
  CONTACT_COLLISION: '手机或邮箱与其他成员重复，不自动合并', USERNAME_COLLISION: '拟创建账号名称已存在', SOURCE_FIELD_POLICY_PENDING: '历史预览尚未应用字段保留规则，请重新预览',
  SCOPE_EXIT_POLICY_PENDING: '历史预览尚未核实范围退出，请重新预览', ABSENCE_UNVERIFIED: '未观察到成员，尚不能确认已从企业删除或调出范围', PROTECTED_ACCOUNT: '管理员或服务账号受保护',
  LOCAL_DISABLED_PRESERVED: '保留本地已有的停用状态', SCOPE_EXIT_ACCOUNT_PRESERVED: '已核实仍在企业但调出所选范围；保留账号和绑定，停止本范围同步，回到范围后恢复',
  SYNC_MANAGEMENT_STOPPED: '管理员已解除绑定；保留本地账号，管理员重新纳入后才恢复同步',
  CONFIGURATION_CHANGED: '配置已变更，本项未执行；已提交变更及结果保留，后续按新配置重新同步',
};
const failureMessages: Record<string, string> = {
  IM_ORG_SCOPE_UNVERIFIED: '未能确认完整部门授权，本次未生成组织变更', IM_ORG_SNAPSHOT_INCOMPLETE: '组织读取不完整，本次未生成组织变更',
  IM_ORG_SNAPSHOT_CHANGED: '读取期间组织或权限变化，请核对后重新预览', IM_PROVIDER_REJECTED: '企业微信拒绝本次请求', IM_PROVIDER_UNCERTAIN: '未能确认企业微信响应',
  IM_TOKEN_REJECTED: '访问凭据未被接受', IM_DISABLED: '企业微信接入已停用', IM_CONFIGURATION_INVALID: '应用配置无效', IM_SECRET_UNAVAILABLE: '独立密钥或应用凭据不可用',
  IM_PROVIDER_UNSUPPORTED: '提供商尚未支持',
};
const fields: Record<string, string> = { name: '名称', parentLocalId: '本地上级部门', parentExternalId: '企业微信上级部门', order: '排序', departmentLocalId: '本地部门', departmentExternalId: '企业微信主部门', mobile: '手机', email: '邮箱', avatar: '头像', status: '账号状态', syncManagement: '范围同步管理' };
const statusName = (status: string) => ({ PREVIEWED: '预览已保存', FAILED: '读取失败', RUNNING: '执行中', COMPLETED: '执行完成', PARTIAL: '部分完成' })[status] ?? '未知状态';
function valueName(field: string, value?: string) {
  if (!value) return '—';
  if (value === '***') return '已遮挡';
  if (value === 'SOURCE_UNAVAILABLE') return '历史预览未返回，请重新预览';
  if (value === 'LOCAL_PRESERVED') return '未返回，保留本地已有值';
  if (value === 'NOT_PROVIDED') return '未返回，新增账号不填此项';
  if (value === 'SOURCE_RETURNED') return '已返回';
  if (field === 'status') return value === '0' ? '正常' : value === '1' ? '停用' : '未知';
  if (field === 'syncManagement') return value === 'ACTIVE' ? '本范围管理中' : value === 'OUT_OF_SCOPE' ? '退出本范围，保留账号' : '未知';
  return value;
}

function ChangeEntry({ entry }: { entry: ImSyncEntry }) {
  const names = [...new Set([...Object.keys(entry.before), ...Object.keys(entry.after)])];
  return <article className="card min-w-0 space-y-3 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-all text-sm font-medium">{entry.kind === 'DEPARTMENT' ? '部门' : '成员'} · {entry.after.name || entry.before.name || entry.externalId}</h3><p className="mt-1 break-all text-xs text-cf-subtle">企业微信账号/编号：{entry.externalId} · 本地编号：{entry.localId ?? '待创建'}</p></div><InfrastructureBadge tone={entry.action === 'CONFLICT' ? 'warning' : 'neutral'}>{(entry.processed ? processedActions : actions)[entry.action] ?? '未知变更'}</InfrastructureBadge></div>
    {entry.reasons.length > 0 && <ul className="list-inside list-disc space-y-1 text-sm">{entry.reasons.map(reason => <li key={reason}>{reasons[reason] ?? `未识别原因：${reason}`}</li>)}</ul>}
    <dl className="space-y-2">{names.map(field => <div key={field} className="grid gap-1 rounded bg-[var(--cf-surface-muted)] p-2 text-sm md:grid-cols-[8rem_1fr_1fr]">
      <dt className="font-medium">{fields[field] ?? field}</dt><dd className="min-w-0 break-all"><span className="text-cf-subtle">原值：</span>{valueName(field, entry.before[field])}</dd><dd className="min-w-0 break-all"><span className="text-cf-subtle">预期：</span>{valueName(field, entry.after[field])}</dd>
    </div>)}</dl>
  </article>;
}

function ImSyncWorkspace() {
  const { hasPermission } = useAuth();
  const [overview, setOverview] = useState<ImSyncOverview | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [checkedHistory, setCheckedHistory] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10 });
  const [runs, setRuns] = useState<ImPage<ImSyncHeader> | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [reportQuery, setReportQuery] = useState<{ id: number; pageNum: number; pageSize: number } | null>(null);
  const [report, setReport] = useState<ImSyncReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [executionNotice, setExecutionNotice] = useState('');
  const active = useRef(false);
  const locked = useRef(false);
  const access = useRef(0);
  const verification = useRef(0);
  const session = useRef(getAuthSessionVersion());
  const current = (epoch: number) => active.current && session.current === getAuthSessionVersion() && epoch === access.current;
  const revoke = () => { access.current++; locked.current = false; setDenied(true); setOverview(null); setRuns(null); setReport(null); setReportQuery(null); setSelectedId(null); setError(''); setLoading(false); setReportLoading(false); setBusy(false); };
  const authorizationFailure = (failure: unknown) => [401, 403].includes(platformHttpStatus(failure) ?? 0);
  const refresh = () => { if (!locked.current) { verification.current++; setDenied(false); setCheckedHistory(false); setRevision(value => value + 1); } };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const cancellation = new AbortController(); const epoch = access.current;
    setLoading(true); setError('');
    void getImSyncOverview(cancellation.signal).then(result => {
      if (!cancellation.signal.aborted && current(epoch)) {
        if (result.configurations.some(config => !Number.isSafeInteger(config.configId) || config.configId <= 0)) throw new Error('应用编号无法安全处理，请联系管理员核对');
        setOverview(result); setSelectedId(previous => result.configurations.some(config => config.configId === previous) ? previous : result.configurations[0]?.configId ?? null);
      }
    }).catch(failure => {
      if (!cancellation.signal.aborted && current(epoch)) { setOverview(null); setSelectedId(null); if (authorizationFailure(failure)) revoke(); else setError(getErrorMessage(failure, '同步配置摘要读取失败，请刷新')); }
    }).finally(() => { if (!cancellation.signal.aborted && current(epoch)) setLoading(false); });
    return () => cancellation.abort();
  }, [revision]);
  useEffect(() => {
    if (selectedId === null || denied) { setRuns(null); setHistoryLoading(false); return; }
    const cancellation = new AbortController(); const epoch = access.current;
    const historyVerification = verification.current;
    setHistoryLoading(true); setHistoryError(''); setRuns(null);
    void listImSyncRuns({ configId: selectedId, ...query }, cancellation.signal).then(result => {
      if (!cancellation.signal.aborted && current(epoch)) { setRuns(result); if (!locked.current && historyVerification === verification.current) setCheckedHistory(true); }
    }).catch(failure => {
      if (!cancellation.signal.aborted && current(epoch)) { if (authorizationFailure(failure)) revoke(); else setHistoryError(getErrorMessage(failure, '历史记录读取失败，请刷新')); }
    }).finally(() => { if (!cancellation.signal.aborted && current(epoch)) setHistoryLoading(false); });
    return () => cancellation.abort();
  }, [selectedId, query, revision, denied]);
  useEffect(() => {
    setReport(null);
    if (!reportQuery) return;
    const cancellation = new AbortController(); const epoch = access.current;
    setReportLoading(true); setReportError('');
    void getImSyncReport(reportQuery.id, { pageNum: reportQuery.pageNum, pageSize: reportQuery.pageSize }, cancellation.signal).then(result => {
      if (!cancellation.signal.aborted && current(epoch)) setReport(result);
    }).catch(failure => {
      if (!cancellation.signal.aborted && current(epoch)) { if (authorizationFailure(failure)) revoke(); else setReportError(getErrorMessage(failure, '报告读取失败，请关闭后重新读取')); }
    }).finally(() => { if (!cancellation.signal.aborted && current(epoch)) setReportLoading(false); });
    return () => cancellation.abort();
  }, [reportQuery]);
  const selected = overview?.configurations.find(config => config.configId === selectedId);
  const allowed = !!overview?.deploymentEnabled && overview.canConfigure && selected?.status === 'ENABLED' && !!selected.scope && !imScopeError(selected.scope);
  const preview = async () => {
    if (locked.current || !selected || !allowed || loading || uncertain || !hasPermission('system:im:sync:preview')) return;
    locked.current = true; verification.current++; const epoch = access.current; setBusy(true); setError(''); setCheckedHistory(false);
    try {
      const result = await previewImSync(selected.configId, selected.version);
      if (!current(epoch)) return;
      setReportQuery({ id: result.header.syncRunId, pageNum: 1, pageSize: 50 }); setQuery(previous => ({ ...previous, pageNum: 1 })); setRevision(value => value + 1);
    } catch (failure) {
      if (!current(epoch)) return;
      if (authorizationFailure(failure)) revoke();
      else {
        verification.current++; setCheckedHistory(false);
        const status = platformHttpStatus(failure); setUncertain(status == null || status >= 500);
        setError(getErrorMessage(failure, '预览结果未确认，请刷新历史记录核对；本页不会自动重试'));
      }
    } finally { locked.current = false; if (current(epoch)) setBusy(false); }
  };
  if (denied) return <section className="im-sync-workspace card space-y-4 p-6" aria-label="组织同步访问受限"><p role="alert">当前身份、角色或套餐不允许访问组织同步，已清除报告。若执行后登录失效，请重新登录查询原批次进度，不要重新生成批次。</p><Button variant="outline" onClick={refresh}>重新核验权限</Button></section>;
  const view = (row: ImSyncHeader) => <Button variant="outline" disabled={busy} onClick={() => setReportQuery({ id: row.syncRunId, pageNum: 1, pageSize: 50 })}><Eye size={16} />查看报告</Button>;
  const empty = historyLoading ? '正在读取历史记录…' : historyError || (selected ? '暂无同步预览记录' : '请先维护企业微信应用配置');
  return <div className="im-sync-workspace space-y-5">
    <InfrastructurePageHeader kicker="系统管理" title="企业微信组织同步" description="先核对范围和预期变更；预览不直接修改员工、部门或权限。">
      <Button variant="outline" disabled={loading || historyLoading || busy || reportQuery !== null} onClick={refresh}><RefreshCw size={16} />刷新</Button>
      <PermissionGuard permissions={['system:im:sync:preview']} hidden><Button disabled={busy || loading || !allowed || uncertain || reportQuery !== null} onClick={() => void preview()}>{busy ? '正在生成预览…' : '生成预览'}</Button></PermissionGuard>
    </InfrastructurePageHeader>
    <section className="card space-y-3 p-4 text-sm" aria-label="组织同步状态">
      <p className="flex items-start gap-3" role="status"><ShieldCheck size={20} className="shrink-0" />{overview?.reason || (loading ? '正在读取接入状态…' : '未能确认接入状态，预览已停用')}</p>
      <InfrastructureSelect aria-label="同步应用配置" value={selectedId ? String(selectedId) : ''} placeholder="暂无可用配置" disabled={loading || busy || reportQuery !== null} options={(overview?.configurations ?? []).map(config => ({ value: String(config.configId), label: `${config.corpId} · 应用 ${config.agentId}` }))} onValueChange={value => { verification.current++; setCheckedHistory(false); setSelectedId(Number(value)); setQuery(previous => ({ ...previous, pageNum: 1 })); setReportQuery(null); }} />
      {selected && <><p>配置版本 {selected.version} · {selected.status === 'ENABLED' ? '配置已启用' : '配置已停用'}</p><p className="break-all">{selected.scope ? `本地接入部门 #${selected.scope.localRootDeptId}；远端根部门 ${selected.scope.remoteDepartmentIds.join('、')}，包含其全部下级部门。` : '尚未设置同步范围，请先维护配置。'}</p></>}
      <p className="text-cf-muted">外部读取失败不生成成功数量；未返回字段保留本地值，核实调出范围后保留账号。执行须先核对预览，已确认批次由后台恢复处理。</p>
      <PermissionGuard permissions={['system:im:config:list', 'system:im:config:manage']} requireAll hidden><Link className="inline-flex min-h-11 items-center underline" to="/system/im/config">维护应用配置与部门范围</Link></PermissionGuard>
    </section>
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {executionNotice && <p role="status" className="text-sm">{executionNotice}</p>}
    {uncertain && <section className="card space-y-3 p-4 text-sm"><p role="status">结果未确认，已禁止重复生成；请刷新并核对历史记录。再次生成会创建新的预览。</p><Button variant="outline" disabled={!checkedHistory || historyLoading || loading} onClick={() => { setUncertain(false); setError(''); }}>已核对记录，允许重新预览</Button></section>}
    <TablePageLayout table={<><div className="hidden md:block"><InnerTableSurface><table className="w-full text-sm"><thead><tr>{['时间 / 批次', '配置版本', '读取结果', '操作'].map(label => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>
      {historyLoading || historyError || !runs?.rows.length ? <InfrastructureTableStateRow colSpan={4} loading={historyLoading} title={empty} /> : runs.rows.map(row => <tr key={row.syncRunId} className="border-t border-[var(--cf-border)]"><td className="px-4 py-3"><p>{row.createdAt}</p><p className="text-xs text-cf-subtle">批次 {row.syncRunId}</p></td><td className="px-4 py-3">{row.configVersion}</td><td className="space-y-2 px-4 py-3"><InfrastructureBadge tone={row.status === 'FAILED' ? 'danger' : 'neutral'}>{statusName(row.status)}</InfrastructureBadge><p className="text-xs">{row.fullSnapshot ? '完整读取' : '未完成完整读取'}</p></td><td className="px-4 py-3">{view(row)}</td></tr>)}
    </tbody></table></InnerTableSurface></div><div className="space-y-3 p-3 md:hidden">{historyLoading || historyError || !runs?.rows.length ? <p className="p-4 text-sm">{empty}</p> : runs.rows.map(row => <article key={row.syncRunId} className="card space-y-3 p-4 text-sm"><h3 className="font-medium">批次 {row.syncRunId} · 版本 {row.configVersion}</h3><p>{row.createdAt}</p><InfrastructureBadge tone={row.status === 'FAILED' ? 'danger' : 'neutral'}>{statusName(row.status)}</InfrastructureBadge><p>{row.fullSnapshot ? '完整读取' : '未完成完整读取'}</p>{view(row)}</article>)}</div></>}
      pagination={<Pagination total={runs?.total ?? 0} page={query.pageNum} pageSize={query.pageSize} onPageChange={pageNum => { if (!busy && !historyLoading) setQuery(previous => ({ ...previous, pageNum })); }} onPageSizeChange={pageSize => { if (!busy && !historyLoading) setQuery({ pageNum: 1, pageSize }); }} />} />
    <BaseDialog open={reportQuery !== null} title="组织同步预览报告" width="wide" panelClassName="im-sync-dialog" onClose={() => { if (!busy) { setReportQuery(null); setReport(null); } }}>
      {reportLoading ? <p role="status">正在读取报告…</p> : reportError ? <p role="alert">{reportError}</p> : report && <div className="space-y-4 text-sm">
        <p>批次 {report.header.syncRunId} · 配置版本 {report.header.configVersion} · {statusName(report.header.status)}</p>
        <Button variant="outline" disabled={busy || reportLoading} onClick={() => setReportQuery(previous => previous ? { ...previous } : null)}>查询原批次进度</Button>
        {report.progress && <section className="card space-y-2 p-3" aria-label="实际执行进度">
          <h3 className="font-medium">已处理 {report.progress.processed} / {report.progress.total} · 剩余 {report.progress.remaining}</h3>
          <p>实际新增：部门 {report.progress.actual.departmentsCreated}、成员 {report.progress.actual.usersCreated}；实际更新：部门 {report.progress.actual.departmentsUpdated}、成员 {report.progress.actual.usersUpdated}；实际停用：成员 {report.progress.actual.usersDisabled}</p>
          <p>{report.progress.effectsPending ? '安全清理未完成，批次仍在处理中' : report.progress.remaining ? '等待继续处理剩余项目' : '本批处理与安全清理已结束'}</p>
        </section>}
        <PermissionGuard permissions={['system:im:sync:run']} hidden><ImSyncExecutionPanel key={report.header.syncRunId}
          report={report} enabled={allowed && selected?.configId === report.header.configId && selected?.version === report.header.configVersion}
          onBusy={value => { locked.current = value; setBusy(value); }} onDenied={revoke}
          onAccepted={result => { setExecutionNotice(`批次 ${result.runId} 已确认，已处理 ${result.progress.processed}/${result.progress.total}；请查询原批次进度，登录失效时重新登录。`); setReportQuery(previous => previous ? { ...previous } : null); }} /></PermissionGuard>
        {report.configurationChanged && <p role="status" className="rounded border border-amber-300 p-3">配置已发生变化；本报告保留生成时的数据，不能用于执行新配置。</p>}
        {report.failureCode ? <p role="alert">{failureMessages[report.failureCode] ?? '本次读取失败，请核对接入配置'}（{report.failureCode}）</p> : report.summary && <><p role="status">{report.progress ? '以下汇总保留原预期变更；逐项标注已处理结果，未处理项目继续显示预期。手机和邮箱已遮挡。' : '以下均为预期变更，尚未写入本地组织；手机和邮箱已遮挡。'}</p><div className="grid gap-3 md:grid-cols-3">
          <section className="card space-y-2 p-3" aria-label="部门预期变更"><h3 className="font-medium">部门</h3><p>拟新增 {report.summary.departmentsCreated} · 拟更新 {report.summary.departmentsUpdated}</p><p>无变化 {report.summary.departmentsUnchanged}</p></section>
          <section className="card space-y-2 p-3" aria-label="成员预期变更"><h3 className="font-medium">成员</h3><p>拟新增 {report.summary.usersCreated} · 拟更新 {report.summary.usersUpdated}</p><p>拟停用 {report.summary.usersDisabled} · 账号无变化（含退出范围管理）{report.summary.usersUnchanged}</p></section>
          <section className="card space-y-2 p-3" aria-label="预览冲突"><h3 className="font-medium">需处理的冲突</h3><p>部门 {report.summary.departmentConflicts} · 成员 {report.summary.userConflicts}</p></section>
        </div><div className="space-y-3">{report.entries.rows.map(entry => <ChangeEntry key={`${entry.kind}:${entry.externalId}`} entry={entry} />)}</div><Pagination total={report.entries.total} page={reportQuery?.pageNum ?? 1} pageSize={reportQuery?.pageSize ?? 50} onPageSizeChange={pageSize => { if (!reportLoading && !busy && !locked.current) setReportQuery(previous => previous ? { ...previous, pageNum: 1, pageSize } : null); }} onPageChange={pageNum => { if (!reportLoading && !busy && !locked.current) setReportQuery(previous => previous ? { ...previous, pageNum } : null); }} />
          <p className="break-all text-xs text-cf-subtle">快照摘要（用于核对保存内容是否改变）：{report.hash}</p></>}
      </div>}
    </BaseDialog>
  </div>;
}

export default function ImSyncPage() {
  const { user, hasPermission } = useAuth();
  if (!hasPermission('system:im:sync:list')) return <p role="alert" className="card p-6 text-sm">您没有权限访问组织同步</p>;
  return <ImSyncWorkspace key={`${user?.tenantId}:${user?.id}:${getAuthSessionVersion()}`} />;
}
