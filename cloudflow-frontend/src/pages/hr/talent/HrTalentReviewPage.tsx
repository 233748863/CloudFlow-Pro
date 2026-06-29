import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { ClipboardList, DatabaseZap, LoaderCircle, Pencil, Plus, RefreshCcw, RotateCcw, Search, Send, Target } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
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
import {
  HrTalentReview,
  HrTalentReviewPayload,
  createTalentReview,
  listTalentReviews,
  publishTalentReview,
  snapshotPerformance,
  updateTalentReview,
} from '@/services/api/hr';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';
import { formatDateTimeValue, normalizeRows, toDateInputValue } from '../hrShared';

const defaultForm: HrTalentReviewPayload = {
  reviewNo: '',
  reviewName: '',
  reviewYear: new Date().getFullYear(),
  cycleType: 'ANNUAL',
  scopeType: 'GLOBAL',
  status: 'DRAFT',
};

export const HrTalentReviewPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:talent:review:edit') ?? true;
  const canAdd = hasPermission?.('hr:talent:review:add') ?? true;

  const { getOptions: getStatusOptions } = useDict('hr_talent_review_status');
  const { getOptions: getCycleOptions } = useDict('hr_talent_cycle');
  const { getOptions: getScopeOptions } = useDict('hr_talent_scope_type');

  const [rows, setRows] = useState<HrTalentReview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ keyword: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrTalentReviewPayload>(defaultForm);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotReview, setSnapshotReview] = useState<HrTalentReview | null>(null);
  const [objectiveId, setObjectiveId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.keyword) params.keyword = query.keyword;
      if (query.status) params.status = query.status;
      const res = await listTalentReviews(params);
      setRows(normalizeRows<HrTalentReview>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '盘点活动加载失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.reviewName?.trim()) {
      toast.error('请填写盘点名称');
      return;
    }
    try {
      if (editingId) {
        await updateTalentReview(editingId, form);
      } else {
        await createTalentReview(form);
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

  const handleSnapshot = async () => {
    if (!snapshotReview || !objectiveId.trim()) {
      toast.error('请填写目标计划 ID');
      return;
    }
    try {
      const res = await snapshotPerformance(snapshotReview.id, Number(objectiveId));
      toast.success(`快照完成，新增参与人 ${res} 名`);
      setSnapshotOpen(false);
      setObjectiveId('');
      setSnapshotReview(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '拉取快照失败'));
    }
  };

  const handlePublish = async (row: HrTalentReview) => {
    try {
      await publishTalentReview(row.id);
      toast.success('已发起发布审批');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '发起失败'));
    }
  };

  const hasFilters = Boolean(query.keyword || query.status);
  const draftCount = rows.filter((row) => row.status === 'DRAFT').length;
  const publishableCount = rows.filter((row) => row.status === 'IN_PROGRESS' || row.status === 'CALIBRATING').length;

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
                  <p className="admin-source-kicker">TALENT REVIEW</p>
                  <h2>人才盘点</h2>
                  <span>维护人才盘点活动、业绩快照和发布审批状态</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    <RefreshCcw className={loading ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} />刷新
                  </Button>
                  {canAdd ? (
                    <Button size="sm" onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
                      <Plus className="mr-1.5 h-4 w-4" />新建盘点
                    </Button>
                  ) : null}
                </div>
              </header>
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <div className="admin-source-stat-icon"><ClipboardList size={18} /></div>
                  <div><p>盘点总数</p><strong>{total}</strong><span>当前筛选结果</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <div className="admin-source-stat-icon"><DatabaseZap size={18} /></div>
                  <div><p>可拉快照</p><strong>{draftCount}</strong><span>草稿活动</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <div className="admin-source-stat-icon"><Target size={18} /></div>
                  <div><p>可发布</p><strong>{publishableCount}</strong><span>进行中或校准中</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <div className="admin-users-filter-grid">
                <label>
                  <span className="input-label">盘点活动</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      className="h-[42px]"
                      type="search"
                      value={query.keyword}
                      onChange={(event) => setQuery((q) => ({ ...q, keyword: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') setQuery((q) => ({ ...q, pageNum: 1 }));
                      }}
                      placeholder="搜索盘点编号/名称"
                    />
                  </div>
                </label>
                <label>
                  <span className="input-label">状态</span>
                  <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="全部状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">全部状态</SelectItem>
                      {getStatusOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <div className="admin-users-toolbar-actions">
                {hasFilters ? (
                  <Button variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, keyword: '', status: '' }))}>
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
                <table className="unity-data-table admin-source-table min-w-[1040px]">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>名称</th>
                      <th>年度</th>
                      <th>周期</th>
                      <th>范围</th>
                      <th>状态</th>
                      <th>发布时间</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="admin-settings-empty">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="admin-settings-empty">暂无盘点活动</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          <td className="font-mono text-xs">{row.reviewNo}</td>
                          <td><strong>{row.reviewName}</strong></td>
                          <td>{row.reviewYear}</td>
                          <td><DictLabel dictType="hr_talent_cycle" value={String(row.cycleType ?? '')} fallback="-" /></td>
                          <td><DictLabel dictType="hr_talent_scope_type" value={String(row.scopeType ?? '')} fallback="-" /></td>
                          <td><DictLabel dictType="hr_talent_review_status" value={String(row.status ?? '')} fallback="-" /></td>
                          <td>{formatDateTimeValue(row.publishTime) || '-'}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              {canEdit ? (
                                <button type="button" title="编辑" onClick={() => { setEditingId(row.id); setForm({ ...row, deadline: toDateInputValue(row.deadline) }); setOpen(true); }}>
                                  <Pencil size={15} />
                                </button>
                              ) : null}
                              {canEdit && (row.status === 'DRAFT' || row.status === 'IN_PROGRESS') ? (
                                <button type="button" title="拉取业绩" onClick={() => { setSnapshotReview(row); setSnapshotOpen(true); }}>
                                  <DatabaseZap size={15} />
                                </button>
                              ) : null}
                              {canEdit && (row.status === 'IN_PROGRESS' || row.status === 'CALIBRATING') ? (
                                <button type="button" title="发起发布" onClick={() => void handlePublish(row)}>
                                  <Send size={15} />
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
        title={editingId ? '编辑盘点活动' : '新建盘点活动'}
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
          <div className="admin-dialog-field"><Label>编号</Label><Input value={form.reviewNo ?? ''} onChange={(e) => setForm((p) => ({ ...p, reviewNo: e.target.value }))} placeholder="留空自动生成" /></div>
          <div className="admin-dialog-field"><Label>名称</Label><Input value={form.reviewName} onChange={(e) => setForm((p) => ({ ...p, reviewName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field"><Label>年度</Label><Input type="number" value={form.reviewYear} onChange={(e) => setForm((p) => ({ ...p, reviewYear: Number(e.target.value) }))} /></div>
            <div className="admin-dialog-field">
              <Label>周期</Label>
              <Select value={form.cycleType} onValueChange={(v) => setForm((p) => ({ ...p, cycleType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getCycleOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>范围类型</Label>
              <Select value={form.scopeType} onValueChange={(v) => setForm((p) => ({ ...p, scopeType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getScopeOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field"><Label>范围值</Label><Input value={form.scopeValue ?? ''} onChange={(e) => setForm((p) => ({ ...p, scopeValue: e.target.value }))} placeholder="部门ID/岗位ID/留空全员" /></div>
          </div>
          <div className="admin-dialog-field"><Label>截止日期</Label><DatePicker type="date" value={form.deadline ?? ''} onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))} /></div>
          <div className="admin-dialog-field"><Label>说明</Label><Input value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
        </>
      </BaseDialog>

      <BaseDialog
        open={snapshotOpen}
        title={`拉取业绩快照 · ${snapshotReview?.reviewName ?? ''}`}
        onClose={() => setSnapshotOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSnapshotOpen(false)}>取消</Button>
            <Button onClick={() => void handleSnapshot()}>拉取</Button>
          </div>
        }
      >
        <>
          <div className="text-sm text-slate-500">
            拉取的目标计划必须状态为 PUBLISHED。员工将按业绩分自动落入九宫格（潜力默认为中）。
          </div>
          <div className="admin-dialog-field"><Label>目标计划 ID</Label><Input value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)} placeholder="hr_performance_objective.id" /></div>
        </>
      </BaseDialog>
    </>
  );
};

export default HrTalentReviewPage;
