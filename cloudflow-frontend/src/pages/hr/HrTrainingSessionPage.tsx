import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { LoaderCircle, Plus, RefreshCcw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
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
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
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
import { normalizeRows, formatDateTimeValue, enumLabel } from './hrShared';

const sessionStatusLabel: Record<string, string> = {
  PLANNED: '计划中',
  REGISTERING: '报名中',
  ONGOING: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

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

  const [rows, setRows] = useState<HrTrainingSession[]>([]);
  const [courses, setCourses] = useState<HrTrainingCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ courseId: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrTrainingSessionPayload>(defaultForm);
  const [pendingDelete, setPendingDelete] = useState<HrTrainingSession | null>(null);

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

  const filters = (
    <FilterBar
      filters={[
        <div key="course" className="w-full sm:w-52">
          <Select value={query.courseId || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, courseId: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部课程" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部课程</SelectItem>
              {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.courseName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
        <div key="status" className="w-full sm:w-40">
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {Object.entries(sessionStatusLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${total} 条` }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, courseId: '', status: '' }))}>
                <RotateCcw className="mr-1.5 h-4 w-4" />清空条件
              </Button>,
            ]
          : []),
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        ...(canAdd
          ? [
              <Button key="add" size="sm" onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
                <Plus className="mr-1.5 h-4 w-4" />新建班次
              </Button>,
            ]
          : []),
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>班次号</TableHead>
              <TableHead>课程</TableHead>
              <TableHead>地点</TableHead>
              <TableHead>开始</TableHead>
              <TableHead>结束</TableHead>
              <TableHead>容量</TableHead>
              <TableHead>已报名</TableHead>
              <TableHead>状态</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-sm text-slate-400">暂无班次</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">{row.sessionNo || `#${row.id}`}</td>
                  <td className="px-4 py-3 text-sm">{courses.find((c) => c.id === row.courseId)?.courseName || `课程#${row.courseId}`}</td>
                  <td className="px-4 py-3 text-sm">{row.location || '-'}</td>
                  <td className="px-4 py-3 text-sm">{formatDateTimeValue(row.startTime)}</td>
                  <td className="px-4 py-3 text-sm">{formatDateTimeValue(row.endTime)}</td>
                  <td className="px-4 py-3 text-sm">{row.capacity}</td>
                  <td className="px-4 py-3 text-sm">{row.enrolledCount ?? 0}</td>
                  <td className="px-4 py-3 text-sm">{enumLabel(sessionStatusLabel, row.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'edit', label: '编辑', semantic: 'edit', permissionKey: 'hr:training:session:edit', onClick: () => { setEditingId(row.id); setForm(row); setOpen(true); } },
                        { key: 'register', label: '开放报名', semantic: 'enable', permissionKey: 'hr:training:session:edit', onClick: () => void handleAction(row, 'register'), hidden: row.status !== 'PLANNED' },
                        { key: 'start', label: '开始', semantic: 'process', permissionKey: 'hr:training:session:edit', onClick: () => void handleAction(row, 'start'), hidden: row.status !== 'REGISTERING' },
                        { key: 'complete', label: '完成', semantic: 'confirm', permissionKey: 'hr:training:session:edit', onClick: () => void handleAction(row, 'complete'), hidden: row.status !== 'ONGOING' },
                        { key: 'cancel', label: '取消', semantic: 'void', permissionKey: 'hr:training:session:edit', onClick: () => void handleAction(row, 'cancel'), hidden: row.status === 'COMPLETED' || row.status === 'CANCELLED' },
                        { key: 'delete', label: '删除', semantic: 'delete', permissionKey: 'hr:training:session:remove', onClick: () => setPendingDelete(row) },
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </TableSurfaceCard>
  );

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
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} pagination={pagination} />

      <BaseDialog
        open={open}
        title={editingId ? '编辑班次' : '新建班次'}
        onClose={() => setOpen(false)}
        width="wide"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>课程</Label>
            <Select value={form.courseId ? String(form.courseId) : ''} onValueChange={(v) => setForm((p) => ({ ...p, courseId: Number(v) }))}>
              <SelectTrigger><SelectValue placeholder="选择课程" /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.courseName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>开始时间</Label><Input type="datetime-local" value={form.startTime?.slice(0, 16) ?? ''} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} /></div>
            <div><Label>结束时间</Label><Input type="datetime-local" value={form.endTime?.slice(0, 16) ?? ''} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>地点</Label><Input value={form.location ?? ''} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} /></div>
            <div><Label>容量</Label><Input type="number" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: Number(e.target.value) || 0 }))} /></div>
          </div>
          <div><Label>备注</Label><Input value={form.remark ?? ''} onChange={(e) => setForm((p) => ({ ...p, remark: e.target.value }))} /></div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除班次"
        message={`确认删除班次「${pendingDelete?.sessionNo || `#${pendingDelete?.id}`}」？删除后不可恢复。`}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default HrTrainingSessionPage;
