import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, ClipboardList, Edit, Eye, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { budgetApi, BudgetAdjustment, BudgetExecutionSummary, BudgetLedger, BudgetLine, BudgetPlan, BudgetSubject } from '@/services/api/budget';
import { projectApi, Project } from '@/services/api/project';
import { getDeptTree, getUserList, SysDept, SysUser } from '@/services/api/auth';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';

type BudgetDialog =
  | { type: 'plan'; item?: BudgetPlan | null }
  | { type: 'subject'; item?: BudgetSubject | null }
  | { type: 'adjustment'; item?: BudgetAdjustment | null }
  | { type: 'plan-detail'; item: BudgetPlan }
  | { type: 'adjustment-detail'; item: BudgetAdjustment }
  | null;

const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300';

const thresholdToneMap: Record<string, string> = {
  NORMAL: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  WARN: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  ALERT: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
  BLOCK: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
};

const thresholdLabelMap: Record<string, string> = {
  NORMAL: '正常',
  WARN: '预警',
  ALERT: '告警',
  BLOCK: '拦截',
};

const targetTypeLabelMap: Record<string, string> = {
  DEPT: '部门预算',
  PROJECT: '项目预算',
};

const budgetStatusLabelMap: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  ACTIVE: '生效中',
};

const operationTypeLabelMap: Record<string, string> = {
  RESERVE: '预算占用',
  RELEASE: '预算释放',
  WRITEOFF: '预算核销',
  ADJUST: '预算调整',
};

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

const flattenDeptOptions = (items: SysDept[] = [], prefix = ''): Array<{ label: string; value: number }> =>
  items.flatMap((item) => {
    const label = prefix ? `${prefix} / ${item.deptName}` : item.deptName;
    const current = item.deptId ? [{ label, value: item.deptId }] : [];
    return [...current, ...flattenDeptOptions(item.children || [], label)];
  });

export default function BudgetManagementPage() {
  const { hasPermission } = useAuth();
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
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${thresholdToneMap[status || 'NORMAL'] || thresholdToneMap.NORMAL}`}>
      {thresholdLabelMap[status || 'NORMAL'] || status || '正常'}
    </span>
  );

  return (
    <div className="space-y-4">
      <TablePageLayout
        filters={(
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="按预算名称搜索，例如：交付部 2026 年预算" className="max-w-md" />
                <div className="text-xs text-slate-500">
                  预算管理 = 预算主表 + 预算明细 + 执行台账 + 阈值状态 + 调整提审。
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void openDialog({ type: 'subject' })} disabled={!hasPermission('oa:budget:subject')}>
                  <Plus size={14} className="mr-1.5" />新增科目
                </Button>
                <Button size="sm" variant="outline" onClick={() => void openDialog({ type: 'adjustment' })} disabled={!hasPermission('oa:budget:adjustment')}>
                  <Plus size={14} className="mr-1.5" />新增调整
                </Button>
                <Button size="sm" onClick={() => void openDialog({ type: 'plan' })} disabled={!hasPermission('oa:budget:add')}>
                  <Plus size={14} className="mr-1.5" />新增预算
                </Button>
              </div>
            </div>
          </div>
        )}
        table={(
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/88">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium"><Banknote size={16} />预算主表</div>
                <div className="text-xs text-slate-500">预算提审后才进入执行</div>
              </div>
              <table className="w-full">
                <TableHeader><tr><TableHead>预算</TableHead><TableHead>执行</TableHead><TableActionHead>操作</TableActionHead></tr></TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {plans.map((item) => (
                    <tr key={item.budgetId}>
                      <td className="px-4 py-3 text-sm">
                        <div>{item.budgetName}</div>
                        <div className="text-xs text-slate-500">{item.budgetNo || '-'} / {targetTypeLabelMap[item.targetType || 'DEPT'] || item.targetType || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{budgetStatusLabelMap[item.status || 'DRAFT'] || item.status || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div>{formatMoney(item.totalAmount)}</div>
                        <div className="text-xs text-slate-500">占用 {formatMoney(item.reservedAmount)} / 实际 {formatMoney(item.actualAmount)}</div>
                        <div className="mt-1 text-xs text-slate-400">可用 {formatMoney(item.availableAmount)}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          overflowLabel="更多"
                          actions={[
                            { label: '查看预算详情', icon: <Eye size={14} />, onClick: () => void openDialog({ type: 'plan-detail', item }), semantic: 'view', isPrimary: true },
                            { label: '编辑预算', icon: <Edit size={14} />, onClick: () => void openDialog({ type: 'plan', item }), hidden: item.status !== 'DRAFT' && item.status !== 'REJECTED', semantic: 'edit', isPrimary: true, permissionKey: 'oa:budget:edit' },
                            { label: '提交预算', icon: <Send size={14} />, onClick: () => setConfirm({ type: 'plan-submit', item }), hidden: item.status !== 'DRAFT' && item.status !== 'REJECTED', semantic: 'submit', permissionKey: 'oa:budget:submit' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/88">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium"><ClipboardList size={16} />预算科目</div>
                <div className="text-xs text-slate-500">报销 / 采购 / 付款都按科目校验</div>
              </div>
              <table className="w-full">
                <TableHeader><tr><TableHead>科目</TableHead><TableHead>状态</TableHead><TableActionHead>操作</TableActionHead></tr></TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {subjects.map((item) => (
                    <tr key={item.subjectId}>
                      <td className="px-4 py-3 text-sm">
                        <div>{item.subjectName}</div>
                        <div className="text-xs text-slate-500">{item.subjectCode}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div>{item.subjectType || '-'}</div>
                        <div className="text-xs text-slate-500">{item.enabled === 1 ? '启用' : '停用'}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            { label: '编辑科目', icon: <Edit size={14} />, onClick: () => void openDialog({ type: 'subject', item }), semantic: 'edit', isPrimary: true, permissionKey: 'oa:budget:subject' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/88">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle size={16} />预算调整</div>
                <div className="text-xs text-slate-500">调整要提审，不能直接改主表</div>
              </div>
              <table className="w-full">
                <TableHeader><tr><TableHead>调整</TableHead><TableHead>金额</TableHead><TableActionHead>操作</TableActionHead></tr></TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {adjustments.map((item) => (
                    <tr key={item.adjustmentId}>
                      <td className="px-4 py-3 text-sm">
                        <div>{item.adjustmentNo}</div>
                        <div className="text-xs text-slate-500">{item.subjectName || item.subjectCode || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{budgetStatusLabelMap[item.status || 'DRAFT'] || item.status || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{formatMoney(item.changeAmount)}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          overflowLabel="更多"
                          actions={[
                            { label: '查看调整详情', icon: <Eye size={14} />, onClick: () => void openDialog({ type: 'adjustment-detail', item }), semantic: 'view', isPrimary: true },
                            { label: '提交调整', icon: <Send size={14} />, onClick: () => setConfirm({ type: 'adjustment-submit', item }), hidden: item.status !== 'DRAFT' && item.status !== 'REJECTED', semantic: 'submit', permissionKey: 'oa:budget:adjustment' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )}
      />

      <BaseDialog
        open={dialog?.type === 'plan-detail'}
        title={planDetail?.budgetName || '预算详情'}
        onClose={() => void openDialog(null)}
        width="extra-wide"
      >
        {planDetail && planSummary ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="text-sm font-medium">预算总额</div>
                <div className="mt-2 text-sm">{formatMoney(planSummary.totalAmount)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="text-sm font-medium">预算占用</div>
                <div className="mt-2 text-sm">{formatMoney(planSummary.reservedAmount)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="text-sm font-medium">实际执行</div>
                <div className="mt-2 text-sm">{formatMoney(planSummary.actualAmount)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="text-sm font-medium">阈值状态</div>
                <div className="mt-2">{thresholdBadge(planSummary.thresholdStatus)}</div>
                <div className="mt-1 text-xs text-slate-500">执行率 {formatPercent(planSummary.executionRatio)}</div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="mb-3 text-sm font-medium">预算主表</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">预算编号：{planDetail.budgetNo || '-'}</div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">目标对象：{targetTypeLabelMap[planDetail.targetType || 'DEPT'] || planDetail.targetType} / {planDetail.targetName || planDetail.projectName || planDetail.deptName || '-'}</div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">负责人：{planDetail.ownerName || '-'}</div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">可用余额：{formatMoney(planSummary.availableAmount)}</div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  阈值 = 预警 {formatPercent(planSummary.warningThreshold)} / 告警 {formatPercent(planSummary.alertThreshold)} / 拦截 {formatPercent(planSummary.blockThreshold)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="mb-3 text-sm font-medium">预算科目明细</div>
                <div className="space-y-2">
                  {(planDetail.lines || []).map((line, index) => (
                    <div key={`${line.lineId || line.subjectCode || 'line'}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                      <div>{line.subjectCode || '-'} / {line.subjectName || '-'}</div>
                      <div className="text-xs text-slate-500">预算 {formatMoney(line.amount)} / 占用 {formatMoney(line.reservedAmount)} / 实际 {formatMoney(line.actualAmount)} / 可用 {formatMoney(line.availableAmount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium">执行台账</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <TableHeader><tr><TableHead>业务</TableHead><TableHead>科目</TableHead><TableHead>操作</TableHead><TableHead>金额</TableHead><TableHead>可用余额</TableHead><TableHead>备注</TableHead></tr></TableHeader>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {planLedger.length ? planLedger.map((item) => (
                      <tr key={item.ledgerId}>
                        <td className="px-4 py-3 text-sm">
                          <div>{item.businessType || '-'}</div>
                          <div className="text-xs text-slate-500">{item.businessNo || item.businessId || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">{item.subjectName || item.subjectCode || '-'}</td>
                        <td className="px-4 py-3 text-sm">{operationTypeLabelMap[item.operationType || ''] || item.operationType || '-'}</td>
                        <td className="px-4 py-3 text-sm">{formatMoney(item.amount)}</td>
                        <td className="px-4 py-3 text-sm">{formatMoney(item.availableAfter)}</td>
                        <td className="px-4 py-3 text-sm">{item.remark || '-'}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">暂无执行台账，当前预算还没有被业务单据占用或核销。</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
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
                  <SelectItem value="DEPT">部门预算</SelectItem>
                  <SelectItem value="PROJECT">项目预算</SelectItem>
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

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">预算科目明细</div>
              <Button size="sm" variant="outline" onClick={() => setPlanForm((prev) => ({ ...prev, lines: [...(prev.lines || []), { ...emptyPlanLine }] }))}>
                <Plus size={14} className="mr-1.5" />新增一行
              </Button>
            </div>
            <div className="space-y-3">
              {(planForm.lines || []).map((line, index) => (
                <div key={`${line.lineId || line.subjectCode || 'line'}-${index}`} className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 md:grid-cols-5 dark:border-slate-800 dark:bg-slate-900/60">
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
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                    阈值：{formatPercent(line.warningRatio)} / {formatPercent(line.alertRatio)} / {formatPercent(line.blockRatio)}
                  </div>
                  <Button variant="outline" onClick={() => setPlanForm((prev) => ({ ...prev, lines: (prev.lines || []).filter((_, lineIndex) => lineIndex !== index) || [{ ...emptyPlanLine }] }))} disabled={(planForm.lines || []).length === 1}>
                    删除
                  </Button>
                </div>
              ))}
            </div>
          </div>
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
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
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
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-sm font-medium">调整单号</div>
              <div className="mt-2 text-sm">{dialog.item.adjustmentNo || '-'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-sm font-medium">预算 / 科目</div>
              <div className="mt-2 text-sm">{dialog.item.budgetNo || dialog.item.budgetId || '-'} / {dialog.item.subjectName || dialog.item.subjectCode || '-'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-sm font-medium">调整金额</div>
              <div className="mt-2 text-sm">{formatMoney(dialog.item.changeAmount)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-sm font-medium">调整原因</div>
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{dialog.item.reason || '无'}</div>
            </div>
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
    </div>
  );
}

