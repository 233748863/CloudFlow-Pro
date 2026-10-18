import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Layers, MailOpen, MailWarning, RefreshCw, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination, PermissionGuard, Table } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout';
import { useAuth } from '@/context/AuthContext';
import { getMyMessage, listMyMessages, readMyMessages } from '@/services/api/message';
import type { MessageCategory, MyMessage, MyMessageQuery } from '@/services/api/message';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import { InfrastructureBadge, InfrastructureDialogPanel, InfrastructureField, InfrastructurePageHeader, InfrastructureSelect, InfrastructureStats, InfrastructureTableStateRow, infrastructureCheckboxClassName } from '../_components/InfrastructurePrimitives';
import { useInfrastructurePage } from '../_components/useInfrastructurePage';
import { CATEGORY_LABELS, categoryOptions } from './options';

export default function MyMessagesPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const page = useInfrastructurePage<MyMessage, MyMessageQuery>(listMyMessages, { pageNum: 1, pageSize: 10 });
  const [selected, setSelected] = useState<number[]>([]);
  const [detail, setDetail] = useState<MyMessage | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSelected([]); }, [page.query, page.rows]);
  useEffect(() => {
    const refreshMessages = () => page.refresh();
    window.addEventListener('sys-notice-received', refreshMessages);
    window.addEventListener('cloudflow:messages-read', refreshMessages);
    return () => {
      window.removeEventListener('sys-notice-received', refreshMessages);
      window.removeEventListener('cloudflow:messages-read', refreshMessages);
    };
  }, [page.refresh]);

  const markRead = async (payload: Parameters<typeof readMyMessages>[0]) => {
    if (busy) return;
    setBusy(true);
    try {
      await readMyMessages(payload);
      window.dispatchEvent(new Event('cloudflow:messages-read'));
      toast.success('已标记为已读');
    } catch (reason) { toast.error(getErrorMessage(reason, '标记已读失败')); }
    finally { setBusy(false); }
  };

  const openDetail = async (message: MyMessage) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await getMyMessage(message.recordId);
      setDetail(result);
      if (result.readFlag !== 1 && hasPermission(['system:message:mine:read'])) {
        await readMyMessages({ recordIds: [result.recordId] });
        setDetail((current) => current?.recordId === result.recordId ? { ...current, readFlag: 1 } : current);
        window.dispatchEvent(new Event('cloudflow:messages-read'));
      }
    } catch (reason) { toast.error(getErrorMessage(reason, '读取消息失败')); }
    finally { setBusy(false); }
  };

  let businessPath: string | null = null;
  if (detail?.linkUrl) {
    try {
      const target = new URL(detail.linkUrl, window.location.origin);
      if (target.origin === window.location.origin) businessPath = target.pathname + target.search + target.hash;
    } catch { businessPath = null; }
  }

  const stats = useMemo(
    () => [
      {
        label: '消息总数',
        value: String(page.total),
        meta: `当前页 ${page.rows.length}`,
        icon: <Inbox size={18} />,
        tone: 'blue' as const,
      },
      {
        label: '未读消息',
        value: String(page.rows.filter((item) => item.readFlag !== 1).length),
        meta: '本页统计',
        icon: <MailWarning size={18} />,
        tone: 'amber' as const,
      },
      {
        label: '已读消息',
        value: String(page.rows.filter((item) => item.readFlag === 1).length),
        meta: '本页统计',
        icon: <MailOpen size={18} />,
        tone: 'green' as const,
      },
      {
        label: '涉及分类',
        value: String(new Set(page.rows.map((item) => item.messageCategory)).size),
        meta: '本页去重',
        icon: <Layers size={18} />,
        tone: 'violet' as const,
      },
    ],
    [page.rows, page.total],
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={
          <div className="grid gap-5">
            <InfrastructurePageHeader kicker="MY MESSAGES" title="我的消息" description="集中查看待办、抄送、公告、系统通知和业务提醒。">
              <Button variant="outline" size="sm" onClick={page.refresh} disabled={page.loading}>
                <RefreshCw size={16} className={cn(page.loading && 'animate-spin')} />
                刷新
              </Button>
              <PermissionGuard permissions={['system:message:subscribe:list']} hidden>
                <Button variant="outline" size="sm" onClick={() => navigate('/message/subscribe')}><Settings2 size={16} />订阅设置</Button>
              </PermissionGuard>
            </InfrastructurePageHeader>
            <InfrastructureStats items={stats} />
          </div>
        }
        filters={<section className="card admin-users-toolbar">
          <div className="admin-users-filter-grid">
          <InfrastructureField label="消息分类"><InfrastructureSelect value={page.query.category || ''} options={[{ value: '', label: '全部分类' }, ...categoryOptions]} onValueChange={(value) => page.setQuery((current) => ({ ...current, category: value as MessageCategory | '', pageNum: 1 }))} /></InfrastructureField>
          <InfrastructureField label="阅读状态"><InfrastructureSelect value={page.query.readFlag === undefined ? '' : String(page.query.readFlag)} options={[{ value: '', label: '全部状态' }, { value: '0', label: '未读' }, { value: '1', label: '已读' }]} onValueChange={(value) => page.setQuery((current) => ({ ...current, readFlag: value ? Number(value) : undefined, pageNum: 1 }))} /></InfrastructureField>
          <InfrastructureField label="开始日期"><Input type="date" aria-label="开始日期" value={page.query.beginTime || ''} max={page.query.endTime || undefined} onChange={(event) => page.setQuery((current) => ({ ...current, beginTime: event.target.value || undefined, pageNum: 1 }))} /></InfrastructureField>
          <InfrastructureField label="结束日期"><Input type="date" aria-label="结束日期" value={page.query.endTime || ''} min={page.query.beginTime || undefined} onChange={(event) => page.setQuery((current) => ({ ...current, endTime: event.target.value || undefined, pageNum: 1 }))} /></InfrastructureField>
          <div className="admin-users-toolbar-actions">
            <PermissionGuard permissions={['system:message:mine:read']} hidden>
              <Button variant="outline" size="sm" disabled={!selected.length || busy || page.loading} onClick={() => void markRead({ recordIds: selected })}>所选标为已读</Button>
              <Button variant="outline" size="sm" disabled={busy || page.loading || !page.total} onClick={() => void markRead(page.query.category ? { category: page.query.category } : { all: true })}>{page.query.category ? '本分类全部已读' : '全部已读'}</Button>
            </PermissionGuard>
            <span className="admin-users-filter-count">共 {page.total} 条</span>
          </div>
          </div>
        </section>}
        table={<InnerTableSurface disableScrollWrapper className="flex min-h-0 flex-1 flex-col">
          <Table className="admin-source-table min-w-[620px]">
          <thead><tr><th className="w-12" aria-label="选择"><input type="checkbox" className={infrastructureCheckboxClassName} aria-label="选择本页消息" disabled={!page.rows.length || page.loading || busy} checked={page.rows.length > 0 && page.rows.every((message) => selected.includes(message.recordId))} onChange={(event) => setSelected(event.target.checked ? page.rows.map((message) => message.recordId) : [])} /></th>{['消息内容', '分类', '状态', '时间'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{page.loading || page.error || !page.rows.length ? <InfrastructureTableStateRow colSpan={5} loading={page.loading} title={page.loading ? '正在加载消息' : page.error || '暂无消息'} description={page.error ? '点击刷新重新加载' : '收到的新消息会显示在这里'} /> : page.rows.map((message) => (
            <tr key={message.recordId}>
              <td><input type="checkbox" className={infrastructureCheckboxClassName} aria-label={`选择消息 ${message.recordId}`} checked={selected.includes(message.recordId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, message.recordId] : current.filter((recordId) => recordId !== message.recordId))} /></td>
              <td className="sm:max-w-md"><button className="w-full min-w-0 text-left hover:underline focus-visible:underline" disabled={busy} onClick={() => void openDetail(message)}><span className={message.readFlag === 1 ? 'text-cf-muted' : 'font-semibold text-cf-title'}>{message.title || '无标题'}</span><p className="mt-1 break-words text-xs text-cf-subtle sm:truncate">{message.content}</p></button></td>
              <td>{CATEGORY_LABELS[message.messageCategory]}</td>
              <td><InfrastructureBadge tone={message.readFlag === 1 ? 'neutral' : 'info'}>{message.readFlag === 1 ? '已读' : '未读'}</InfrastructureBadge></td>
              <td className="whitespace-nowrap text-xs text-cf-subtle">{message.createTime || '—'}</td>
            </tr>
          ))}</tbody>
          </Table>
        </InnerTableSurface>}
        pagination={<Pagination total={page.total} page={page.query.pageNum} pageSize={page.query.pageSize} onPageChange={(pageNum) => page.setQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => page.setQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />}
      />
      <BaseDialog open={Boolean(detail)} title={detail?.title || '消息详情'} width="wide" onClose={() => setDetail(null)} footer={businessPath ? <Button onClick={() => navigate(businessPath!)}>查看业务详情</Button> : undefined}>
        {detail && <div className="admin-dialog-stack">
          <div className="admin-dialog-subhead">
            <div>
              <strong>{detail.title || '无标题'}</strong>
              <span>{CATEGORY_LABELS[detail.messageCategory]} · {detail.createTime || '时间未知'}</span>
            </div>
            <InfrastructureBadge tone={detail.readFlag === 1 ? 'neutral' : 'info'}>{detail.readFlag === 1 ? '已读' : '未读'}</InfrastructureBadge>
          </div>
          <InfrastructureDialogPanel title="消息正文">
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-cf-muted">{detail.content || '暂无正文'}</p>
          </InfrastructureDialogPanel>
        </div>}
      </BaseDialog>
    </section>
  );
}
