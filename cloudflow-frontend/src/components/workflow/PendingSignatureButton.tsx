import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { BaseDialog, Button } from '../common';
import { SignatureModal } from '../SignatureModal';
import { useAuth } from '../../context/AuthContext';
import { getPendingSignatures, type PendingSignature } from '../../services/api/workflow';
import { getErrorMessage } from '../../utils/errorMessage';

const labels = { BEFORE: '前加签', AFTER: '后加签', PARALLEL: '并行加签' };

export const PendingSignatureButton = ({ onSuccess }: { onSuccess: () => void }) => {
  const { user, hasPermission } = useAuth();
  const permitted = hasPermission('workflow:task:todo') && hasPermission('workflow:task:reduce-sign');
  const [open, setOpen] = useState(false);
  const [pageNum, setPageNum] = useState(1);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<PendingSignature[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PendingSignature>();

  useEffect(() => {
    if (!open || !permitted) return;
    let active = true;
    setLoading(true);
    setError('');
    getPendingSignatures(pageNum).then(result => {
      if (!active) return;
      setRows(result.rows);
      setTotal(result.total);
      if (pageNum > 1 && !result.rows.length) setPageNum(Math.max(1, Math.ceil(result.total / 20)));
    }).catch(failure => { if (active) setError(getErrorMessage(failure, '无法读取进行中的加签')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, permitted, pageNum, revision]);

  if (!user || !permitted) return null;
  return <>
    <Button variant="outline" className="!min-h-[44px] gap-2" aria-label="管理进行中的加签"
      onClick={() => { setPageNum(1); setOpen(true); }}><Users size={16} />加签管理</Button>
    <BaseDialog open={open && !selected} title="进行中的加签" width="normal" onClose={() => setOpen(false)}
      panelClassName="[&_.modal-close]:!min-h-[44px] [&_.modal-close]:!min-w-[44px]"
      description="仅显示由您负责的加签；原审批暂停或已经通过后，仍可在这里移除尚未处理的人员。">
      <div className="space-y-4 text-sm" aria-busy={loading}>
        {loading && <p role="status" className="text-cf-muted">正在读取加签…</p>}
        {error && <div role="alert" className="text-red-700 dark:text-red-300"><p>{error}</p>
          <Button className="mt-2 !min-h-[44px]" onClick={() => setRevision(value => value + 1)}>重新加载</Button></div>}
        {!loading && !error && !rows.length && <p className="text-cf-muted">暂无进行中的本人加签。</p>}
        {!loading && !error && rows.map(row => <article key={row.addSignId} data-task-id={row.taskId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--cf-border)] p-3">
          <div className="min-w-0 flex-1"><p className="break-words font-medium text-cf-title">{row.nodeName}</p>
            <p className="break-words text-xs leading-6 text-cf-muted">{row.instanceTitle}</p>
            <p className="text-xs text-cf-subtle">{labels[row.signType]} · {row.createTime}</p></div>
          <Button variant="outline" className="!min-h-[44px]" onClick={() => setSelected(row)}
            aria-label={`管理加签：${row.nodeName}`}>管理人员</Button>
        </article>)}
        <div className="flex items-center justify-between gap-2 text-cf-muted">
          <Button variant="outline" className="!min-h-[44px]" disabled={loading || pageNum <= 1}
            onClick={() => setPageNum(value => value - 1)}>上一页</Button>
          <span>第 {pageNum} 页 · 共 {total} 条</span>
          <Button variant="outline" className="!min-h-[44px]" disabled={loading || pageNum * 20 >= total}
            onClick={() => setPageNum(value => value + 1)}>下一页</Button>
        </div>
      </div>
    </BaseDialog>
    {selected && <SignatureModal isOpen={open} taskId={selected.taskId} currentUser={user} mode="reduce"
      onClose={() => setSelected(undefined)} onSuccess={() => {
        setSelected(undefined); setRevision(value => value + 1); onSuccess();
      }} />}
  </>;
};
