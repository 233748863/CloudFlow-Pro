import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import {
  CheckCheck,
  ClipboardList,
  Clock3,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DatePicker,
  Input,
  Label,
  MeetingRoomSelector,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  UserSelector,
} from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  meetingMinutesApi,
  parseDecisions,
  stringifyDecisions,
  type MeetingAttendStatus,
  type OaMeetingAttendance,
  type OaMeetingDecision,
  type OaMeetingMinutes,
} from '@/services/api/meetingMinutes';
import { useAuth } from '@/context/AuthContext';
import { createEvent } from '@/services/api/schedule';
import { PageResult } from '@/types';
import { formatDateTimeDisplay, toBackendDateString } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';

const normalizeRows = <T,>(result: PageResult<T>) => result.rows || result.records || [];

const formatTableDateTime = (value?: string) => {
  const text = formatDateTimeDisplay(value);
  if (!text || text === '-') return text;
  return text.replace(/^\d{4}-/, '').replace(/:\d{2}$/, '');
};

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

interface MinutesSurfaceProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}

const MinutesSurface: React.FC<MinutesSurfaceProps> = ({
  title,
  description,
  action,
  bodyClassName = '',
  children,
}) => (
  <InnerTableSurface className="admin-meeting-minutes-surface" wrapperClassName="admin-meeting-minutes-surface-wrapper">
    <div className="admin-meeting-minutes-surface-head">
      <div>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      {action ? <div className="admin-meeting-minutes-surface-action">{action}</div> : null}
    </div>
    <div className={`admin-meeting-minutes-surface-body ${bodyClassName}`}>{children}</div>
  </InnerTableSurface>
);

const getStatusBadge = (status?: string) => (
  <DictBadge dictType="oa_meeting_minutes_status" value={String(status || 'DRAFT')} />
);

const emptyForm = (): OaMeetingMinutes => ({
  meetingTitle: '',
  meetingTime: '',
  roomId: '',
  location: '',
  organizerName: '',
  minutesContent: '',
  decisions: '[]',
  attachmentUrl: '',
  status: 'DRAFT',
});

const emptyDecision = (): OaMeetingDecision => ({
  title: '',
  ownerName: '',
  dueDate: '',
  remark: '',
  status: 'PENDING',
});

const emptyAttendance = (minutesId: number): OaMeetingAttendance => ({
  minutesId,
  userName: '',
  attendStatus: 'NOT_CHECKED',
  remark: '',
});

const MeetingMinutesPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('oa:meeting:edit') ?? true;
  const statusDict = useDict('oa_meeting_minutes_status');
  const attendDict = useDict('oa_meeting_attend_status');

  const [rows, setRows] = useState<OaMeetingMinutes[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ keyword: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<OaMeetingMinutes>(emptyForm);
  const [decisions, setDecisions] = useState<OaMeetingDecision[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<OaMeetingMinutes | null>(null);
  const [detailDecisions, setDetailDecisions] = useState<OaMeetingDecision[]>([]);
  const [attendance, setAttendance] = useState<OaMeetingAttendance[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const [attendanceFormOpen, setAttendanceFormOpen] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState<OaMeetingAttendance>(emptyAttendance(0));

  const [pendingDelete, setPendingDelete] = useState<OaMeetingMinutes | null>(null);
  const [pendingAttendDelete, setPendingAttendDelete] = useState<OaMeetingAttendance | null>(null);
  const [pendingDispatch, setPendingDispatch] = useState<OaMeetingMinutes | null>(null);
  const [pendingConfirmRow, setPendingConfirmRow] = useState<OaMeetingMinutes | null>(null);
  const [bookingConflict, setBookingConflict] = useState<{ payload: OaMeetingMinutes; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.keyword) params.keyword = query.keyword;
      if (query.status) params.status = query.status;
      const res = await meetingMinutesApi.page(params);
      setRows(normalizeRows(res));
      setTotal(res.total || 0);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载会议纪要失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setFormData(emptyForm());
    setDecisions([]);
    setFormOpen(true);
  };

  const openEdit = (row: OaMeetingMinutes) => {
    setFormData({ ...emptyForm(), ...row });
    setDecisions(parseDecisions(row.decisions));
    setFormOpen(true);
  };

  const reloadAttendance = useCallback(async (minutesId: number) => {
    setAttendanceLoading(true);
    try {
      const list = await meetingMinutesApi.listAttendance(minutesId);
      setAttendance(list || []);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载出席记录失败'));
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  const openDetail = async (row: OaMeetingMinutes) => {
    setDetail(row);
    setDetailDecisions(parseDecisions(row.decisions));
    setDetailOpen(true);
    if (row.id) {
      await reloadAttendance(row.id);
    } else {
      setAttendance([]);
    }
  };

  const persistMinutes = async (payload: OaMeetingMinutes) => {
    try {
      if (payload.id) {
        await meetingMinutesApi.edit(payload);
        toast.success('已更新');
      } else {
        await meetingMinutesApi.add(payload);
        toast.success('已新增');
      }
      setFormOpen(false);
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'));
    }
  };

  const saveForm = async () => {
    if (!formData.meetingTitle.trim()) {
      toast.error('请输入会议标题');
      return;
    }
    if (!formData.minutesContent.trim()) {
      toast.error('请输入纪要内容');
      return;
    }
    const payload: OaMeetingMinutes = { ...formData, decisions: stringifyDecisions(decisions) };

    // 如果选择了会议室和会议时间，自动创建会议室预约
    let scheduleEventId = payload.scheduleEventId;
    if (payload.roomId && payload.meetingTime) {
      try {
        const startDate = new Date(payload.meetingTime);
        const endDate = new Date(startDate.getTime() + 90 * 60 * 1000); // 默认1.5小时
        const startStr = toBackendDateString(startDate);
        const endStr = toBackendDateString(endDate);
        if (startStr && endStr) {
          await createEvent({
            title: payload.meetingTitle,
            startTime: startStr,
            endTime: endStr,
            type: 'MEETING',
            roomId: payload.roomId,
          });
          toast.success('会议室已自动预约');
        }
      } catch (bookingErr: any) {
        const msg = bookingErr?.response?.data?.msg || bookingErr?.message || '';
        if (msg.includes('已被预订')) {
          // 冲突：弹窗询问是否仍保存纪要（不关联预约）
          setBookingConflict({ payload: { ...payload, scheduleEventId: undefined }, message: msg });
          return;
        }
        // 其他预约失败，仍保存纪要
        console.warn('会议室预约失败，仅保存纪要:', msg);
        scheduleEventId = undefined;
      }
    }

    await persistMinutes({ ...payload, scheduleEventId });
  };

  const handleDelete = async () => {
    if (!pendingDelete?.id) return;
    try {
      await meetingMinutesApi.remove(pendingDelete.id);
      toast.success('已删除');
      setPendingDelete(null);
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败'));
    }
  };

  const handleConfirm = async () => {
    if (!pendingConfirmRow?.id) return;
    try {
      await meetingMinutesApi.confirm(pendingConfirmRow.id);
      toast.success('已确认');
      setPendingConfirmRow(null);
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '确认失败'));
    }
  };

  const handleDispatch = async () => {
    if (!pendingDispatch?.id) return;
    try {
      const list = parseDecisions(pendingDispatch.decisions);
      if (list.length === 0) {
        toast.error('当前纪要没有决议项可派发');
        setPendingDispatch(null);
        return;
      }
      const taskIds = await meetingMinutesApi.dispatchDecisions(pendingDispatch.id, list);
      toast.success(`已派发 ${taskIds?.length ?? 0} 个工作任务`);
      setPendingDispatch(null);
      void fetchData();
      if (detail?.id === pendingDispatch.id) {
        await openDetail(pendingDispatch);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, '派发失败'));
    }
  };

  const updateDecisionAt = (index: number, patch: Partial<OaMeetingDecision>) => {
    setDecisions((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const removeDecisionAt = (index: number) => {
    setDecisions((prev) => prev.filter((_, i) => i !== index));
  };

  const openAttendanceCreate = () => {
    if (!detail?.id) return;
    setAttendanceForm(emptyAttendance(detail.id));
    setAttendanceFormOpen(true);
  };

  const openAttendanceEdit = (row: OaMeetingAttendance) => {
    setAttendanceForm({ ...row });
    setAttendanceFormOpen(true);
  };

  const saveAttendance = async () => {
    if (!attendanceForm.userName?.trim()) {
      toast.error('请输入参会人姓名');
      return;
    }
    try {
      await meetingMinutesApi.upsertAttendance(attendanceForm);
      toast.success('已保存');
      setAttendanceFormOpen(false);
      if (detail?.id) await reloadAttendance(detail.id);
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'));
    }
  };

  const handleAttendDelete = async () => {
    if (!pendingAttendDelete?.id) return;
    try {
      await meetingMinutesApi.removeAttendance(pendingAttendDelete.id);
      toast.success('已删除');
      setPendingAttendDelete(null);
      if (detail?.id) await reloadAttendance(detail.id);
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败'));
    }
  };

  const filters = (
    <section className="card admin-users-toolbar">
      <div className="admin-toolbar-filter-grid">
        <label className="min-w-0">
          <span className="input-label">搜索纪要</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              className="h-[42px]"
              type="search"
              value={query.keyword}
              onChange={(e) => setQuery((q) => ({ ...q, keyword: e.target.value }))}
              placeholder="会议标题 / 内容"
            />
          </div>
        </label>
        <label className="min-w-0">
          <span className="input-label">状态</span>
          <Select value={query.status || 'ALL'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === 'ALL' ? '' : v }))}>
            <SelectTrigger className="h-[42px] w-full"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {statusDict.getOptions().map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button variant="outline" size="sm" onClick={() => setQuery({ keyword: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) })}>
            <RefreshCw size={14} className="mr-1.5" />清空条件
          </Button>
          {canEdit ? (
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} className="mr-1.5" />新建会议纪要
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );

  const decisionCounts = useMemo(() => rows.map((r) => parseDecisions(r.decisions).length), [rows]);

  const table = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table admin-meeting-minutes-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>会议标题</th>
              <th>组织者</th>
              <th>会议时间</th>
              <th>地点</th>
              <th>决议项</th>
              <th>状态</th>
              <th>更新时间</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={8} title="正在加载会议纪要..." loading />
            ) : rows.length === 0 ? (
              <TableStateRow colSpan={8} title="暂无会议纪要" />
            ) : rows.map((row, idx) => (
              <tr key={row.id}>
                <td>
                  <div className="admin-users-identity">
                    <div>
                      <strong>{row.meetingTitle}</strong>
                      <small>{formatTableDateTime(row.createTime)}</small>
                    </div>
                  </div>
                </td>
                <td>{row.organizerName || '-'}</td>
                <td>{formatTableDateTime(row.meetingTime)}</td>
                <td>{row.location || '-'}</td>
                <td>
                  <span className="inline-flex items-center gap-1">
                    <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
                    {decisionCounts[idx]} 项
                  </span>
                </td>
                <td>{getStatusBadge(row.status)}</td>
                <td className="text-xs text-slate-400 dark:text-slate-500">{formatTableDateTime(row.updateTime || row.createTime)}</td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" title="查看" aria-label="查看会议纪要" onClick={() => void openDetail(row)}>
                      <FileText size={15} />
                    </button>
                    {canEdit && row.status === 'DRAFT' ? (
                      <>
                        <button type="button" title="编辑" aria-label="编辑会议纪要" onClick={() => openEdit(row)}>
                          <RefreshCw size={15} />
                        </button>
                        <button type="button" title="确认纪要" aria-label="确认纪要" onClick={() => setPendingConfirmRow(row)}>
                          <CheckCheck size={15} />
                        </button>
                      </>
                    ) : null}
                    {canEdit ? (
                      <>
                        <button type="button" title="派发决议" aria-label="派发决议" onClick={() => setPendingDispatch(row)}>
                          <Send size={15} />
                        </button>
                        <button type="button" className="danger" title="删除" aria-label="删除会议纪要" onClick={() => setPendingDelete(row)}>
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagination = total > 0 ? (
    <Pagination
      total={total}
      page={query.pageNum}
      pageSize={query.pageSize}
      showPageSizeSelector={false}
      showJump={false}
      onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
    />
  ) : null;

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">MEETING MINUTES</p>
          <h2>会议纪要</h2>
          <span>沉淀会议内容、出席记录、确认状态和决议派发</span>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <div className="admin-source-stat-icon"><FileText size={18} /></div>
          <div><p>纪要总数</p><strong>{total}</strong><span>当前条件</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <div className="admin-source-stat-icon"><ClipboardList size={18} /></div>
          <div><p>本页决议</p><strong>{decisionCounts.reduce((sum, count) => sum + count, 0)}</strong><span>待跟进事项</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <div className="admin-source-stat-icon"><Users size={18} /></div>
          <div><p>本页会议</p><strong>{rows.length}</strong><span>列表加载</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <div className="admin-source-stat-icon"><Clock3 size={18} /></div>
          <div><p>草稿</p><strong>{rows.filter((row) => row.status === 'DRAFT').length}</strong><span>可编辑状态</span></div>
        </article>
      </section>
    </div>
  );

  return (
    <div className="admin-source-page admin-meeting-minutes-page">
      <TablePageLayout
        actions={pageActions}
        filters={filters}
        table={table}
        pagination={pagination}
      />

      <BaseDialog
        open={formOpen}
        title={formData.id ? '编辑会议纪要' : '新建会议纪要'}
        onClose={() => setFormOpen(false)}
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={() => void saveForm()}>保存</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>会议标题</Label>
              <Input
                className="!h-11 min-h-11"
                value={formData.meetingTitle}
                onChange={(e) => setFormData((f) => ({ ...f, meetingTitle: e.target.value }))}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>组织者</Label>
              <UserSelector
                single
                allowClear
                value={formData.organizerId ? String(formData.organizerId) : null}
                onChange={(id, picked) => setFormData((f) => ({
                  ...f,
                  organizerId: id ? Number(id) : undefined,
                  organizerName: picked?.name || '',
                }))}
                placeholder="选择组织者"
              />
            </div>
            <div className="admin-dialog-field">
              <Label>会议时间</Label>
              <DatePicker
                className="!h-11 min-h-11"
                type="datetime-local"
                value={formData.meetingTime || ''}
                onChange={(e) => setFormData((f) => ({ ...f, meetingTime: e.target.value }))}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>地点</Label>
              <MeetingRoomSelector
                value={formData.roomId || null}
                onChange={(id, room) => setFormData((f) => ({
                  ...f,
                  roomId: id || '',
                  location: room ? `${room.name} ${room.location}` : '',
                }))}
                placeholder="选择会议室"
                allowClear
              />
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>纪要内容</Label>
            <Textarea
              className="min-h-[120px] resize-none"
              value={formData.minutesContent}
              onChange={(e) => setFormData((f) => ({ ...f, minutesContent: e.target.value }))}
            />
          </div>
          <div className="admin-dialog-field">
            <div className="flex items-center justify-between">
              <Label>决议项</Label>
              <Button size="sm" variant="outline" onClick={() => setDecisions((prev) => [...prev, emptyDecision()])}>
                <Plus size={14} className="mr-1.5" />新增决议
              </Button>
            </div>
            {decisions.length === 0 ? (
              <div className="admin-meeting-minutes-empty">
                暂无决议项
              </div>
            ) : (
              <div className="grid gap-2">
                {decisions.map((d, idx) => (
                  <div key={idx} className="admin-meeting-minutes-decision-editor">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_8rem_2.75rem]">
                      <Input
                        className="!h-11 min-h-11"
                        placeholder="决议事项"
                        value={d.title || ''}
                        onChange={(e) => updateDecisionAt(idx, { title: e.target.value })}
                      />
                      <UserSelector
                        single
                        allowClear
                        value={d.ownerId ? String(d.ownerId) : null}
                        onChange={(id, picked) => updateDecisionAt(idx, {
                          ownerId: id ? Number(id) : undefined,
                          ownerName: picked?.name || '',
                        })}
                        placeholder="选择责任人"
                      />
                      <DatePicker
                        className="!h-11 min-h-11"
                        value={d.dueDate || ''}
                        onChange={(e) => updateDecisionAt(idx, { dueDate: e.target.value })}
                      />
                      <Button className="!h-11 !w-11" size="icon" variant="ghost" onClick={() => removeDecisionAt(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </Button>
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="备注"
                      value={d.remark || ''}
                      onChange={(e) => updateDecisionAt(idx, { remark: e.target.value })}
                      className="mt-2"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={detailOpen}
        title={detail?.meetingTitle || '会议纪要详情'}
        onClose={() => setDetailOpen(false)}
        width="wide"
        headerAside={detail ? getStatusBadge(detail.status) : null}
        bodyClassName="admin-dialog-stack"
        footer={<Button variant="outline" onClick={() => setDetailOpen(false)}>关闭</Button>}
      >
        {detail ? (
          <div className="admin-dialog-stack">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                ['组织者', detail.organizerName],
                ['会议时间', formatDateTimeDisplay(detail.meetingTime)],
                ['地点', detail.location],
                ['创建时间', formatDateTimeDisplay(detail.createTime)],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-slate-200 pb-3 dark:border-slate-800">
                  <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
                <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value || '-'}</div>
              </div>
            ))}
            </div>
            <MinutesSurface title="纪要内容" description="会议正文记录">
              <div className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{detail.minutesContent}</div>
            </MinutesSurface>
            <MinutesSurface
              title={`决议项 (${detailDecisions.length})`}
              description="责任人、截止时间和任务派发状态"
              action={canEdit ? (
                  <Button size="sm" variant="outline" onClick={() => setPendingDispatch(detail)}>
                    <Send size={14} className="mr-1.5" />一键派发为工作任务
                  </Button>
                ) : null}
            >
              {detailDecisions.length === 0 ? (
                <div className="admin-meeting-minutes-empty">暂无决议项</div>
              ) : (
                <ul className="admin-meeting-minutes-decision-list">
                  {detailDecisions.map((d, idx) => (
                    <li key={idx} className="admin-meeting-minutes-decision-item">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{d.title || '-'}</span>
                        {d.workTaskId ? (
                          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                            已派发 #{d.workTaskId}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        责任人 {d.ownerName || '-'} · 截止 {d.dueDate || '-'}
                      </div>
                      {d.remark ? <div className="mt-1 text-xs text-slate-400">{d.remark}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </MinutesSurface>

            <MinutesSurface
              title={`出席记录 (${attendance.length})`}
              description="参会人签到和出席状态"
              action={canEdit ? (
                  <Button size="sm" variant="outline" onClick={openAttendanceCreate}>
                    <UserCheck size={14} className="mr-1.5" />登记出席
                  </Button>
                ) : null}
            >
              {attendanceLoading ? (
                <div className="admin-meeting-minutes-empty">
                  <LoaderCircle className="mx-auto mb-1 h-4 w-4 animate-spin" />加载中...
                </div>
              ) : attendance.length === 0 ? (
                <div className="admin-meeting-minutes-empty">暂无出席记录</div>
              ) : (
                <ul className="admin-meeting-minutes-attendance-list">
                  {attendance.map((a) => (
                    <li key={a.id} className="admin-meeting-minutes-attendance-item">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{a.userName || '-'}</span>
                        <DictBadge dictType="oa_meeting_attend_status" value={String(a.attendStatus || 'NOT_CHECKED')} />
                        {a.checkInTime ? (
                          <span className="text-xs text-slate-400">{formatDateTimeDisplay(a.checkInTime)}</span>
                        ) : null}
                        {a.remark ? <span className="text-xs text-slate-400">· {a.remark}</span> : null}
                      </div>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openAttendanceEdit(a)}>编辑</Button>
                          <Button size="sm" variant="ghost" onClick={() => setPendingAttendDelete(a)}>
                            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </MinutesSurface>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={attendanceFormOpen}
        title={attendanceForm.id ? '编辑出席记录' : '登记出席'}
        onClose={() => setAttendanceFormOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={() => setAttendanceFormOpen(false)}>取消</Button>
            <Button onClick={() => void saveAttendance()}>保存</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <div className="admin-dialog-field">
            <Label>参会人</Label>
            <Input
              className="h-11"
              value={attendanceForm.userName || ''}
              onChange={(e) => setAttendanceForm((f) => ({ ...f, userName: e.target.value }))}
            />
          </div>
          <div className="admin-dialog-field">
            <Label>出席状态</Label>
            <Select
              value={attendanceForm.attendStatus}
              onValueChange={(v) => setAttendanceForm((f) => ({ ...f, attendStatus: v as MeetingAttendStatus }))}
            >
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {attendDict.getOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field">
            <Label>签到时间</Label>
            <DatePicker
              className="h-11"
              type="datetime-local"
              value={attendanceForm.checkInTime || ''}
              onChange={(e) => setAttendanceForm((f) => ({ ...f, checkInTime: e.target.value }))}
            />
          </div>
          <div className="admin-dialog-field">
            <Label>备注</Label>
            <Textarea
              className="min-h-[80px] resize-none"
              value={attendanceForm.remark || ''}
              onChange={(e) => setAttendanceForm((f) => ({ ...f, remark: e.target.value }))}
            />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除会议纪要"
        message={`确认删除「${pendingDelete?.meetingTitle}」？`}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={!!pendingConfirmRow}
        title="确认纪要"
        message={`确认「${pendingConfirmRow?.meetingTitle}」？确认后将不可再编辑。`}
        onCancel={() => setPendingConfirmRow(null)}
        onConfirm={handleConfirm}
      />

      <ConfirmDialog
        open={!!pendingDispatch}
        title="派发决议为工作任务"
        message={`将「${pendingDispatch?.meetingTitle}」中尚未派发的决议项创建为工作任务，发送给对应责任人。`}
        onCancel={() => setPendingDispatch(null)}
        onConfirm={handleDispatch}
      />

      <ConfirmDialog
        open={!!pendingAttendDelete}
        title="删除出席记录"
        message={`确认删除「${pendingAttendDelete?.userName}」的出席记录？`}
        danger
        onCancel={() => setPendingAttendDelete(null)}
        onConfirm={handleAttendDelete}
      />

      <ConfirmDialog
        open={!!bookingConflict}
        title="会议室预约失败"
        message={`会议室预约失败：${bookingConflict?.message ?? ''}\n\n是否仍要保存会议纪要（不关联会议室预约）？`}
        confirmText="仍要保存"
        onCancel={() => setBookingConflict(null)}
        onConfirm={() => {
          const payload = bookingConflict?.payload;
          setBookingConflict(null);
          if (payload) void persistMinutes(payload);
        }}
      />
    </div>
  );
};

export default MeetingMinutesPage;
