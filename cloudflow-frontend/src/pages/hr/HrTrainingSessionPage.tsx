import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { Ban, CalendarClock, Check, LoaderCircle, Pencil, Play, Plus, RefreshCcw, RotateCcw, Send, Trash2 } from 'lucide-react';
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
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import {
  HrTrainingSession,
  HrTrainingSessionPayload,
  HrTrainingCourse,
  listTrainingSessions,
  createTrainingSession,
  updateTrainingSession,
  deleteTrainingSession,
  changeTrainingSessionStatus,
  listTrainingCourses,
} from '@/services/api/hr';
import { useAuth } from '@/context/AuthContext';
import { normalizeRows, formatDateTimeValue } from './hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';
import { toLocalDatetimeString } from '@/utils/dateFormat';

const defaultForm: HrTrainingSessionPayload = {
  courseId: 0,
  startTime: '',
  endTime: '',
  capacity: 30,
  status: 'PLANNED',
};

export const HrTrainingSessionPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:training:session:edit') ?? true;
  const canAdd = hasPermission?.('hr:training:session:add') ?? true;
  const canRemove = hasPermission?.('hr:training:session:remove') ?? true;

  const [rows, setRows] = useState<HrTrainingSession[]>([]);
  const [courses, setCourses] = useState<HrTrainingCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ courseId: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrTrainingSessionPayload>(defaultForm);
  const [pendingDelete, setPendingDelete] = useState<HrTrainingSession | null>(null);
  const statusOptions = useDict('hr_training_session_status').getOptions();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.courseId) params.courseId = query.courseId;
      if (query.status) params.status = query.status;
      const sessRes = await listTrainingSessions(params);
      setRows(normalizeRows<HrTrainingSession>(sessRes));
      setTotal(sessRes?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '班次加载失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const courseRes = await listTrainingCourses({ pageSize: 500 });
        setCourses(normalizeRows<HrTrainingCourse>(courseRes));
      } catch (error) {
        toast.error(getErrorMessage(error, '课程加载失败'));
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!form.courseId || !form.startTime || !form.endTime) {
      toast.error('请选择课程并填写开始/结束时间');
      return;
    }
    try {
      if (editingId) await updateTrainingSession(editingId, form);
      else await createTrainingSession(form);
      toast.success('已保存');
      setOpen(false);
      setEditingId(null);
      setForm(defaultForm);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTrainingSession(pendingDelete.id);
      toast.success('已删除');
      setPendingDelete(null);
      if (rows.length === 1 && query.pageNum > 1) {
        setQuery((q) => ({ ...q, pageNum: q.pageNum - 1 }));
      } else {
        await load();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const handleAction = async (row: HrTrainingSession, action: 'register' | 'start' | 'complete' | 'cancel') => {
    try {
      await changeTrainingSessionStatus(row.id, action);
      toast.success('已更新');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const hasFilters = Boolean(query.courseId || query.status);

  const pagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">TRAINING SESSIONS</p>
                  <h2>培训班次</h2>
                  <span>维护课程班次、报名开放、开课和结课状态</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    <RefreshCcw className={loading ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} />刷新
                  </Button>
                  {canAdd ? (
                    <Button size="sm" onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
                      <Plus className="mr-1.5 h-4 w-4" />新建班次
                    </Button>
                  ) : null}
                </div>
              </header>
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <div className="admin-source-stat-icon"><CalendarClock size={18} /></div>
                  <div><p>班次总数</p><strong>{total}</strong><span>当前筛选结果</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <div className="admin-source-stat-icon"><Send size={18} /></div>
                  <div><p>可报名</p><strong>{rows.filter((row) => row.status === 'REGISTERING').length}</strong><span>开放报名中</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-violet">
                  <div className="admin-source-stat-icon"><Play size={18} /></div>
                  <div><p>进行中</p><strong>{rows.filter((row) => row.status === 'ONGOING').length}</strong><span>已开课班次</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <div className="admin-users-filter-grid">
                <label>
                  <span className="input-label">课程</span>
                  <Select value={query.courseId || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, courseId: v === '__all' ? '' : v }))}>
                    <SelectTrigger className="cf-control"><SelectValue placeholder="全部课程" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">全部课程</SelectItem>
                      {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.courseName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  <span className="input-label">状态</span>
                  <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
                    <SelectTrigger className="cf-control"><SelectValue placeholder="全部状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">全部状态</SelectItem>
                      {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <div className="admin-users-toolbar-actions">
                {hasFilters ? (
                  <Button variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, courseId: '', status: '' }))}>
                    <RotateCcw className="mr-1.5 h-4 w-4" />清空条件
                  </Button>
                ) : null}
                <span className="admin-users-filter-count">共 {total} 条</span>
              </div>
            </section>
          }
          table={
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[1080px]">
                  <thead>
                    <tr>
                      <th>班次号</th>
                      <th>课程</th>
                      <th>地点</th>
                      <th>开始</th>
                      <th>结束</th>
                      <th>容量</th>
                      <th>已报名</th>
                      <th>状态</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="admin-settings-empty">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="admin-settings-empty">暂无班次</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          <td className="font-mono text-xs">{row.sessionNo || `#${row.id}`}</td>
                          <td><strong>{courses.find((c) => c.id === row.courseId)?.courseName || `课程#${row.courseId}`}</strong></td>
                          <td>{row.location || '-'}</td>
                          <td>{formatDateTimeValue(row.startTime)}</td>
                          <td>{formatDateTimeValue(row.endTime)}</td>
                          <td>{row.capacity}</td>
                          <td>{row.enrolledCount ?? 0}</td>
                          <td><DictLabel dictType="hr_training_session_status" value={row.status} fallback="-" /></td>
                          <td>
                            <div className="admin-users-row-actions">
                              {canEdit ? (
                                <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => { setEditingId(row.id); setForm({ ...row, startTime: toLocalDatetimeString(row.startTime), endTime: toLocalDatetimeString(row.endTime) }); setOpen(true); }}>
                                  <Pencil size={15} />
                                </button>
                              ) : null}
                              {canEdit && row.status === 'PLANNED' ? (
                                <button type="button" data-tooltip="开放报名" aria-label="开放报名" onClick={() => void handleAction(row, 'register')}>
                                  <Send size={15} />
                                </button>
                              ) : null}
                              {canEdit && row.status === 'REGISTERING' ? (
                                <button type="button" data-tooltip="开始" aria-label="开始" onClick={() => void handleAction(row, 'start')}>
                                  <Play size={15} />
                                </button>
                              ) : null}
                              {canEdit && row.status === 'ONGOING' ? (
                                <button type="button" data-tooltip="完成" aria-label="完成" onClick={() => void handleAction(row, 'complete')}>
                                  <Check size={15} />
                                </button>
                              ) : null}
                              {canEdit && row.status !== 'COMPLETED' && row.status !== 'CANCELLED' ? (
                                <button type="button" data-tooltip="取消" aria-label="取消" onClick={() => void handleAction(row, 'cancel')}>
                                  <Ban size={15} />
                                </button>
                              ) : null}
                              {canRemove ? (
                                <button type="button" className="danger" data-tooltip="删除" aria-label="删除" onClick={() => setPendingDelete(row)}>
                                  <Trash2 size={15} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </InnerTableSurface>
          }
          pagination={pagination}
        />
      </section>

      <BaseDialog
        open={open}
        title={editingId ? '编辑班次' : '新建班次'}
        onClose={() => setOpen(false)}
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
          </div>
        }
      >
        <>
          <div className="admin-dialog-field">
            <Label>课程</Label>
            <Select value={form.courseId ? String(form.courseId) : ''} onValueChange={(v) => setForm((p) => ({ ...p, courseId: Number(v) }))}>
              <SelectTrigger><SelectValue placeholder="选择课程" /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.courseName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field"><Label>开始时间</Label><DatePicker type="datetime-local" value={form.startTime ?? ''} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} /></div>
            <div className="admin-dialog-field"><Label>结束时间</Label><DatePicker type="datetime-local" value={form.endTime ?? ''} min={form.startTime || undefined} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field"><Label>地点</Label><Input value={form.location ?? ''} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} /></div>
            <div className="admin-dialog-field"><Label>容量</Label><Input type="number" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: Number(e.target.value) || 0 }))} /></div>
          </div>
          <div className="admin-dialog-field"><Label>备注</Label><Input value={form.remark ?? ''} onChange={(e) => setForm((p) => ({ ...p, remark: e.target.value }))} /></div>
        </>
      </BaseDialog>

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除班次"
        message={`确认删除班次「${pendingDelete?.sessionNo || `#${pendingDelete?.id}`}」？删除后不可恢复。`}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </>
  );
};

export default HrTrainingSessionPage;
