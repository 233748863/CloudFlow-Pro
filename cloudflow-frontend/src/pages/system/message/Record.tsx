import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Eye, Mail, RefreshCw, RotateCcw, Search, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination, PermissionGuard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, WarningConfirmDialog } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout';
import { useAuth } from '@/context/AuthContext';
import { getMessageStatistics, listMessageRecords, resendMessageRecords } from '@/services/api/message';
import type { MessageChannelType, MessageRecord, MessageRecordQuery, MessageSendStatus, MessageStatistics } from '@/services/api/message';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import { InfrastructureBadge, InfrastructureDetailField, InfrastructureDialogPanel, InfrastructureField, InfrastructurePageHeader, InfrastructureSelect, InfrastructureStats, InfrastructureTableStateRow, infrastructureCheckboxClassName } from '../_components/InfrastructurePrimitives';
import { useInfrastructurePage } from '../_components/useInfrastructurePage';
import { CATEGORY_LABELS, CHANNEL_LABELS, SEND_STATUS_LABELS, SKIP_REASON_LABELS, channelOptions } from './options';
import { DeliveryDetail } from './DeliveryDetail';

const feedbackToastId = 'message-record-feedback';

export default function MessageRecordPage() {
  const { hasPermission } = useAuth();
  const canResend = hasPermission('system:message:record:resend');
  const page = useInfrastructurePage<MessageRecord, MessageRecordQuery>(listMessageRecords, { pageNum: 1, pageSize: 10 });
  const [filters, setFilters] = useState({ templateCode: '', bizType: '', receiverId: '', beginTime: '', endTime: '' });
  const [statistics, setStatistics] = useState<MessageStatistics | null>(null);
  const [statisticsError, setStatisticsError] = useState('');
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [statisticsRevision, setStatisticsRevision] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [detail, setDetail] = useState<MessageRecord | null>(null);
  const [resendTargets, setResendTargets] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const resendInFlight = useRef(false);

  useEffect(() => { setSelected([]); }, [page.query, page.rows]);
  useEffect(() => {
    let active = true;
    setStatistics(null);
    setStatisticsError('');
    setStatisticsLoading(true);
    getMessageStatistics({ beginTime: page.query.beginTime, endTime: page.query.endTime }).then((result) => {
      if (!result) throw new Error('统计响应为空，请刷新重试');
      if (active) setStatistics(result);
    }).catch((reason: unknown) => {
      if (active) setStatisticsError(getErrorMessage(reason, '统计加载失败'));
    }).finally(() => {
      if (active) setStatisticsLoading(false);
    });
    return () => { active = false; };
  }, [page.query.beginTime, page.query.endTime, statisticsRevision]);

  const refresh = () => { page.refresh(); setStatisticsRevision((value) => value + 1); };
  const candidates = canResend ? page.rows.filter((record) => record.sendStatus === 'FAILED').map((record) => record.recordId) : [];
  const toggleSelection = (recordId: number, checked: boolean) => {
    if (!canResend || busy || page.loading || !candidates.includes(recordId)) return;
    setSelected((current) => checked ? Array.from(new Set([...current, recordId])) : current.filter((value) => value !== recordId));
  };
  const requestResend = (recordIds: number[]) => {
    if (!canResend || busy || page.loading || page.error) return;
    toast.dismiss(feedbackToastId);
    setResendTargets(Array.from(new Set(recordIds.filter((recordId) => candidates.includes(recordId)))));
  };

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    if (filters.beginTime && filters.endTime && filters.beginTime > filters.endTime) {
      toast.error('开始日期不能晚于结束日期', { id: feedbackToastId });
      return;
    }
    page.setQuery((current) => ({ ...current, ...filters, receiverId: filters.receiverId ? Number(filters.receiverId) : undefined, pageNum: 1 }));
  };

  const resend = async () => {
    if (!canResend || busy || resendInFlight.current || page.loading || page.error) return;
    const recordIds = resendTargets.filter((recordId) => candidates.includes(recordId));
    if (!recordIds.length) return;
    resendInFlight.current = true;
    setBusy(true);
    try {
      const result = await resendMessageRecords(recordIds);
      toast.success(`已受理 ${result.accepted} 条重发请求，共选择 ${result.requested} 条`, { id: feedbackToastId });
      setSelected([]);
      refresh();
    } catch (reason) { toast.error(getErrorMessage(reason, '重发请求失败'), { id: feedbackToastId }); }
    finally { resendInFlight.current = false; setBusy(false); }
  };

  return (
    <section className="admin-source-page space-y-5">
      <div className="grid gap-5">
        <InfrastructurePageHeader kicker="MESSAGE DELIVERY" title="发送记录" description="邮件成功以服务器接纳为准，不代表最终送达或已读；结果未确认须先核验，重发保留原记录。">
          <Button variant="outline" size="sm" onClick={refresh} disabled={page.loading || busy}>
            <RefreshCw size={16} className={cn(page.loading && 'animate-spin')} />
            刷新
          </Button>
          <PermissionGuard permissions={['system:message:record:resend']} hidden>
            <Button size="sm" disabled={!selected.length || busy || page.loading} onClick={() => requestResend(selected)}>重发所选（{selected.length}）</Button>
          </PermissionGuard>
        </InfrastructurePageHeader>
        <InfrastructureStats items={[
          { label: '发送总数', value: statistics ? String(statistics.total) : '—', meta: '所选日期内全部渠道', icon: <Mail size={18} />, tone: 'blue' },
          { label: '站内送达 / 外部接纳', value: statistics ? String(statistics.success) : '—', meta: statistics ? `接纳率 ${(statistics.successRate * 100).toFixed(1)}%` : statisticsLoading ? '正在读取统计' : '统计暂不可用', icon: <CheckCircle2 size={18} />, tone: 'green' },
          { label: '发送失败', value: statistics ? String(statistics.failed) : '—', meta: '可筛选失败记录并重发', icon: <CircleAlert size={18} />, tone: 'amber' },
          { label: '结果未确认', value: statistics ? String(statistics.unknown) : '—', meta: '须核验，禁止盲目重发', icon: <SkipForward size={18} />, tone: 'violet' },
        ]} />
      </div>
      <p className="text-xs leading-6 text-cf-subtle">统计按所选日期汇总全部渠道与模板，不受其余列表筛选影响。</p>
      {statisticsError && <p role="alert" className="text-sm text-cf-muted">{statisticsError}，可点击刷新重试。</p>}
      {statistics && <div className="grid gap-3 md:grid-cols-2">{[
        { title: '各渠道成功率', rates: statistics.channelSuccessRates, channel: true },
        { title: '各模板成功率', rates: statistics.templateSuccessRates, channel: false },
      ].map(({ title, rates, channel }) => <details key={title} className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer text-cf-title">{title}</summary>
        <dl className="mt-3 max-h-48 space-y-2 overflow-y-auto text-cf-muted">{Object.entries(rates || {}).map(([name, rate]) => <div key={name} className="flex justify-between gap-3"><dt className="min-w-0 break-all">{channel ? CHANNEL_LABELS[name as MessageChannelType] || name : name || '直接发送'}</dt><dd className="shrink-0">{(rate * 100).toFixed(1)}%</dd></div>)}</dl>
        {!Object.keys(rates || {}).length && <p className="mt-3 text-cf-subtle">暂无发送记录</p>}
      </details>)}</div>}
      {statistics?.topFailureReasons?.length ? <details className="min-w-0 rounded-md border p-3 text-sm"><summary className="cursor-pointer text-cf-title">主要失败原因</summary><ul className="mt-3 space-y-2 break-words text-cf-muted">{statistics.topFailureReasons.map((item, index) => <li key={`${item.reason}-${index}`}>{item.reason || '未知原因'}：{item.count} 条</li>)}</ul></details> : null}
      <TablePageLayout
        filters={<section className="card admin-users-toolbar">
          <form className="admin-users-filter-grid" onSubmit={search}>
          <InfrastructureField label="渠道"><InfrastructureSelect value={page.query.channelType || ''} options={[{ value: '', label: '全部渠道' }, ...channelOptions]} onValueChange={(value) => page.setQuery((current) => ({ ...current, channelType: value as MessageChannelType | '', pageNum: 1 }))} /></InfrastructureField>
          <InfrastructureField label="投递状态"><InfrastructureSelect value={page.query.sendStatus || ''} options={[{ value: '', label: '全部状态' }, ...Object.entries(SEND_STATUS_LABELS).map(([value, label]) => ({ value, label }))]} onValueChange={(value) => page.setQuery((current) => ({ ...current, sendStatus: value as MessageSendStatus | '', pageNum: 1 }))} /></InfrastructureField>
          <InfrastructureField label="模板编码"><Input value={filters.templateCode} onChange={(event) => setFilters((current) => ({ ...current, templateCode: event.target.value }))} /></InfrastructureField>
          <InfrastructureField label="业务类型"><Input value={filters.bizType} onChange={(event) => setFilters((current) => ({ ...current, bizType: event.target.value }))} /></InfrastructureField>
          <InfrastructureField label="接收人编号"><Input type="number" min={1} value={filters.receiverId} onChange={(event) => setFilters((current) => ({ ...current, receiverId: event.target.value }))} /></InfrastructureField>
          <InfrastructureField label="开始日期"><Input type="date" value={filters.beginTime} onChange={(event) => setFilters((current) => ({ ...current, beginTime: event.target.value }))} /></InfrastructureField>
          <InfrastructureField label="结束日期"><Input type="date" value={filters.endTime} onChange={(event) => setFilters((current) => ({ ...current, endTime: event.target.value }))} /></InfrastructureField>
          <div className="admin-users-toolbar-actions">
            <Button type="submit" size="sm"><Search size={16} />查询记录</Button>
            <span className="admin-users-filter-count">共 {page.total} 条</span>
          </div>
          </form>
        </section>}
        table={<InnerTableSurface className="flex min-h-0 flex-1 flex-col">
          <Table className="admin-source-table min-w-[900px]">
          <TableHeader><TableRow>
            <TableHead className="w-12" aria-label="选择"><PermissionGuard permissions={['system:message:record:resend']} hidden><input type="checkbox" className={infrastructureCheckboxClassName} aria-label="选择本页全部失败记录" disabled={!candidates.length || page.loading || busy} checked={candidates.length > 0 && candidates.every((recordId) => selected.includes(recordId))} onChange={(event) => setSelected(event.target.checked ? candidates : [])} /></PermissionGuard></TableHead>
            {['消息 / 模板', '接收方', '渠道 / 分类', '投递结果', '创建时间', '操作'].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>{page.loading || page.error || !page.rows.length ? <InfrastructureTableStateRow colSpan={7} loading={page.loading} title={page.loading ? '正在加载记录' : page.error || '暂无匹配记录'} description={page.error ? '点击刷新重新加载' : '调整筛选条件后重试'} /> : page.rows.map((record) => (
            <TableRow key={record.recordId}>
              <TableCell><PermissionGuard permissions={['system:message:record:resend']} hidden><input type="checkbox" className={infrastructureCheckboxClassName} aria-label={`选择消息 ${record.recordId}`} disabled={record.sendStatus !== 'FAILED' || busy} checked={selected.includes(record.recordId)} onChange={(event) => toggleSelection(record.recordId, event.target.checked)} /></PermissionGuard></TableCell>
              <TableCell className="max-w-xs"><p className="truncate font-medium text-cf-title">{record.title || '无标题'}</p><p className="mt-1 font-mono text-xs text-cf-subtle">{record.templateCode || '直接发送'}</p></TableCell>
              <TableCell>{record.receiverName || record.receiverAddrMask || record.receiverId || '—'}</TableCell>
              <TableCell>{CHANNEL_LABELS[record.channelType]}<p className="mt-1 text-xs text-cf-subtle">{CATEGORY_LABELS[record.messageCategory]}</p></TableCell>
              <TableCell className="max-w-xs"><InfrastructureBadge tone={record.sendStatus === 'SUCCESS' ? 'success' : record.sendStatus === 'FAILED' ? 'danger' : 'neutral'}>{SEND_STATUS_LABELS[record.sendStatus] || record.sendStatus}</InfrastructureBadge><p className="mt-1 truncate text-xs text-cf-subtle" title={record.errorMsg ? SKIP_REASON_LABELS[record.errorMsg] || record.errorMsg : undefined}>{record.errorMsg ? SKIP_REASON_LABELS[record.errorMsg] || record.errorMsg : (record.skipReason ? SKIP_REASON_LABELS[record.skipReason] || record.skipReason : '')}</p></TableCell>
              <TableCell className="whitespace-nowrap text-xs text-cf-subtle">{record.createTime || '—'}</TableCell>
              <TableCell>
                <div className="admin-users-row-actions">
                  <button type="button" data-tooltip="查看详情" aria-label="查看详情" onClick={() => setDetail(record)}><Eye size={15} /></button>
                  <PermissionGuard permissions={['system:message:record:resend']} hidden>
                    {record.sendStatus === 'FAILED' && <button type="button" disabled={busy} data-tooltip="重新发送" aria-label="重新发送" onClick={() => requestResend([record.recordId])}><RotateCcw size={15} /></button>}
                  </PermissionGuard>
                </div>
              </TableCell>
            </TableRow>
          ))}</TableBody>
          </Table>
        </InnerTableSurface>}
        pagination={<Pagination total={page.total} page={page.query.pageNum} pageSize={page.query.pageSize} onPageChange={(pageNum) => page.setQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => page.setQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />}
      />
      <BaseDialog open={Boolean(detail)} title="发送记录详情" width="wide" onClose={() => setDetail(null)}>
        {detail && <div className="admin-dialog-stack">
          <div className="admin-dialog-subhead">
            <div>
              <strong>{detail.title || '无标题'}</strong>
              <span>{CHANNEL_LABELS[detail.channelType]} · {CATEGORY_LABELS[detail.messageCategory]}</span>
            </div>
            <InfrastructureBadge tone={detail.sendStatus === 'SUCCESS' ? 'success' : detail.sendStatus === 'FAILED' ? 'danger' : 'neutral'}>
              {SEND_STATUS_LABELS[detail.sendStatus] || detail.sendStatus}
            </InfrastructureBadge>
          </div>
          <InfrastructureDialogPanel title="消息正文">
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-cf-muted">{detail.content || '无正文'}</p>
          </InfrastructureDialogPanel>
          <InfrastructureDialogPanel title="投递信息" bodyClassName="admin-message-detail-grid">
            <InfrastructureDetailField label="记录编号" value={detail.recordId} />
            <InfrastructureDetailField label="链路编号" value={detail.traceId} />
            <InfrastructureDetailField label="业务类型" value={detail.bizType} />
            <InfrastructureDetailField label="业务编号" value={detail.bizId} />
            <InfrastructureDetailField label="投递状态" value={SEND_STATUS_LABELS[detail.sendStatus] || detail.sendStatus} />
            <InfrastructureDetailField label="失败原因" value={detail.errorMsg ? SKIP_REASON_LABELS[detail.errorMsg] || detail.errorMsg : undefined} />
            <InfrastructureDetailField label="跳过原因" value={detail.skipReason ? SKIP_REASON_LABELS[detail.skipReason] || detail.skipReason : ''} />
            {/* 转成字符串再传：DetailField 用 value || '-' 兜底，数字 0 是 falsy，
                直接传 0 会显示成 '-'，把「重试过 0 次」错显成「无数据」。 */}
            <InfrastructureDetailField label="重试次数" value={String(detail.retryCount ?? 0)} />
            <InfrastructureDetailField label="来源记录" value={detail.resendFromId} />
            <InfrastructureDetailField label="发送时间" value={detail.sendTime} />
          </InfrastructureDialogPanel>
          {detail.deliveryId && <DeliveryDetail key={detail.deliveryId} deliveryId={detail.deliveryId} onResolved={(sendStatus) => {
            setDetail((current) => current ? { ...current, sendStatus } : current);
            refresh();
          }} />}
        </div>}
      </BaseDialog>
      <WarningConfirmDialog open={resendTargets.length > 0} onClose={() => setResendTargets([])} title="确认重发失败消息" message={`将为 ${resendTargets.length} 条失败记录创建新的发送请求。`} description="外部重发仍校验订阅和业务状态；结果未确认须先保存服务商核验依据。站内手工重发按既有规则处理。" onConfirm={() => void resend()} />
    </section>
  );
}
