import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Edit3, Plus, RotateCcw, ShieldAlert, UserPlus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Label, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatCard, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { OaRiskAlert, RiskStats, riskApi, RiskStatus } from '@/services/api/contractRisk';
import { PageResult } from '@/types';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

const LEVEL_LABELS: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '严重',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: '未处理',
  HANDLING: '处理中',
  CLOSED: '已关闭',
  IGNORED: '已忽略',
};

const SOURCE_LABELS: Record<string, string> = {
  RULE: '规则',
  MANUAL: '人工',
};

const normalizeRows = <T,>(result: PageResult<T>) => result.rows || result.records || [];

const getLevelBadge = (level?: string) => {
  const toneMap: Record<string, string> = {
    LOW: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    HIGH: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
    CRITICAL: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  };
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneMap[level || 'MEDIUM'] || toneMap.MEDIUM}`}>{LEVEL_LABELS[level || 'MEDIUM'] || level || '-'}</span>;
};

const getStatusBadge = (status?: string) => {
  const toneMap: Record<string, string> = {
    OPEN: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    HANDLING: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    CLOSED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    IGNORED: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  };
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneMap[status || 'OPEN'] || toneMap.OPEN}`}>{STATUS_LABELS[status || 'OPEN'] || status || '-'}</span>;
};

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

export const RiskAlertPage: React.FC = () => {
  const [rows, setRows] = useState<OaRiskAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<RiskStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, riskStatus: '', riskLevel: '', riskSource: '', riskName: '' });
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState<OaRiskAlert>({ businessType: 'CONTRACT', businessId: 0, riskName: '', riskLevel: 'MEDIUM', ownerName: '', handleRemark: '' });
  const [statusTarget, setStatusTarget] = useState<OaRiskAlert | null>(null);
  const [nextStatus, setNextStatus] = useState<RiskStatus>('HANDLING');
  const [handleRemark, setHandleRemark] = useState('');
  const [assignTarget, setAssignTarget] = useState<OaRiskAlert | null>(null);
  const [assignForm, setAssignForm] = useState({ ownerId: '', ownerName: '' });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await riskApi.list({
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        riskStatus: query.riskStatus || undefined,
        riskLevel: query.riskLevel || undefined,
        riskSource: query.riskSource || undefined,
        riskName: query.riskName || undefined,
      });
      setRows(normalizeRows(result));
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取风险列表失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await riskApi.stats());
    } catch (error) {
      toast.error(getErrorMessage(error, '获取风险统计失败'));
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const unresolvedCount = useMemo(() => (stats?.openCount || 0) + (stats?.handlingCount || 0), [stats]);

  const openStatus = (risk: OaRiskAlert, status: RiskStatus) => {
    setStatusTarget(risk);
    setNextStatus(status);
    setHandleRemark('');
  };

  const submitStatus = async () => {
    if (!statusTarget?.id) return;
    try {
      await riskApi.updateStatus(statusTarget.id, { riskStatus: nextStatus, handleRemark });
      toast.success('状态已更新');
      setStatusTarget(null);
      await fetchRows();
      await fetchStats();
    } catch (error) {
      toast.error(getErrorMessage(error, '更新风险状态失败'));
    }
  };

  const submitManual = async () => {
    if (!manualForm.businessId || !manualForm.riskName.trim()) {
      toast.warning('请补全业务ID和风险名称');
      return;
    }
    try {
      await riskApi.manual(manualForm);
      toast.success('人工风险已标记');
      setManualOpen(false);
      setManualForm({ businessType: 'CONTRACT', businessId: 0, riskName: '', riskLevel: 'MEDIUM', ownerName: '', handleRemark: '' });
      await fetchRows();
      await fetchStats();
    } catch (error) {
      toast.error(getErrorMessage(error, '人工标记风险失败'));
    }
  };

  const openAssign = (risk: OaRiskAlert) => {
    setAssignTarget(risk);
    setAssignForm({ ownerId: risk.ownerId ? String(risk.ownerId) : '', ownerName: risk.ownerName || '' });
  };

  const submitAssign = async () => {
    if (!assignTarget?.id || !assignForm.ownerId) {
      toast.warning('负责人ID不能为空');
      return;
    }
    try {
      await riskApi.assign(assignTarget.id, { ownerId: Number(assignForm.ownerId), ownerName: assignForm.ownerName });
      toast.success('风险已指派');
      setAssignTarget(null);
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '指派风险失败'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="待处理风险" value={unresolvedCount} icon={<ShieldAlert size={18} />} iconVariant="danger" meta="未处理与处理中" />
        <StatCard title="高风险" value={stats?.highRiskCount ?? 0} icon={<AlertTriangle size={18} />} iconVariant="warning" meta="高与严重等级" />
        <StatCard title="规则生成" value={stats?.ruleCount ?? 0} icon={<Clock3 size={18} />} iconVariant="primary" meta="系统扫描生成" />
        <StatCard title="人工标记" value={stats?.manualCount ?? 0} icon={<Edit3 size={18} />} iconVariant="success" meta="人工补充风险" />
      </div>

      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full sm:w-[150px]">
                <Select value={query.riskStatus || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, riskStatus: value === 'ALL' ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[150px]">
                <Select value={query.riskLevel || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, riskLevel: value === 'ALL' ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="等级" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部等级</SelectItem>
                    {Object.entries(LEVEL_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[150px]">
                <Select value={query.riskSource || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, riskSource: value === 'ALL' ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="来源" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部来源</SelectItem>
                    {Object.entries(SOURCE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input className="h-10 w-full sm:w-[220px]" value={query.riskName} onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, riskName: event.target.value }))} placeholder="风险名称" />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>第 {query.pageNum} / {totalPages} 页</span>
                <span>共 {total} 条</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: 10, riskStatus: '', riskLevel: '', riskSource: '', riskName: '' })}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button size="sm" onClick={() => setManualOpen(true)}>
                <Plus size={14} className="mr-1.5" />
                人工标记
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <tr>
                    <TableHead className="px-4 py-3 text-left">风险</TableHead>
                    <TableHead className="px-4 py-3 text-left">业务</TableHead>
                    <TableHead className="px-4 py-3 text-left">等级</TableHead>
                    <TableHead className="px-4 py-3 text-left">状态</TableHead>
                    <TableHead className="px-4 py-3 text-left">来源</TableHead>
                    <TableHead className="px-4 py-3 text-left">负责人</TableHead>
                    <TableHead className="px-4 py-3 text-left">发现 / 处理</TableHead>
                    <TableActionHead className="w-44 px-4 py-3 text-right">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={8} title="正在加载风险..." loading />
                  ) : rows.length === 0 ? (
                    <TableStateRow colSpan={8} title="暂无风险记录" />
                  ) : rows.map((item) => (
                    <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.riskName}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.riskCode || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{item.businessType || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">ID {item.businessId}</div>
                      </td>
                      <td className="px-4 py-3">{getLevelBadge(item.riskLevel)}</td>
                      <td className="px-4 py-3">{getStatusBadge(item.riskStatus)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{SOURCE_LABELS[item.riskSource || ''] || item.riskSource || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{item.ownerName || item.ownerId || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{formatDateTimeDisplay(item.detectedTime)}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.handledTime)}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          iconOnly
                          actions={[
                            { label: '处理中', icon: <Clock3 size={14} />, onClick: () => openStatus(item, 'HANDLING'), tone: 'primary', hidden: item.riskStatus === 'HANDLING' || item.riskStatus === 'CLOSED' || item.riskStatus === 'IGNORED' },
                            { label: '关闭', icon: <CheckCircle2 size={14} />, onClick: () => openStatus(item, 'CLOSED'), tone: 'success', hidden: item.riskStatus === 'CLOSED' },
                            { label: '忽略', icon: <XCircle size={14} />, onClick: () => openStatus(item, 'IGNORED'), tone: 'warning', hidden: item.riskStatus === 'IGNORED' },
                            { label: '指派', icon: <UserPlus size={14} />, onClick: () => openAssign(item), tone: 'neutral' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        pagination={total > 0 ? (
          <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} showPageSizeSelector={false} showJump={false} onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))} onPageSizeChange={() => {}} />
        ) : null}
      />

      <BaseDialog
        open={manualOpen}
        title="人工标记风险"
        onClose={() => setManualOpen(false)}
        width="normal"
        footer={(
          <>
            <Button variant="outline" onClick={() => setManualOpen(false)}>取消</Button>
            <Button onClick={() => void submitManual()}>保存</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>业务类型</Label>
              <Select value={manualForm.businessType || 'CONTRACT'} onValueChange={(value) => setManualForm((prev) => ({ ...prev, businessType: value }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONTRACT">合同</SelectItem>
                  <SelectItem value="SEAL">用印</SelectItem>
                  <SelectItem value="APPROVAL">审批</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>业务ID</Label>
              <Input className="h-11" type="number" value={manualForm.businessId || ''} onChange={(event) => setManualForm((prev) => ({ ...prev, businessId: Number(event.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>风险名称</Label>
              <Input className="h-11" value={manualForm.riskName} onChange={(event) => setManualForm((prev) => ({ ...prev, riskName: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>等级</Label>
              <Select value={manualForm.riskLevel || 'MEDIUM'} onValueChange={(value) => setManualForm((prev) => ({ ...prev, riskLevel: value as OaRiskAlert['riskLevel'] }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LEVEL_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>说明</Label>
            <Textarea className="min-h-[110px] resize-none" value={manualForm.handleRemark || ''} onChange={(event) => setManualForm((prev) => ({ ...prev, handleRemark: event.target.value }))} />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(statusTarget)}
        title="处理风险"
        onClose={() => setStatusTarget(null)}
        width="normal"
        footer={(
          <>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>取消</Button>
            <Button onClick={() => void submitStatus()}>保存</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="font-medium text-slate-900 dark:text-slate-100">{statusTarget?.riskName || '-'}</div>
            <div className="mt-1 text-xs text-slate-400">{STATUS_LABELS[nextStatus]}</div>
          </div>
          <div className="space-y-2">
            <Label>处理说明</Label>
            <Textarea className="min-h-[110px] resize-none" value={handleRemark} onChange={(event) => setHandleRemark(event.target.value)} />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(assignTarget)}
        title="指派风险"
        onClose={() => setAssignTarget(null)}
        width="normal"
        footer={(
          <>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>取消</Button>
            <Button onClick={() => void submitAssign()}>保存</Button>
          </>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>负责人ID</Label>
            <Input className="h-11" type="number" value={assignForm.ownerId} onChange={(event) => setAssignForm((prev) => ({ ...prev, ownerId: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>负责人姓名</Label>
            <Input className="h-11" value={assignForm.ownerName} onChange={(event) => setAssignForm((prev) => ({ ...prev, ownerName: event.target.value }))} />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default RiskAlertPage;
