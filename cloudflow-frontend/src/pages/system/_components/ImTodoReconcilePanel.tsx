import React, { useEffect, useRef, useState } from 'react';
import { BaseDialog, Button, Pagination } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { listImTodos, reconcileImTodo } from '@/services/api/im';
import type { ImConfig, ImTodoEntry, ImTodoOverview } from '@/services/api/im';
import { platformHttpStatus } from '@/services/api/platformAccess';
import { getErrorMessage } from '@/utils/errorMessage';
import { getAuthSessionVersion } from '@/utils/authStorage';

const deliveryLabels: Record<string, string> = { PENDING: '等待发送', SENT: '已发送', UNKNOWN: '发送结果待核验', COMPLETED: '已办结', CANCELLED: '已取消', FAILED: '发送失败' };
const updateLabels: Record<string, string> = { MISSING: '待核对', CLAIMED: '正在更新', APPLIED: '更新已确认', UNKNOWN: '更新结果待核验', EXPIRED: '更新凭证已过期', FAILED: '更新未完成', UNAVAILABLE: '更新记录暂不可用' };

function Workspace({ config, onClose }: { config: ImConfig; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ImTodoOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [denied, setDenied] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const active = useRef(true);
  const locked = useRef(false);
  const session = useRef(getAuthSessionVersion());
  const current = () => active.current && session.current === getAuthSessionVersion();
  const revoke = () => { setDenied(true); setData(null); setMessage(''); setError('当前权限已变化，请关闭窗口后重新核验'); };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const cancellation = new AbortController();
    setLoading(true); setError('');
    void listImTodos(config.configId, page, cancellation.signal).then(result => {
      if (!cancellation.signal.aborted && current()) { setData(result); setDenied(false); setUncertain(false); }
    }).catch(failure => {
      if (!cancellation.signal.aborted && current()) {
        setData(null);
        if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) revoke();
        else setError(getErrorMessage(failure, '读取待办卡片失败，请刷新重试'));
      }
    }).finally(() => { if (!cancellation.signal.aborted && current()) setLoading(false); });
    return () => cancellation.abort();
  }, [config.configId, page, revision]);

  const reconcile = async (entry: ImTodoEntry) => {
    if (locked.current || denied || uncertain || !data?.enabled) return;
    locked.current = true; setBusy(entry.mappingId); setError(''); setMessage('');
    try {
      const result = await reconcileImTodo(entry);
      if (!current()) return;
      setData(previous => previous ? { ...previous, rows: previous.rows.map(row => row.mappingId === entry.mappingId ? result.entry : row) } : previous);
      setMessage(result.changed ? '卡片状态已更新并确认' : `核对已结束：${updateLabels[result.entry.updateStatus] ?? '请刷新查看当前状态'}`);
    } catch (failure) {
      if (!current()) return;
      if ([401, 403].includes(platformHttpStatus(failure) ?? 0)) revoke();
      else { setUncertain(true); setError(getErrorMessage(failure, '本次核对结果未确认，请刷新记录后查看')); }
    } finally { locked.current = false; if (current()) setBusy(null); }
  };

  return <BaseDialog open title="待办卡片状态" width="wide" panelClassName="im-config-dialog" onClose={() => { if (!locked.current) onClose(); }}>
    <div className="space-y-4">
      <p className="break-all text-sm text-cf-muted">企业：{config.corpId} · 应用：{config.agentId}</p>
      <p className="text-sm text-cf-muted">核对已办结或已取消的待办，并更新企业微信卡片。结果待核验的更新会保留当前记录。</p>
      {!loading && data && !data.enabled && <p role="status" className="text-sm">企业微信接入已停用，暂不能核对卡片。</p>}
      {error && <p role="alert" className="text-sm text-[var(--cf-danger)]">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      <div className="flex justify-end"><Button variant="outline" className="min-h-11" disabled={loading || busy !== null} onClick={() => setRevision(value => value + 1)}>刷新记录</Button></div>
      {loading ? <p role="status" className="p-4 text-sm">正在读取待办卡片…</p> : !denied && data && data.rows.length === 0 ? <p className="p-4 text-sm">当前配置还没有待办卡片记录</p> : !denied && data?.rows.map(entry => <article key={entry.mappingId} className="card space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{entry.receiverName || '接收员工'}</p><p className="mt-1 text-xs text-cf-subtle">登记时间：{entry.createTime}</p></div><span className="text-sm">{deliveryLabels[entry.status] ?? '状态待核验'}</span></div>
        <p className="break-all text-xs text-cf-subtle">待办编号：{entry.taskId}</p>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">卡片更新：{updateLabels[entry.updateStatus] ?? '状态待核验'}</p>
          <Button variant="outline" className="min-h-11" disabled={busy !== null || uncertain || !data.enabled || !['SENT', 'UNKNOWN'].includes(entry.status) || entry.updateStatus !== 'MISSING'} onClick={() => void reconcile(entry)}>{busy === entry.mappingId ? '正在核对…' : '核对这条待办'}</Button></div>
      </article>)}
      {!denied && data && <fieldset disabled={busy !== null || loading}><Pagination total={data.total} page={page} pageSize={10} showPageSizeSelector={false} onPageSizeChange={() => { }} onPageChange={next => { if (!locked.current) setPage(next); }} /></fieldset>}
      <div className="flex justify-end"><Button className="min-h-11" variant="outline" disabled={busy !== null} onClick={onClose}>关闭</Button></div>
    </div>
  </BaseDialog>;
}

export default function ImTodoReconcilePanel(props: { config: ImConfig; onClose: () => void }) {
  const { user, hasPermission } = useAuth();
  if (!hasPermission('system:im:todo:reconcile') || !hasPermission('system:im:config:list')) return <p role="alert">您没有权限查看待办卡片</p>;
  return <Workspace key={`${user?.tenantId}:${user?.id}:${getAuthSessionVersion()}`} {...props} />;
}
