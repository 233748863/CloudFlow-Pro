import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { LoaderCircle, Plus, RefreshCcw, RotateCcw } from 'lucide-react';
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
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTalentDevelopmentAction,
  completeDevelopmentAction,
  createDevelopmentAction,
  deleteDevelopmentAction,
  listDevelopmentActions,
  updateDevelopmentAction,
} from '@/services/api/hr';
import { useAuth } from '@/context/AuthContext';
import { formatDateValue, normalizeRows, toDateInputValue } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';

const defaultForm = { employeeId: '', actionType: 'TRAINING', actionName: '', mentorId: '', trainingSessionId: '', startDate: '', endDate: '', description: '' };

export const HrTalentDevelopmentPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:talent:development:edit') ?? true;
  const canAdd = hasPermission?.('hr:talent:development:add') ?? true;

  const [rows, setRows] = useState<HrTalentDevelopmentAction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ employeeId: '', actionType: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [completeAction, setCompleteAction] = useState<HrTalentDevelopmentAction | null>(null);
  const [completeForm, setCompleteForm] = useState({ evaluationScore: '', evaluationNotes: '' });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const actionTypeOptions = useDict('hr_talent_action_type').getOptions();
  const statusOptions = useDict('hr_talent_action_status').getOptions();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.employeeId) params.employeeId = query.employeeId;
      if (query.actionType) params.actionType = query.actionType;
      if (query.status) params.status = query.status;
      const res = await listDevelopmentActions(params);
      setRows(normalizeRows<HrTalentDevelopmentAction>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '培养行动加载失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.employeeId.trim() || !form.actionName.trim()) {
      toast.error('请填写员工 ID 与行动名称');
      return;
    }
    try {
      const payload = {
        employeeId: Number(form.employeeId),
        actionType: form.actionType,
        actionName: form.actionName,
        mentorId: form.mentorId ? Number(form.mentorId) : undefined,
        trainingSessionId: form.trainingSessionId ? Number(form.trainingSessionId) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        description: form.description,
        status: 'PLANNED',
      };
      if (editingId) {
        await updateDevelopmentAction(editingId, payload as never);
      } else {
        await createDevelopmentAction(payload as never);
      }
      toast.success('已保存');
      setOpen(false);
      setEditingId(null);
      setForm(defaultForm);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleComplete = async () => {
    if (!completeAction) return;
    try {
      await completeDevelopmentAction(completeAction.id, {
        evaluationScore: completeForm.evaluationScore || undefined,
        evaluationNotes: completeForm.evaluationNotes,
      });
      toast.success('已完成回填');
      setCompleteAction(null);
      setCompleteForm({ evaluationScore: '', evaluationNotes: '' });
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '回填失败'));
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await deleteDevelopmentAction(deleteId);
      toast.success('已删除');
      setDeleteId(null);
      if (rows.length === 1 && query.pageNum > 1) {
        setQuery((q) => ({ ...q, pageNum: q.pageNum - 1 }));
      } else {
        await load();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const hasFilters = Boolean(query.employeeId || query.actionType || query.status);

  const filters = (
    <FilterBar
      search={{
        value: query.employeeId,
        onChange: (value) => setQuery((q) => ({ ...q, employeeId: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '按员工 ID 搜索',
        widthClassName: 'w-full sm:w-[180px]',
      }}
      filters={[
        <div key="actionType" className="w-full sm:w-40">
          <Select value={query.actionType || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, actionType: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部类型</SelectItem>
              {actionTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
        <div key="status" className="w-full sm:w-36">
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${total} 条` }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, employeeId: '', actionType: '', status: '' }))}>
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
                <Plus className="mr-1.5 h-4 w-4" />新建培养行动
              </Button>,
            ]
          : []),
      ]}
    />
  );

  const table = (
    <TableSurfaceCard fill>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>员工</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>导师</TableHead>
              <TableHead>培训班次</TableHead>
              <TableHead>起止</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>评分</TableHead>
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
                <td colSpan={9} className="py-16 text-center text-sm text-slate-400">暂无培养行动</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm">{row.employeeId}</td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_talent_action_type" value={row.actionType} fallback="-" /></td>
                  <td className="px-4 py-3 text-sm font-medium">{row.actionName}</td>
                  <td className="px-4 py-3 text-sm">{row.mentorId ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.trainingSessionId ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{formatDateValue(row.startDate)} / {formatDateValue(row.endDate)}</td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_talent_action_status" value={row.status} fallback="-" /></td>
                  <td className="px-4 py-3 text-sm">{row.evaluationScore ?? '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'edit', label: '编辑', semantic: 'edit', permissionKey: 'hr:talent:development:edit', onClick: () => {
                          setEditingId(row.id);
                          setForm({
                            employeeId: String(row.employeeId),
                            actionType: row.actionType,
                            actionName: row.actionName,
                            mentorId: row.mentorId ? String(row.mentorId) : '',
                            trainingSessionId: row.trainingSessionId ? String(row.trainingSessionId) : '',
                            startDate: toDateInputValue(row.startDate),
                            endDate: toDateInputValue(row.endDate),
                            description: row.description ?? '',
                          });
                          setOpen(true);
                        } },
                        { key: 'complete', label: '完成回填', semantic: 'confirm', permissionKey: 'hr:talent:development:edit', onClick: () => { setCompleteAction(row); setCompleteForm({ evaluationScore: '', evaluationNotes: '' }); }, hidden: !(row.status === 'PLANNED' || row.status === 'ONGOING') },
                        { key: 'delete', label: '删除', semantic: 'delete', permissionKey: 'hr:talent:development:remove', onClick: () => setDeleteId(row.id) },
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
        title={editingId ? '编辑培养行动' : '新建培养行动'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>员工 ID</Label><Input value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))} /></div>
            <div>
              <Label>类型</Label>
              <Select value={form.actionType} onValueChange={(v) => setForm((p) => ({ ...p, actionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {actionTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>名称</Label><Input value={form.actionName} onChange={(e) => setForm((p) => ({ ...p, actionName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>导师 ID</Label><Input value={form.mentorId} onChange={(e) => setForm((p) => ({ ...p, mentorId: e.target.value }))} /></div>
            <div><Label>培训班次 ID</Label><Input value={form.trainingSessionId} onChange={(e) => setForm((p) => ({ ...p, trainingSessionId: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>开始日期</Label>
              <DatePicker
                className="h-10"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>结束日期</Label>
              <DatePicker
                className="h-10"
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
              />
            </div>
          </div>
          <div><Label>说明</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={!!completeAction}
        title={`完成回填 · ${completeAction?.actionName ?? ''}`}
        onClose={() => setCompleteAction(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCompleteAction(null)}>取消</Button>
            <Button onClick={() => void handleComplete()}>完成</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><Label>评估分</Label><Input type="number" step="0.1" value={completeForm.evaluationScore} onChange={(e) => setCompleteForm((p) => ({ ...p, evaluationScore: e.target.value }))} /></div>
          <div><Label>评估说明</Label><Textarea value={completeForm.evaluationNotes} onChange={(e) => setCompleteForm((p) => ({ ...p, evaluationNotes: e.target.value }))} rows={4} /></div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={deleteId !== null}
        title="删除培养行动"
        message="删除后不可恢复，确认删除该培养行动？"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
};

export default HrTalentDevelopmentPage;
