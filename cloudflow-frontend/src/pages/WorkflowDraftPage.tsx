import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BaseDialog, Button, EmptyState, Input, PageLoading, Pagination, Table, TableActionHead, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { WorkflowLaunchDialog } from '@/components/workflow/catalog/WorkflowLaunchDialog';
import { useAuth } from '@/context/AuthContext';
import { useWorkflowDraftList } from '@/hooks/useWorkflowDraftList';
import { workflowDraftIdentity } from '@/hooks/useWorkflowDraft';
import { deleteWorkflowDraft, draftUnavailableMessage, isDraftExpired, toWorkflowDraftError, WorkflowDraftError, type DraftSummaryVO } from '@/services/api/workflow/draft';
import { getCurrentUserSnapshot } from '@/utils/authStorage';

export const WorkflowDraftPage = () => {
  const { user } = useAuth();
  return <WorkflowDraftListContent key={workflowDraftIdentity(user)} />;
};

const WorkflowDraftListContent = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [resumeTarget, setResumeTarget] = useState<DraftSummaryVO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DraftSummaryVO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<WorkflowDraftError | null>(null);
  const deleteAbort = useRef<AbortController | null>(null);
  const drafts = useWorkflowDraftList({ pageNum, pageSize, keyword: keyword || undefined });
  const canResume = hasPermission(['workflow:draft:view', 'workflow:draft:save', 'workflow:draft:submit', 'workflow:process:start'], true);
  const canRemove = hasPermission('workflow:draft:remove');

  useLayoutEffect(() => () => { deleteAbort.current?.abort(); }, []);

  useEffect(() => {
    if (!drafts.loading && !drafts.error && pageNum > Math.max(1, Math.ceil(drafts.total / pageSize))) setPageNum(Math.max(1, Math.ceil(drafts.total / pageSize)));
  }, [drafts.loading, drafts.error, drafts.total, pageNum, pageSize]);

  const remove = async () => {
    if (!deleteTarget || deleting || !canRemove || deleteError?.code === 'DRAFT_CONFLICT') return;
    const abort = new AbortController();
    deleteAbort.current?.abort();
    deleteAbort.current = abort;
    const current = () => !abort.signal.aborted && deleteAbort.current === abort && workflowDraftIdentity(getCurrentUserSnapshot()) === drafts.identity;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteWorkflowDraft(deleteTarget.draftId, deleteTarget.lockVersion, abort.signal);
      if (!current()) return;
      setDeleteTarget(null);
      drafts.reload();
      toast.success('草稿已删除');
    } catch (error) {
      if (!current()) return;
      setDeleteError(toWorkflowDraftError(error));
      drafts.reload();
    } finally {
      if (current()) setDeleting(false);
    }
  };

  const actions = (
    <header className="admin-source-header">
      <div><p className="admin-source-kicker">个人申请</p><h2>我的草稿</h2><span>仅显示本人草稿，最近有效保存后保留30天</span></div>
      <div className="admin-source-controls">
        <Button variant="outline" size="sm" disabled={drafts.loading || !drafts.allowed} onClick={drafts.reload}><RefreshCw size={14} className="mr-1.5" />刷新</Button>
        {hasPermission('workflow:process:start') ? <Button size="sm" onClick={() => navigate('/workplace')}><Plus size={14} className="mr-1.5" />发起流程</Button> : null}
      </div>
    </header>
  );

  const filters = (
    <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={(event) => { event.preventDefault(); setKeyword(search.trim()); setPageNum(1); }}>
      <label className="min-w-0 flex-1 space-y-1"><span className="input-label">搜索草稿</span><Input type="search" value={search} maxLength={200} placeholder="流程名称或申请标题" disabled={!drafts.allowed} onChange={(event) => setSearch(event.target.value)} /></label>
      <Button type="submit" variant="outline" disabled={!drafts.allowed}><Search size={14} className="mr-1.5" />查询</Button>
    </form>
  );

  const table = !drafts.allowed ? (
    <EmptyState title="暂无草稿列表权限" description="原有流程发起权限保持不变。" />
  ) : drafts.loading ? <PageLoading tip="正在读取本人草稿…" minHeight="min-h-[20rem]" /> : drafts.error ? (
    <div className="space-y-4 p-6 text-center"><EmptyState icon={<AlertTriangle className="h-10 w-10 text-amber-500" />} title="草稿列表加载失败" description={drafts.error} /><Button variant="outline" onClick={drafts.reload}>重试</Button></div>
  ) : !drafts.records.length ? (
    <EmptyState icon={<FileText className="h-10 w-10 text-cf-faint" />} title={keyword ? '没有匹配的草稿' : '暂无草稿'} description={keyword ? '请调整搜索条件。' : '填写申请时可手动保存，也会在修改后自动保存。'} />
  ) : (
    <InnerTableSurface wrapperClassName="p-0">
      <Table disableScrollWrapper className="min-w-[920px]">
        <TableHeader><TableRow><TableHead>流程名称 / 申请标题</TableHead><TableHead>最近保存</TableHead><TableHead>到期时间</TableHead><TableHead>状态</TableHead><TableActionHead>操作</TableActionHead></TableRow></TableHeader>
        <TableBody>{drafts.records.map((entry) => {
          const unavailable = draftUnavailableMessage(entry, drafts.now);
          return (
            <TableRow key={entry.draftId}>
              <TableCell><div className="font-medium text-cf-title">{entry.definitionName}</div><p className="mt-1 max-w-sm truncate text-xs text-cf-subtle">{entry.title || '未填写标题'}</p></TableCell>
              <TableCell className="whitespace-nowrap">{entry.lastSaveTime}</TableCell>
              <TableCell className="whitespace-nowrap">{entry.expireTime}</TableCell>
              <TableCell><span className={unavailable ? 'badge badge-warning' : 'badge badge-success'}>{isDraftExpired(entry, drafts.now) ? '已过期' : unavailable ? '已失效' : '可继续'}</span>{unavailable ? <p className="mt-1 max-w-xs text-xs text-cf-subtle">{unavailable}</p> : null}</TableCell>
              <TableCell><div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={Boolean(unavailable) || !canResume} onClick={() => setResumeTarget(entry)}>继续填写</Button>
                {canRemove ? <Button size="sm" variant="ghost" aria-label={`删除${entry.definitionName}草稿`} onClick={() => { setDeleteError(null); setDeleteTarget(entry); }}><Trash2 size={15} /></Button> : null}
              </div></TableCell>
            </TableRow>
          );
        })}</TableBody>
      </Table>
    </InnerTableSurface>
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout actions={actions} filters={filters} table={table} pagination={drafts.allowed && !drafts.loading && !drafts.error ? <Pagination total={drafts.total} page={pageNum} pageSize={pageSize} onPageChange={setPageNum} onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPageNum(1); }} /> : undefined} />
      <WorkflowLaunchDialog
        open={Boolean(resumeTarget)}
        workflow={resumeTarget ? { id: resumeTarget.definitionId, name: resumeTarget.definitionName } : null}
        draftId={resumeTarget?.draftId}
        loadingBoundForm={false}
        onClose={() => { setResumeTarget(null); drafts.reload(); }}
        onSubmit={() => { throw new WorkflowDraftError('PERMISSION_DENIED'); }}
        onDraftChanged={drafts.reload}
        onDraftSubmitted={() => { setResumeTarget(null); drafts.reload(); toast.success('流程发起成功'); navigate('/my-apps'); }}
      />
      <BaseDialog open={Boolean(deleteTarget)} title="删除本人草稿" width="narrow" onClose={() => { if (!deleting) setDeleteTarget(null); }} footer={(
        <><Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>取消</Button><Button variant="destructive" disabled={deleting || !canRemove || deleteError?.code === 'DRAFT_CONFLICT'} onClick={() => void remove()}>{deleting ? '删除中…' : '确认删除'}</Button></>
      )}>
        <p className="text-sm text-cf-body">删除“{deleteTarget?.definitionName}”的草稿后无法恢复，是否继续？</p>
        {deleteError ? <p role="alert" className="mt-3 text-sm text-red-600">{deleteError.message}{deleteError.code === 'DRAFT_CONFLICT' ? '请取消后查看列表中的最新版本，再决定是否删除。' : ''}</p> : null}
      </BaseDialog>
    </section>
  );
};

export default WorkflowDraftPage;
