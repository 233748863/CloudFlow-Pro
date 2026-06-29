import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { CheckCircle2, ClipboardList, LoaderCircle, Pencil, Plus, RefreshCcw, RotateCcw, Search, Trash2, UserCheck } from 'lucide-react';
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
  Textarea,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTalentDevelopmentAction,
  completeDevelopmentAction,
  createDevelopmentAction,
  deleteDevelopmentAction,
  listDevelopmentActions,
  updateDevelopmentAction,
} from '@/services/api/hr';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { formatDateValue, normalizeRows, toDateInputValue } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';

const defaultForm = { employeeId: '', actionType: 'TRAINING', actionName: '', mentorId: '', trainingSessionId: '', startDate: '', endDate: '', description: '' };

export const HrTalentDevelopmentPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:talent:development:edit') ?? true;
  const canAdd = hasPermission?.('hr:talent:development:add') ?? true;
  const canRemove = hasPermission?.('hr:talent:development:remove') ?? true;

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
  const plannedCount = rows.filter((row) => row.status === 'PLANNED').length;
  const ongoingCount = rows.filter((row) => row.status === 'ONGOING').length;
  const completedCount = rows.filter((row) => row.status === 'COMPLETED').length;

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
                  <p className="admin-source-kicker">TALENT DEVELOPMENT</p>
                  <h2>人才培养行动</h2>
                  <span>维护培养行动、导师安排、培训关联和完成回填</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    <RefreshCcw className={loading ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} />刷新
                  </Button>
                  {canAdd ? (
                    <Button size="sm" onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
                      <Plus className="mr-1.5 h-4 w-4" />新建培养行动
                    </Button>
                  ) : null}
                </div>
              </header>
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <div className="admin-source-stat-icon"><ClipboardList size={18} /></div>
                  <div><p>行动总数</p><strong>{total}</strong><span>当前筛选结果</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <div className="admin-source-stat-icon"><UserCheck size={18} /></div>
                  <div><p>进行中</p><strong>{plannedCount + ongoingCount}</strong><span>计划或执行状态</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <div className="admin-source-stat-icon"><CheckCircle2 size={18} /></div>
                  <div><p>已完成</p><strong>{completedCount}</strong><span>已回填结果</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <div className="admin-users-filter-grid">
                <label>
                  <span className="input-label">员工 ID</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      className="h-[42px]"
                      type="search"
                      value={query.employeeId}
                      onChange={(event) => setQuery((q) => ({ ...q, employeeId: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') setQuery((q) => ({ ...q, pageNum: 1 }));
                      }}
                      placeholder="按员工 ID 搜索"
                    />
                  </div>
                </label>
                <label>
                  <span className="input-label">类型</span>
                  <Select value={query.actionType || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, actionType: v === '__all' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="全部类型" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">全部类型</SelectItem>
                      {actionTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  <span className="input-label">状态</span>
                  <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="全部状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">全部状态</SelectItem>
                      {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <div className="admin-users-toolbar-actions">
                {hasFilters ? (
                  <Button variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, employeeId: '', actionType: '', status: '' }))}>
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
                <table className="unity-data-table admin-source-table min-w-[1120px]">
                  <thead>
                    <tr>
                      <th>员工</th>
                      <th>类型</th>
                      <th>名称</th>
                      <th>导师</th>
                      <th>培训班次</th>
                      <th>起止</th>
                      <th>状态</th>
                      <th>评分</th>
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
                        <td colSpan={9} className="admin-settings-empty">暂无培养行动</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.employeeId}</td>
                          <td><DictLabel dictType="hr_talent_action_type" value={row.actionType} fallback="-" /></td>
                          <td><strong>{row.actionName}</strong></td>
                          <td>{row.mentorId ?? '-'}</td>
                          <td>{row.trainingSessionId ?? '-'}</td>
                          <td>{formatDateValue(row.startDate)} / {formatDateValue(row.endDate)}</td>
                          <td><DictLabel dictType="hr_talent_action_status" value={row.status} fallback="-" /></td>
                          <td>{row.evaluationScore ?? '-'}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              {canEdit ? (
                                <button type="button" title="编辑" onClick={() => {
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
                                }}>
                                  <Pencil size={15} />
                                </button>
                              ) : null}
                              {canEdit && (row.status === 'PLANNED' || row.status === 'ONGOING') ? (
                                <button type="button" title="完成回填" onClick={() => { setCompleteAction(row); setCompleteForm({ evaluationScore: '', evaluationNotes: '' }); }}>
                                  <CheckCircle2 size={15} />
                                </button>
                              ) : null}
                              {canRemove ? (
                                <button type="button" className="danger" title="删除" onClick={() => setDeleteId(row.id)}>
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
        title={editingId ? '编辑培养行动' : '新建培养行动'}
        onClose={() => setOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
          </div>
        }
      >
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field"><Label>员工 ID</Label><Input value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))} /></div>
            <div className="admin-dialog-field">
              <Label>类型</Label>
              <Select value={form.actionType} onValueChange={(v) => setForm((p) => ({ ...p, actionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {actionTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="admin-dialog-field"><Label>名称</Label><Input value={form.actionName} onChange={(e) => setForm((p) => ({ ...p, actionName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field"><Label>导师 ID</Label><Input value={form.mentorId} onChange={(e) => setForm((p) => ({ ...p, mentorId: e.target.value }))} /></div>
            <div className="admin-dialog-field"><Label>培训班次 ID</Label><Input value={form.trainingSessionId} onChange={(e) => setForm((p) => ({ ...p, trainingSessionId: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>开始日期</Label>
              <DatePicker
                className="h-10"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
              />
            </div>
            <div className="admin-dialog-field">
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
          <div className="admin-dialog-field"><Label>说明</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></div>
        </>
      </BaseDialog>

      <BaseDialog
        open={!!completeAction}
        title={`完成回填 · ${completeAction?.actionName ?? ''}`}
        onClose={() => setCompleteAction(null)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCompleteAction(null)}>取消</Button>
            <Button onClick={() => void handleComplete()}>完成</Button>
          </div>
        }
      >
        <>
          <div className="admin-dialog-field"><Label>评估分</Label><Input type="number" step="0.1" value={completeForm.evaluationScore} onChange={(e) => setCompleteForm((p) => ({ ...p, evaluationScore: e.target.value }))} /></div>
          <div className="admin-dialog-field"><Label>评估说明</Label><Textarea value={completeForm.evaluationNotes} onChange={(e) => setCompleteForm((p) => ({ ...p, evaluationNotes: e.target.value }))} rows={4} /></div>
        </>
      </BaseDialog>

      <ConfirmDialog
        open={deleteId !== null}
        title="删除培养行动"
        message="删除后不可恢复，确认删除该培养行动？"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
};

export default HrTalentDevelopmentPage;
