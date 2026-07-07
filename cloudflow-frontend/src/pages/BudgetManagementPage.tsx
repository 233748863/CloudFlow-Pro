import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, ClipboardList, Edit, Eye, Plus, RefreshCw, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { budgetApi, BudgetAdjustment, BudgetExecutionSummary, BudgetLedger, BudgetLine, BudgetPlan, BudgetSubject } from '@/services/api/budget';
import { projectApi, Project } from '@/services/api/project';
import { getDeptTree, getUserList, SysDept, SysUser } from '@/services/api/auth';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type BudgetDialog =
  | { type: 'plan'; item?: BudgetPlan | null }
  | { type: 'subject'; item?: BudgetSubject | null }
  | { type: 'adjustment'; item?: BudgetAdjustment | null }
  | { type: 'plan-detail'; item: BudgetPlan }
  | { type: 'adjustment-detail'; item: BudgetAdjustment }
  | null;

const fieldLabelClassName = 'text-xs font-medium text-slate-500 dark:text-slate-400';

const emptyPlanLine: BudgetLine = {
  subjectCode: '',
  subjectName: '',
  amount: 0,
  warningRatio: 0.8,
  alertRatio: 0.9,
  blockRatio: 1,
};

const emptyPlan: BudgetPlan = {
  budgetName: '',
  fiscalYear: new Date().getFullYear(),
  periodType: 'ANNUAL',
  targetType: 'DEPT',
  targetId: 0,
  targetName: '',
  deptName: '',
  projectName: '',
  ownerName: '',
  totalAmount: 0,
  status: 'DRAFT',
  remark: '',
  lines: [{ ...emptyPlanLine }],
};

const emptySubject: BudgetSubject = {
  subjectCode: '',
  subjectName: '',
  subjectType: 'EXPENSE',
  enabled: 1,
  sortOrder: 1,
  remark: '',
};

const emptyAdjustment: BudgetAdjustment = {
  budgetId: 0,
  changeAmount: 0,
  reason: '',
  adjustmentType: 'ADD',
  subjectCode: '',
  subjectName: '',
  status: 'DRAFT',
};

const formatMoney = (value?: number) =>
  `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPercent = (value?: number) =>
  `${Number((value || 0) * 100).toFixed(1)}%`;

const BudgetMetric: React.FC<{
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'blue' | 'green' | 'amber' | 'violet';
}> = ({ label, value, meta, icon, tone = 'blue' }) => (
  <article className={`card admin-source-stat admin-source-tone-${tone}`}>
    <div className="admin-source-stat-icon">{icon}</div>
    <div className="min-w-0">
      <p>{label}</p>
      <strong className="truncate">{value}</strong>
      {meta ? <span>{meta}</span> : null}
    </div>
  </article>
);

const BudgetSurface: React.FC<{
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, action, children, className = '', bodyClassName = '' }) => (
  <InnerTableSurface className={`admin-budget-surface ${className}`} wrapperClassName="admin-budget-surface-wrapper">
    <div className="admin-budget-surface-head">
      <div>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      {action ? <div className="admin-budget-surface-action">{action}</div> : null}
    </div>
    <div className={`admin-budget-surface-body ${bodyClassName}`}>{children}</div>
  </InnerTableSurface>
);

const BudgetPanel: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, children, className, bodyClassName }) => (
  <BudgetSurface title={title} className={className} bodyClassName={bodyClassName}>
    {children}
  </BudgetSurface>
);

const flattenDeptOptions = (items: SysDept[] = [], prefix = ''): Array<{ label: string; value: number }> =>
  items.flatMap((item) => {
    const label = prefix ? `${prefix} / ${item.deptName}` : item.deptName;
    const current = item.deptId ? [{ label, value: item.deptId }] : [];
    return [...current, ...flattenDeptOptions(item.children || [], label)];
  });

export default function BudgetManagementPage() {
  const { hasPermission } = useAuth();
  const targetTypeDict = useDict('oa_budget_target_type');
  const budgetStatusDict = useDict('oa_budget_status');
  const operationTypeDict = useDict('oa_budget_operation_type');
  const [plans, setPlans] = useState<BudgetPlan[]>([]);
  const [subjects, setSubjects] = useState<BudgetSubject[]>([]);
  const [adjustments, setAdjustments] = useState<BudgetAdjustment[]>([]);
  const [dialog, setDialog] = useState<BudgetDialog>(null);
  const [confirm, setConfirm] = useState<{ type: 'plan-submit' | 'adjustment-submit'; item: BudgetPlan | BudgetAdjustment } | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');

  const [planForm, setPlanForm] = useState<BudgetPlan>(emptyPlan);
  const [subjectForm, setSubjectForm] = useState<BudgetSubject>(emptySubject);
  const [adjustmentForm, setAdjustmentForm] = useState<BudgetAdjustment>(emptyAdjustment);

  const [projects, setProjects] = useState<Project[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [userOptions, setUserOptions] = useState<Array<{ label: string; value: number }>>([]);

  const [planDetail, setPlanDetail] = useState<BudgetPlan | null>(null);
  const [planSummary, setPlanSummary] = useState<BudgetExecutionSummary | null>(null);
  const [planLedger, setPlanLedger] = useState<BudgetLedger[]>([]);

  const subjectOptions = useMemo(
    () => subjects.map((item) => ({ label: `${item.subjectCode} / ${item.subjectName}`, value: item.subjectCode })),
    [subjects],
  );

  const planOptions = useMemo(
    () => plans.map((item) => ({ label: `${item.budgetNo || '-'} / ${item.budgetName}`, value: item.budgetId || 0 })),
    [plans],
  );

  const load = async () => {
    try {
      const [planResult, subjectResult, adjustmentResult] = await Promise.all([
        budgetApi.listPlans({ pageNum: 1, pageSize: 50, budgetName: keyword || undefined }),
        budgetApi.listSubjects({ pageNum: 1, pageSize: 100 }),
        budgetApi.listAdjustments({ pageNum: 1, pageSize: 50 }),
      ]);
      setPlans(planResult.rows || []);
      setSubjects(subjectResult.rows || []);
      setAdjustments(adjustmentResult.rows || []);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载预算数据失败'));
    }
  };

  const loadReferenceData = async () => {
    try {
      const [projectResult, deptTreeResult, userResult] = await Promise.all([
        projectApi.list({ pageNum: 1, pageSize: 200 }),
        getDeptTree() as Promise<SysDept[]>,
        getUserList({ pageNum: 1, pageSize: 200 }) as Promise<{ rows?: SysUser[] }>,
      ]);
      setProjects(projectResult.rows || []);
      setDeptOptions(flattenDeptOptions(deptTreeResult || []));
      setUserOptions((userResult.rows || []).map((item) => ({
        label: `${item.nickName || item.userName} / ${item.userName}`,
        value: item.userId || 0,
      })).filter((item) => item.value));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载预算候选数据失败'));
    }
  };

  useEffect(() => {
    void load();
  }, [keyword]);

  useEffect(() => {
    void loadReferenceData();
  }, []);

  const openDialog = async (next: BudgetDialog) => {
    setDialog(next);
    if (!next) {
      setPlanForm({ ...emptyPlan, lines: [{ ...emptyPlanLine }] });
      setSubjectForm(emptySubject);
      setAdjustmentForm(emptyAdjustment);
      setPlanDetail(null);
      setPlanSummary(null);
      setPlanLedger([]);
      return;
    }
    if (next.type === 'plan') {
      if (next.item?.budgetId) {
        try {
          const detail = await budgetApi.getPlanDetail(next.item.budgetId);
          setPlanForm({ ...detail, lines: detail.lines?.length ? detail.lines : [{ ...emptyPlanLine }] });
        } catch (error) {
          toast.error(getErrorMessage(error, '加载预算详情失败'));
          return;
        }
      } else {
        setPlanForm({ ...emptyPlan, lines: [{ ...emptyPlanLine }] });
      }
    }
    if (next.type === 'subject') {
      setSubjectForm(next.item || emptySubject);
    }
    if (next.type === 'adjustment') {
      setAdjustmentForm(next.item || emptyAdjustment);
    }
    if (next.type === 'plan-detail') {
      try {
        const [detail, summary, ledger] = await Promise.all([
          budgetApi.getPlanDetail(next.item.budgetId!),
          budgetApi.getExecutionSummary(next.item.budgetId!),
          budgetApi.listLedger({ pageNum: 1, pageSize: 100, budgetId: next.item.budgetId }),
        ]);
        setPlanDetail(detail);
        setPlanSummary(summary);
        setPlanLedger(ledger.rows || []);
      } catch (error) {
        toast.error(getErrorMessage(error, '加载预算详情失败'));
      }
    }
  };

  const syncPlanTargetContext = (targetType: string, targetId: number) => {
    if (targetType === 'PROJECT') {
      const matched = projects.find((item) => item.projectId === targetId);
      setPlanForm((prev) => ({
        ...prev,
        targetType,
        targetId,
        targetName: matched?.projectName || prev.targetName,
        projectId: matched?.projectId,
        projectName: matched?.projectName,
        deptId: matched?.deptId,
        deptName: matched?.deptName,
        customerId: matched?.customerId,
        customerName: matched?.customerName,
      }));
      return;
    }
    const dept = deptOptions.find((item) => item.value === targetId);
    setPlanForm((prev) => ({
      ...prev,
      targetType,
      targetId,
      targetName: dept?.label || prev.targetName,
      deptId: targetId,
      deptName: dept?.label || prev.deptName,
      projectId: undefined,
      projectName: '',
    }));
  };

  const saveDialog = async () => {
    if (!dialog) return;
    setSaving(true);
    try {
      if (dialog.type === 'plan') {
        if (planForm.budgetId) {
          await budgetApi.editPlan(planForm);
        } else {
          await budgetApi.addPlan(planForm);
        }
      }
      if (dialog.type === 'subject') {
        if (subjectForm.subjectId) {
          await budgetApi.editSubject(subjectForm);
        } else {
          await budgetApi.addSubject(subjectForm);
        }
      }
      if (dialog.type === 'adjustment') {
        await budgetApi.addAdjustment(adjustmentForm);
      }
      toast.success('保存成功');
      await openDialog(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const thresholdBadge = (status?: string) => (
    <DictBadge dictType="oa_budget_threshold" value={String(status || 'NORMAL')} />
  );
  const totalBudgetAmount = plans.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const pendingAdjustments = adjustments.filter((item) => item.status === 'DRAFT' || item.status === 'REJECTED').length;
  const metrics = [
    { label: '预算主表', value: String(plans.length), meta: formatMoney(totalBudgetAmount), icon: <Banknote size={18} />, tone: 'blue' },
    { label: '预算科目', value: String(subjects.length), meta: '校验口径', icon: <ClipboardList size={18} />, tone: 'green' },
    { label: '预算调整', value: String(adjustments.length), meta: `待提交 ${pendingAdjustments}`, icon: <AlertTriangle size={18} />, tone: 'amber' },
    { label: '已执行额', value: formatMoney(plans.reduce((sum, item) => sum + Number(item.actualAmount || 0), 0)), meta: '实际核销', icon: <Send size={18} />, tone: 'violet' },
  ];

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">BUDGET CONTROL</p>
          <h2>预算管理</h2>
          <span>统一维护预算主表、预算科目、执行台账和调整提审</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw size={16} />
            刷新
          </Button>
          <Button size="sm" variant="outline" onClick={() => void openDialog({ type: 'subject' })} disabled={!hasPermission('oa:budget:subject')}>
            <Plus size={16} />新增科目
          </Button>
          <Button size="sm" variant="outline" onClick={() => void openDialog({ type: 'adjustment' })} disabled={!hasPermission('oa:budget:adjustment')}>
            <Plus size={16} />新增调整
          </Button>
          <Button size="sm" onClick={() => void openDialog({ type: 'plan' })} disabled={!hasPermission('oa:budget:add')}>
            <Plus size={16} />新增预算
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
            <div className="admin-source-stat-icon">{metric.icon}</div>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-finance-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">预算名称</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input className="h-[42px]" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索预算名称" type="search" />
          </div>
        </label>
        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">{keyword ? `预算名称：${keyword}` : '全部预算'}</span>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <div className="admin-budget-board grid h-full min-h-0 gap-4 xl:grid-cols-3">
      <BudgetSurface title="预算主表" description="预算提审后进入执行" className="admin-budget-table-panel" bodyClassName="admin-budget-table-body">
          <table className="unity-data-table admin-source-table finance-source-table admin-budget-table">
            <thead><tr><th>预算</th><th>执行</th><th className="text-right">操作</th></tr></thead>
            <tbody>
              {plans.map((item) => (
                <tr key={item.budgetId}>
                  <td>
                    <strong>{item.budgetName}</strong>
                    <div className="text-xs text-slate-500">{item.budgetNo || '-'} / {targetTypeDict.getLabel(item.targetType || 'DEPT') || '-'}</div>
                    <div className="mt-1 text-xs text-slate-400">{budgetStatusDict.getLabel(item.status || 'DRAFT') || '-'}</div>
                  </td>
                  <td>
                    <div>{formatMoney(item.totalAmount)}</div>
                    <div className="text-xs text-slate-500">占用 {formatMoney(item.reservedAmount)} / 实际 {formatMoney(item.actualAmount)}</div>
                    <div className="mt-1 text-xs text-slate-400">可用 {formatMoney(item.availableAmount)}</div>
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" title="详情" aria-label="详情" onClick={() => void openDialog({ type: 'plan-detail', item })}><Eye size={15} /></button>
                      {(item.status === 'DRAFT' || item.status === 'REJECTED') && hasPermission('oa:budget:edit') ? <button type="button" title="编辑" aria-label="编辑" onClick={() => void openDialog({ type: 'plan', item })}><Edit size={15} /></button> : null}
                      {(item.status === 'DRAFT' || item.status === 'REJECTED') && hasPermission('oa:budget:submit') ? <button type="button" title="提交" aria-label="提交" onClick={() => setConfirm({ type: 'plan-submit', item })}><Send size={15} /></button> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!plans.length ? <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-500">暂无预算主表</td></tr> : null}
            </tbody>
          </table>
      </BudgetSurface>

      <BudgetSurface title="预算科目" description="报销、采购、付款共用校验口径" className="admin-budget-table-panel" bodyClassName="admin-budget-table-body">
          <table className="unity-data-table admin-source-table finance-source-table admin-budget-table">
            <thead><tr><th>科目</th><th>状态</th><th className="text-right">操作</th></tr></thead>
            <tbody>
              {subjects.map((item) => (
                <tr key={item.subjectId}>
                  <td>
                    <strong>{item.subjectName}</strong>
                    <div className="text-xs text-slate-500">{item.subjectCode}</div>
                  </td>
                  <td>
                    <div>{item.subjectType || '-'}</div>
                    <div className="text-xs text-slate-500">{item.enabled === 1 ? '启用' : '停用'}</div>
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      {hasPermission('oa:budget:subject') ? <button type="button" title="编辑" aria-label="编辑" onClick={() => void openDialog({ type: 'subject', item })}><Edit size={15} /></button> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!subjects.length ? <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-500">暂无预算科目</td></tr> : null}
            </tbody>
          </table>
      </BudgetSurface>

      <BudgetSurface title="预算调整" description="调整单提审后改变预算额度" className="admin-budget-table-panel" bodyClassName="admin-budget-table-body">
          <table className="unity-data-table admin-source-table finance-source-table admin-budget-table">
            <thead><tr><th>调整</th><th>金额</th><th className="text-right">操作</th></tr></thead>
            <tbody>
              {adjustments.map((item) => (
                <tr key={item.adjustmentId}>
                  <td>
                    <strong>{item.adjustmentNo}</strong>
                    <div className="text-xs text-slate-500">{item.subjectName || item.subjectCode || '-'}</div>
                    <div className="mt-1 text-xs text-slate-400">{budgetStatusDict.getLabel(item.status || 'DRAFT') || '-'}</div>
                  </td>
                  <td>{formatMoney(item.changeAmount)}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" title="详情" aria-label="详情" onClick={() => void openDialog({ type: 'adjustment-detail', item })}><Eye size={15} /></button>
                      {(item.status === 'DRAFT' || item.status === 'REJECTED') && hasPermission('oa:budget:adjustment') ? <button type="button" title="提交" aria-label="提交" onClick={() => setConfirm({ type: 'adjustment-submit', item })}><Send size={15} /></button> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!adjustments.length ? <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-500">暂无预算调整</td></tr> : null}
            </tbody>
          </table>
      </BudgetSurface>
    </div>
  );

  return (
    <>
      <section className="admin-source-page finance-source-page budget-management-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
        />
      </section>

      <BaseDialog
        open={dialog?.type === 'plan-detail'}
        title={planDetail?.budgetName || '预算详情'}
        onClose={() => void openDialog(null)}
        width="extra-wide"
      >
        {planDetail && planSummary ? (
          <div className="admin-dialog-stack">
            <div className="admin-source-stat-grid">
              <BudgetMetric label="预算总额" value={formatMoney(planSummary.totalAmount)} meta="预算详情" icon={<Banknote size={18} />} tone="blue" />
              <BudgetMetric label="预算占用" value={formatMoney(planSummary.reservedAmount)} meta="已锁定" icon={<ClipboardList size={18} />} tone="amber" />
              <BudgetMetric label="实际执行" value={formatMoney(planSummary.actualAmount)} meta="已核销" icon={<Send size={18} />} tone="green" />
              <BudgetMetric label="阈值状态" value={thresholdBadge(planSummary.thresholdStatus)} meta={`执行率 ${formatPercent(planSummary.executionRatio)}`} icon={<AlertTriangle size={18} />} tone="violet" />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <BudgetPanel title="预算主表">
                <div className="admin-budget-detail-list">
                  <div><span>预算编号</span><strong>{planDetail.budgetNo || '-'}</strong></div>
                  <div><span>目标对象</span><strong>{targetTypeDict.getLabel(planDetail.targetType || 'DEPT') || '-'} / {planDetail.targetName || planDetail.projectName || planDetail.deptName || '-'}</strong></div>
                  <div><span>负责人</span><strong>{planDetail.ownerName || '-'}</strong></div>
                  <div><span>可用余额</span><strong>{formatMoney(planSummary.availableAmount)}</strong></div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  阈值 = 预警 {formatPercent(planSummary.warningThreshold)} / 告警 {formatPercent(planSummary.alertThreshold)} / 拦截 {formatPercent(planSummary.blockThreshold)}
                </div>
              </BudgetPanel>

              <BudgetPanel title="预算科目明细">
                  <div className="admin-dialog-stack">
                  {(planDetail.lines || []).map((line, index) => (
                    <div key={`${line.lineId || line.subjectCode || 'line'}-${index}`} className="admin-budget-line-row">
                      <div>{line.subjectCode || '-'} / {line.subjectName || '-'}</div>
                      <div className="text-xs text-slate-500">预算 {formatMoney(line.amount)} / 占用 {formatMoney(line.reservedAmount)} / 实际 {formatMoney(line.actualAmount)} / 可用 {formatMoney(line.availableAmount)}</div>
                    </div>
                  ))}
                </div>
              </BudgetPanel>
            </div>

            <BudgetSurface title="执行台账" className="admin-budget-ledger-surface" bodyClassName="admin-budget-table-body">
                <table className="unity-data-table admin-source-table min-w-[860px]">
                  <thead>
                    <tr>
                      <th>业务</th>
                      <th>科目</th>
                      <th>操作</th>
                      <th>金额</th>
                      <th>可用余额</th>
                      <th>备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planLedger.length ? planLedger.map((item) => (
                      <tr key={item.ledgerId}>
                        <td>
                          <div>{item.businessType || '-'}</div>
                          <div className="text-xs text-slate-500">{item.businessNo || item.businessId || '-'}</div>
                        </td>
                        <td>{item.subjectName || item.subjectCode || '-'}</td>
                        <td>{operationTypeDict.getLabel(item.operationType || '') || '-'}</td>
                        <td>{formatMoney(item.amount)}</td>
                        <td>{formatMoney(item.availableAfter)}</td>
                        <td>{item.remark || '-'}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">暂无执行台账，当前预算还没有被业务单据占用或核销。</td></tr>
                    )}
                  </tbody>
                </table>
            </BudgetSurface>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={dialog?.type === 'plan'}
        title={planForm.budgetId ? '编辑预算主表' : '新增预算主表'}
        onClose={() => void openDialog(null)}
        width="extra-wide"
        footer={<><Button variant="outline" onClick={() => void openDialog(null)}>取消</Button><Button onClick={() => void saveDialog()} disabled={saving}>{saving ? '保存中...' : '保存'}</Button></>}
      >
        <div className="admin-dialog-stack">
          <div className="admin-budget-note">
            预算主表 = 预算名称 + 目标对象 + 负责人 + 至少 1 条预算科目明细。提审通过后，报销 / 采购 / 付款会真实占用和核销这张预算。
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label className={fieldLabelClassName}>预算名称 <span className="text-red-500">*</span></Label>
              <Input value={planForm.budgetName || ''} onChange={(e) => setPlanForm((prev) => ({ ...prev, budgetName: e.target.value }))} placeholder="例如：交付部 2026 年项目预算" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>年度 <span className="text-red-500">*</span></Label>
              <Input type="number" min={2024} value={String(planForm.fiscalYear || new Date().getFullYear())} onChange={(e) => setPlanForm((prev) => ({ ...prev, fiscalYear: Number(e.target.value || new Date().getFullYear()) }))} placeholder="例如：2026" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>负责人</Label>
              <Select value={planForm.ownerId ? String(planForm.ownerId) : 'NONE'} onValueChange={(value) => {
                const matched = userOptions.find((item) => String(item.value) === value);
                setPlanForm((prev) => ({ ...prev, ownerId: value === 'NONE' ? undefined : Number(value), ownerName: matched?.label.split(' / ')[0] || prev.ownerName }));
              }}>
                <SelectTrigger><SelectValue placeholder="选择负责人" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">暂不指定</SelectItem>
                  {userOptions.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={fieldLabelClassName}>目标类型 <span className="text-red-500">*</span></Label>
              <Select value={planForm.targetType || 'DEPT'} onValueChange={(value) => syncPlanTargetContext(value, 0)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {targetTypeDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={fieldLabelClassName}>目标对象 <span className="text-red-500">*</span></Label>
              {planForm.targetType === 'PROJECT' ? (
                <Select value={planForm.targetId ? String(planForm.targetId) : 'NONE'} onValueChange={(value) => syncPlanTargetContext('PROJECT', value === 'NONE' ? 0 : Number(value))}>
                  <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">选择项目</SelectItem>
                    {projects.map((item) => <SelectItem key={item.projectId} value={String(item.projectId)}>{item.projectName} / {item.customerName || '无客户'}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={planForm.targetId ? String(planForm.targetId) : 'NONE'} onValueChange={(value) => syncPlanTargetContext('DEPT', value === 'NONE' ? 0 : Number(value))}>
                  <SelectTrigger><SelectValue placeholder="选择部门" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">选择部门</SelectItem>
                    {deptOptions.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className={fieldLabelClassName}>预算总额（元）</Label>
              <Input type="number" min={0} step="1000" value={String(planForm.totalAmount || 0)} onChange={(e) => setPlanForm((prev) => ({ ...prev, totalAmount: Number(e.target.value || 0) }))} placeholder="例如：500000" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>部门名称</Label>
              <Input value={planForm.deptName || ''} onChange={(e) => setPlanForm((prev) => ({ ...prev, deptName: e.target.value }))} placeholder="自动回填，可补充修正" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>项目名称</Label>
              <Input value={planForm.projectName || ''} onChange={(e) => setPlanForm((prev) => ({ ...prev, projectName: e.target.value }))} placeholder="自动回填，可补充修正" />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <Label className={fieldLabelClassName}>备注</Label>
              <Textarea value={planForm.remark || ''} onChange={(e) => setPlanForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="例如：覆盖现场交付、差旅、供应商付款和续约保障。" />
            </div>
          </div>

          <BudgetSurface
            title="预算科目明细"
            action={(
              <Button size="sm" variant="outline" onClick={() => setPlanForm((prev) => ({ ...prev, lines: [...(prev.lines || []), { ...emptyPlanLine }] }))}>
                <Plus size={14} className="mr-1.5" />新增一行
              </Button>
            )}
            bodyClassName="admin-budget-line-editor"
          >
              {(planForm.lines || []).map((line, index) => (
                <div key={`${line.lineId || line.subjectCode || 'line'}-${index}`} className="admin-budget-line-row admin-budget-line-grid">
                  <Select value={line.subjectCode || 'NONE'} onValueChange={(value) => {
                    const matched = subjects.find((item) => item.subjectCode === value);
                    const next = [...(planForm.lines || [])];
                    next[index] = { ...next[index], subjectCode: value === 'NONE' ? '' : value, subjectName: matched?.subjectName || '' };
                    setPlanForm((prev) => ({ ...prev, lines: next }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="预算科目" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">选择预算科目</SelectItem>
                      {subjectOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={line.subjectName || ''} onChange={(e) => {
                    const next = [...(planForm.lines || [])];
                    next[index] = { ...next[index], subjectName: e.target.value };
                    setPlanForm((prev) => ({ ...prev, lines: next }));
                  }} placeholder="自动回填，可修正名称" />
                  <Input type="number" min={0} value={String(line.amount || 0)} onChange={(e) => {
                    const next = [...(planForm.lines || [])];
                    next[index] = { ...next[index], amount: Number(e.target.value || 0) };
                    setPlanForm((prev) => ({ ...prev, lines: next }));
                  }} placeholder="预算金额" />
                  <div className="admin-budget-threshold-cell">
                    阈值：{formatPercent(line.warningRatio)} / {formatPercent(line.alertRatio)} / {formatPercent(line.blockRatio)}
                  </div>
                  <Button variant="outline" onClick={() => setPlanForm((prev) => ({ ...prev, lines: (prev.lines || []).filter((_, lineIndex) => lineIndex !== index) || [{ ...emptyPlanLine }] }))} disabled={(planForm.lines || []).length === 1}>
                    删除
                  </Button>
                </div>
              ))}
          </BudgetSurface>
        </div>
      </BaseDialog>

      <BaseDialog
        open={dialog?.type === 'subject'}
        title={subjectForm.subjectId ? '编辑预算科目' : '新增预算科目'}
        onClose={() => void openDialog(null)}
        width="normal"
        footer={<><Button variant="outline" onClick={() => void openDialog(null)}>取消</Button><Button onClick={() => void saveDialog()} disabled={saving}>{saving ? '保存中...' : '保存'}</Button></>}
      >
        <div className="grid gap-4">
          <div>
            <Label className={fieldLabelClassName}>科目编码 <span className="text-red-500">*</span></Label>
            <Input value={subjectForm.subjectCode || ''} onChange={(e) => setSubjectForm((prev) => ({ ...prev, subjectCode: e.target.value }))} placeholder="例如：SUB-TRAVEL" />
          </div>
          <div>
            <Label className={fieldLabelClassName}>科目名称 <span className="text-red-500">*</span></Label>
            <Input value={subjectForm.subjectName || ''} onChange={(e) => setSubjectForm((prev) => ({ ...prev, subjectName: e.target.value }))} placeholder="例如：差旅费用" />
          </div>
          <div>
            <Label className={fieldLabelClassName}>科目类型</Label>
            <Input value={subjectForm.subjectType || ''} onChange={(e) => setSubjectForm((prev) => ({ ...prev, subjectType: e.target.value.toUpperCase() }))} placeholder="默认 EXPENSE" />
          </div>
          <div>
            <Label className={fieldLabelClassName}>备注</Label>
            <Textarea value={subjectForm.remark || ''} onChange={(e) => setSubjectForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="例如：项目和部门共用的差旅预算科目" />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={dialog?.type === 'adjustment'}
        title="新增预算调整"
        onClose={() => void openDialog(null)}
        width="normal"
        footer={<><Button variant="outline" onClick={() => void openDialog(null)}>取消</Button><Button onClick={() => void saveDialog()} disabled={saving}>{saving ? '保存中...' : '保存'}</Button></>}
      >
        <div className="admin-dialog-stack">
          <div className="admin-budget-note">
            预算调整 = 对已存在预算的某个科目做追加或压缩。调整单创建后还要提审，提审通过才会真正改变预算额度。
          </div>
          <div>
            <Label className={fieldLabelClassName}>预算主表 <span className="text-red-500">*</span></Label>
            <Select value={adjustmentForm.budgetId ? String(adjustmentForm.budgetId) : 'NONE'} onValueChange={(value) => {
              const budgetId = value === 'NONE' ? 0 : Number(value);
              const matched = plans.find((item) => item.budgetId === budgetId);
              setAdjustmentForm((prev) => ({
                ...prev,
                budgetId,
                budgetNo: matched?.budgetNo,
                subjectCode: matched?.lines?.[0]?.subjectCode || prev.subjectCode || '',
                subjectName: matched?.lines?.[0]?.subjectName || prev.subjectName || '',
              }));
            }}>
              <SelectTrigger><SelectValue placeholder="选择预算主表" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">选择预算主表</SelectItem>
                {planOptions.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={fieldLabelClassName}>预算科目</Label>
            <Select value={adjustmentForm.subjectCode || 'NONE'} onValueChange={(value) => {
              const matched = subjects.find((item) => item.subjectCode === value);
              setAdjustmentForm((prev) => ({ ...prev, subjectCode: value === 'NONE' ? '' : value, subjectName: matched?.subjectName || '' }));
            }}>
              <SelectTrigger><SelectValue placeholder="选择预算科目" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">选择预算科目</SelectItem>
                {subjectOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={fieldLabelClassName}>调整金额 <span className="text-red-500">*</span></Label>
            <Input type="number" value={String(adjustmentForm.changeAmount || 0)} onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, changeAmount: Number(e.target.value || 0) }))} placeholder="例如：20000 或 -10000" />
          </div>
          <div>
            <Label className={fieldLabelClassName}>调整原因 <span className="text-red-500">*</span></Label>
            <Textarea value={adjustmentForm.reason || ''} onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="例如：项目现场支持范围扩大，需要追加差旅与供应商付款额度。" />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={dialog?.type === 'adjustment-detail'}
        title="预算调整详情"
        onClose={() => void openDialog(null)}
        width="normal"
      >
        {dialog?.type === 'adjustment-detail' ? (
          <div className="admin-dialog-stack">
            <BudgetPanel title="调整单信息">
              <div className="admin-budget-detail-list">
                <div><span>调整单号</span><strong>{dialog.item.adjustmentNo || '-'}</strong></div>
                <div><span>预算 / 科目</span><strong>{dialog.item.budgetNo || dialog.item.budgetId || '-'} / {dialog.item.subjectName || dialog.item.subjectCode || '-'}</strong></div>
                <div><span>调整金额</span><strong>{formatMoney(dialog.item.changeAmount)}</strong></div>
                <div><span>调整原因</span><strong>{dialog.item.reason || '无'}</strong></div>
              </div>
            </BudgetPanel>
          </div>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.type === 'plan-submit' ? '提交预算主表' : '提交预算调整'}
        message={confirm?.type === 'plan-submit'
          ? `提交后预算 ${'budgetName' in (confirm?.item || {}) ? (confirm?.item as BudgetPlan).budgetName : ''} 将进入审批流程。`
          : `提交后调整单 ${'adjustmentNo' in (confirm?.item || {}) ? (confirm?.item as BudgetAdjustment).adjustmentNo : ''} 将进入审批流程。`}
        confirmText="提交"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            if (confirm.type === 'plan-submit') {
              await budgetApi.submitPlan((confirm.item as BudgetPlan).budgetId!);
              toast.success('预算已提审');
            } else {
              await budgetApi.submitAdjustment((confirm.item as BudgetAdjustment).adjustmentId!);
              toast.success('预算调整已提审');
            }
            setConfirm(null);
            await load();
          } catch (error) {
            toast.error(getErrorMessage(error, '提交失败'));
          }
        }}
      />
    </>
  );
}
