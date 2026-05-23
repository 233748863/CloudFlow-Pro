import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  LoaderCircle,
  Plus,
  RefreshCw,
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
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import {
  meetingMinutesApi,
  parseDecisions,
  stringifyDecisions,
  type MeetingAttendStatus,
  type MeetingMinutesStatus,
  type OaMeetingAttendance,
  type OaMeetingDecision,
  type OaMeetingMinutes,
} from '@/services/api/meetingMinutes';
import { useAuth } from '@/context/AuthContext';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

const STATUS_LABELS: Record<MeetingMinutesStatus, { label: string; cls: string }> = {
  DRAFT: {
    label: '草稿',
    cls: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  },
  CONFIRMED: {
    label: '已确认',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200',
  },
};

const ATTEND_LABELS: Record<MeetingAttendStatus, { label: string; cls: string }> = {
  ATTEND: { label: '出席', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  ABSENT: { label: '缺席', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  LATE: { label: '迟到', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  LEAVE: { label: '请假', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  NOT_CHECKED: { label: '未登记', cls: 'border-slate-200 bg-slate-50 text-slate-500' },
};

const emptyForm = (): OaMeetingMinutes => ({
  meetingTitle: '',
  meetingTime: '',
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

  const [rows, setRows] = useState<OaMeetingMinutes[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ keyword: '', status: '', pageNum: 1, pageSize: 10 });

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.keyword) params.keyword = query.keyword;
      if (query.status) params.status = query.status;
      const res = await meetingMinutesApi.page(params);
      setRows(res.rows || []);
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

  const saveForm = async () => {
    if (!formData.meetingTitle.trim()) {
      toast.error('请输入会议标题');
      return;
    }
    if (!formData.minutesContent.trim()) {
      toast.error('请输入纪要内容');
      return;
    }
    try {
      const payload: OaMeetingMinutes = { ...formData, decisions: stringifyDecisions(decisions) };
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
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">关键字</Label>
        <Input
          value={query.keyword}
          onChange={(e) => setQuery((q) => ({ ...q, keyword: e.target.value }))}
          placeholder="会议标题 / 内容"
          className="w-56"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">状态</Label>
        <Select value={query.status} onValueChange={(v) => setQuery((q) => ({ ...q, status: v === '__all' ? '' : v }))}>
          <SelectTrigger className="w-36"><SelectValue placeholder="全部" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">全部</SelectItem>
            <SelectItem value="DRAFT">草稿</SelectItem>
            <SelectItem value="CONFIRMED">已确认</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button variant="outline" onClick={() => setQuery((q) => ({ ...q, pageNum: 1 }))}>
        <RefreshCw className="mr-1 h-4 w-4" />查询
      </Button>
      {canEdit ? (
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />新建会议纪要
        </Button>
      ) : null}
    </div>
  );

  const decisionCounts = useMemo(() => rows.map((r) => parseDecisions(r.decisions).length), [rows]);

  const table = (
    <TableSurfaceCard>
      <TableHeader>
        <tr>
          <TableHead>会议标题</TableHead>
          <TableHead>组织者</TableHead>
          <TableHead>会议时间</TableHead>
          <TableHead>地点</TableHead>
          <TableHead>决议项</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>更新时间</TableHead>
          <TableActionHead />
        </tr>
      </TableHeader>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={8} className="py-10 text-center text-sm text-slate-400">
              <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={8} className="py-10 text-center text-sm text-slate-400">暂无数据</td>
          </tr>
        ) : (
          rows.map((row, idx) => {
            const status = STATUS_LABELS[row.status || 'DRAFT'];
            return (
              <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{row.meetingTitle}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{row.organizerName || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{formatDateTimeDisplay(row.meetingTime)}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{row.location || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
                    {decisionCounts[idx]} 项
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${status.cls}`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{formatDateTimeDisplay(row.updateTime || row.createTime)}</td>
                <td className="px-4 py-3">
                  <TableRowActions
                    actions={[
                      { key: 'detail', label: '查看', semantic: 'view', onClick: () => void openDetail(row) },
                      ...(canEdit && row.status === 'DRAFT'
                        ? ([
                            { key: 'edit', label: '编辑', semantic: 'edit' as const, onClick: () => openEdit(row) },
                            { key: 'confirm', label: '确认纪要', semantic: 'confirm' as const, onClick: () => setPendingConfirmRow(row) },
                          ])
                        : []),
                      ...(canEdit
                        ? ([
                            { key: 'dispatch', label: '派发决议', semantic: 'send' as const, onClick: () => setPendingDispatch(row) },
                            { key: 'delete', label: '删除', semantic: 'delete' as const, onClick: () => setPendingDelete(row) },
                          ])
                        : []),
                    ]}
                  />
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </TableSurfaceCard>
  );

  const pagination = (
    <div className="flex justify-end">
      <Pagination
        page={query.pageNum}
        pageSize={query.pageSize}
        total={total}
        onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
        onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
      />
    </div>
  );

  return (
    <>
      <TablePageLayout filters={filters} table={table} pagination={pagination} />

      <BaseDialog
        open={formOpen}
        title={formData.id ? '编辑会议纪要' : '新建会议纪要'}
        onClose={() => setFormOpen(false)}
        width="wide"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={() => void saveForm()}>保存</Button>
          </div>
        )}
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>会议标题</Label>
              <Input
                value={formData.meetingTitle}
                onChange={(e) => setFormData((f) => ({ ...f, meetingTitle: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>组织者</Label>
              <Input
                value={formData.organizerName || ''}
                onChange={(e) => setFormData((f) => ({ ...f, organizerName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>会议时间</Label>
              <DatePicker
                type="datetime-local"
                value={formData.meetingTime || ''}
                onChange={(e) => setFormData((f) => ({ ...f, meetingTime: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>地点</Label>
              <Input
                value={formData.location || ''}
                onChange={(e) => setFormData((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>纪要内容</Label>
            <Textarea
              rows={6}
              value={formData.minutesContent}
              onChange={(e) => setFormData((f) => ({ ...f, minutesContent: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>决议项</Label>
              <Button size="sm" variant="outline" onClick={() => setDecisions((prev) => [...prev, emptyDecision()])}>
                <Plus className="mr-1 h-3.5 w-3.5" />新增决议
              </Button>
            </div>
            {decisions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
                暂无决议项
              </div>
            ) : (
              <div className="space-y-2">
                {decisions.map((d, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_8rem_2rem]">
                      <Input
                        placeholder="决议事项"
                        value={d.title || ''}
                        onChange={(e) => updateDecisionAt(idx, { title: e.target.value })}
                      />
                      <Input
                        placeholder="责任人"
                        value={d.ownerName || ''}
                        onChange={(e) => updateDecisionAt(idx, { ownerName: e.target.value })}
                      />
                      <DatePicker
                        value={d.dueDate || ''}
                        onChange={(e) => updateDecisionAt(idx, { dueDate: e.target.value })}
                      />
                      <Button size="icon" variant="ghost" onClick={() => removeDecisionAt(idx)}>
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
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-slate-500">组织者：</span>{detail.organizerName || '-'}</div>
              <div><span className="text-slate-500">会议时间：</span>{formatDateTimeDisplay(detail.meetingTime)}</div>
              <div><span className="text-slate-500">地点：</span>{detail.location || '-'}</div>
              <div>
                <span className="text-slate-500">状态：</span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${STATUS_LABELS[detail.status || 'DRAFT'].cls}`}>
                  {STATUS_LABELS[detail.status || 'DRAFT'].label}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="mb-2 text-xs font-medium text-slate-500">纪要内容</div>
              <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{detail.minutesContent}</div>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-medium text-slate-500">
                  <ClipboardList className="mr-1 inline h-3.5 w-3.5" />决议项 ({detailDecisions.length})
                </div>
                {canEdit ? (
                  <Button size="sm" variant="outline" onClick={() => setPendingDispatch(detail)}>
                    <Send className="mr-1 h-3.5 w-3.5" />一键派发为工作任务
                  </Button>
                ) : null}
              </div>
              {detailDecisions.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">暂无决议项</div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {detailDecisions.map((d, idx) => (
                    <li key={idx} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/40">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{d.title || '-'}</span>
                        {d.workTaskId ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                            已派发 #{d.workTaskId}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        责任人 {d.ownerName || '-'} · 截止 {d.dueDate || '-'}
                      </div>
                      {d.remark ? <div className="mt-1 text-xs text-slate-400">{d.remark}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-medium text-slate-500">
                  <Users className="mr-1 inline h-3.5 w-3.5" />出席记录 ({attendance.length})
                </div>
                {canEdit ? (
                  <Button size="sm" variant="outline" onClick={openAttendanceCreate}>
                    <UserCheck className="mr-1 h-3.5 w-3.5" />登记出席
                  </Button>
                ) : null}
              </div>
              {attendanceLoading ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  <LoaderCircle className="mx-auto mb-1 h-4 w-4 animate-spin" />加载中...
                </div>
              ) : attendance.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">暂无出席记录</div>
              ) : (
                <ul className="space-y-1 text-sm">
                  {attendance.map((a) => {
                    const label = ATTEND_LABELS[a.attendStatus] || ATTEND_LABELS.NOT_CHECKED;
                    return (
                      <li key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/40">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700 dark:text-slate-100">{a.userName || '-'}</span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${label.cls}`}>
                            {label.label}
                          </span>
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
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={attendanceFormOpen}
        title={attendanceForm.id ? '编辑出席记录' : '登记出席'}
        onClose={() => setAttendanceFormOpen(false)}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAttendanceFormOpen(false)}>取消</Button>
            <Button onClick={() => void saveAttendance()}>保存</Button>
          </div>
        )}
      >
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>参会人</Label>
            <Input
              value={attendanceForm.userName || ''}
              onChange={(e) => setAttendanceForm((f) => ({ ...f, userName: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>出席状态</Label>
            <Select
              value={attendanceForm.attendStatus}
              onValueChange={(v) => setAttendanceForm((f) => ({ ...f, attendStatus: v as MeetingAttendStatus }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ATTEND_LABELS) as MeetingAttendStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>{ATTEND_LABELS[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>签到时间</Label>
            <DatePicker
              type="datetime-local"
              value={attendanceForm.checkInTime || ''}
              onChange={(e) => setAttendanceForm((f) => ({ ...f, checkInTime: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>备注</Label>
            <Textarea
              rows={2}
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
    </>
  );
};

export default MeetingMinutesPage;
