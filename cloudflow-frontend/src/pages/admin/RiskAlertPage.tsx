import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { CheckCircle2, Clock3, Plus, RotateCcw, Search, ShieldAlert, UserPlus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Label, Pagination, SearchInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableActionHead, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, UserSelector } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { contractApi, OaContract, OaRiskAlert, RiskStats, riskApi, RiskStatus } from '@/services/api/contractRisk';
import { OaSealApplication, sealApplicationApi } from '@/services/api/sealLicense';
import { getVehicleList, SysVehicle } from '@/services/api/vehicle';
import { PageResult } from '@/types';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

type ManualBusinessType = 'CONTRACT' | 'SEAL' | 'VEHICLE';

type BusinessOption = {
  businessType: ManualBusinessType;
  businessId: number;
  label: string;
  meta: string;
  ownerId?: number;
  ownerName?: string;
};

interface SummaryMetricProps {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

const MANUAL_BUSINESS_TYPES: Array<{ value: ManualBusinessType; label: string }> = [
  { value: 'CONTRACT', label: '合同' },
  { value: 'SEAL', label: '用印申请' },
  { value: 'VEHICLE', label: '车辆' },
];

const ALL_FILTER_VALUE = '__all__';

const emptyManualForm = (): OaRiskAlert => ({
  businessType: 'CONTRACT',
  businessId: 0,
  riskName: '',
  riskLevel: 'MEDIUM',
  ownerName: '',
  handleRemark: '',
});

const normalizeRows = <T,>(result: PageResult<T>) => result.rows || result.records || [];

const formatContractOption = (item: OaContract): BusinessOption | null => {
  if (!item.contractId) return null;
  return {
    businessType: 'CONTRACT',
    businessId: item.contractId,
    label: `${item.contractNo || '未编号合同'} - ${item.contractName || '未命名合同'}`,
    meta: [item.counterpartyName, item.ownerName, item.status].filter(Boolean).join(' / '),
    ownerId: item.ownerId,
    ownerName: item.ownerName,
  };
};

const formatSealOption = (item: OaSealApplication): BusinessOption | null => {
  if (!item.id) return null;
  return {
    businessType: 'SEAL',
    businessId: item.id,
    label: `${item.applicationNo || '未编号用印'} - ${item.documentName || item.sealName || '未命名用印申请'}`,
    meta: [item.sealName, item.userName, item.status].filter(Boolean).join(' / '),
    ownerId: item.userId,
    ownerName: item.userName,
  };
};

const formatVehicleOption = (item: SysVehicle): BusinessOption | null => {
  if (!item.vehicleId) return null;
  return {
    businessType: 'VEHICLE',
    businessId: item.vehicleId,
    label: `${item.licensePlate || '未录车牌'} - ${[item.brand, item.model].filter(Boolean).join(' ') || '未命名车辆'}`,
    meta: [item.location, item.status].filter(Boolean).join(' / '),
    ownerId: item.managerUserId,
  };
};

const getLevelBadge = (level?: string) => (
  <DictBadge dictType="severity_level" value={String(level || 'MEDIUM')} fallback="中" />
);

const getStatusBadge = (status?: string) => (
  <DictBadge dictType="oa_risk_alert_status" value={String(status || 'OPEN')} fallback="未处理" />
);

const SummaryMetric: React.FC<SummaryMetricProps> = ({ label, value, tone = 'default' }) => {
  const toneClassName = {
    default: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  }[tone];

  return (
    <div className={`cf-summary-metric ${toneClassName}`}>
      <div className="text-[11px] leading-none text-current opacity-70">{label}</div>
      <div className="mt-1 text-sm font-semibold leading-none">{value}</div>
    </div>
  );
};

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <TableRow className="hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </TableCell>
  </TableRow>
);

export const RiskAlertPage: React.FC = () => {
  const levelDict = useDict('severity_level');
  const statusDict = useDict('oa_risk_alert_status');
  const sourceDict = useDict('oa_risk_alert_source');
  const businessTypeDict = useDict('oa_risk_business_type');
  const [rows, setRows] = useState<OaRiskAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<RiskStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), riskStatus: '', riskLevel: '', riskSource: '', riskName: '' });
  const [filterInput, setFilterInput] = useState({ riskStatus: '', riskLevel: '', riskSource: '', riskName: '' });
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState<OaRiskAlert>(emptyManualForm);
  const [manualBusinessOptions, setManualBusinessOptions] = useState<BusinessOption[]>([]);
  const [manualBusinessLoading, setManualBusinessLoading] = useState(false);
  const [manualBusinessSearch, setManualBusinessSearch] = useState('');
  const [statusTarget, setStatusTarget] = useState<OaRiskAlert | null>(null);
  const [nextStatus, setNextStatus] = useState<RiskStatus>('HANDLING');
  const [handleRemark, setHandleRemark] = useState('');
  const [assignTarget, setAssignTarget] = useState<OaRiskAlert | null>(null);
  const [assignForm, setAssignForm] = useState({ ownerId: '', ownerName: '' });
  const manualBusinessType = (manualForm.businessType || 'CONTRACT') as ManualBusinessType;

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

  const unresolvedCount = useMemo(() => (stats?.openCount || 0) + (stats?.handlingCount || 0), [stats]);
  const filteredManualBusinessOptions = useMemo(() => {
    const keyword = manualBusinessSearch.trim().toLowerCase();
    if (!keyword) return manualBusinessOptions;
    return manualBusinessOptions.filter((item) => (
      item.label.toLowerCase().includes(keyword)
      || item.meta.toLowerCase().includes(keyword)
      || String(item.businessId).includes(keyword)
    ));
  }, [manualBusinessOptions, manualBusinessSearch]);
  const selectedManualBusiness = useMemo(
    () => manualBusinessOptions.find((item) => item.businessId === manualForm.businessId),
    [manualBusinessOptions, manualForm.businessId],
  );

  useEffect(() => {
    if (!manualOpen) return;
    let cancelled = false;

    const fetchManualBusinessOptions = async () => {
      setManualBusinessLoading(true);
      try {
        let options: BusinessOption[] = [];
        if (manualBusinessType === 'CONTRACT') {
          const result = await contractApi.list({ pageNum: 1, pageSize: 100 });
          options = normalizeRows(result).map(formatContractOption).filter(Boolean) as BusinessOption[];
        } else if (manualBusinessType === 'SEAL') {
          const result = await sealApplicationApi.list({ pageNum: 1, pageSize: 100 });
          options = normalizeRows(result).map(formatSealOption).filter(Boolean) as BusinessOption[];
        } else if (manualBusinessType === 'VEHICLE') {
          const result = await getVehicleList({ pageNum: 1, pageSize: 100 });
          options = normalizeRows(result).map(formatVehicleOption).filter(Boolean) as BusinessOption[];
        }
        if (!cancelled) {
          setManualBusinessOptions(options);
        }
      } catch (error) {
        if (!cancelled) {
          setManualBusinessOptions([]);
          toast.error(getErrorMessage(error, '获取关联业务失败'));
        }
      } finally {
        if (!cancelled) {
          setManualBusinessLoading(false);
        }
      }
    };

    void fetchManualBusinessOptions();
    return () => {
      cancelled = true;
    };
  }, [manualBusinessType, manualOpen]);

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
      toast.warning('请选择关联业务并填写风险名称');
      return;
    }
    try {
      await riskApi.manual(manualForm);
      toast.success('人工风险已标记');
      setManualOpen(false);
      setManualForm(emptyManualForm());
      setManualBusinessSearch('');
      await fetchRows();
      await fetchStats();
    } catch (error) {
      toast.error(getErrorMessage(error, '人工标记风险失败'));
    }
  };

  const openManualDialog = () => {
    setManualForm(emptyManualForm());
    setManualBusinessSearch('');
    setManualOpen(true);
  };

  const closeManualDialog = () => {
    setManualOpen(false);
    setManualForm(emptyManualForm());
    setManualBusinessSearch('');
  };

  const changeManualBusinessType = (value: string) => {
    setManualBusinessSearch('');
    setManualBusinessOptions([]);
    setManualForm((prev) => ({
      ...prev,
      businessType: value as ManualBusinessType,
      businessId: 0,
      ownerId: undefined,
      ownerName: '',
    }));
  };

  const changeManualBusiness = (value: string) => {
    const option = manualBusinessOptions.find((item) => String(item.businessId) === value);
    if (!option) return;
    setManualForm((prev) => ({
      ...prev,
      businessType: option.businessType,
      businessId: option.businessId,
      ownerId: option.ownerId,
      ownerName: option.ownerName || prev.ownerName,
    }));
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

  const handleSearch = () => {
    setQuery((prev) => ({ ...prev, pageNum: 1, ...filterInput }));
  };

  const handleReset = () => {
    const emptyFilters = { riskStatus: '', riskLevel: '', riskSource: '', riskName: '' };
    setFilterInput(emptyFilters);
    setQuery((prev) => ({ ...prev, pageNum: 1, ...emptyFilters }));
  };

  const refreshPage = async () => {
    await Promise.all([fetchRows(), fetchStats()]);
  };

  const hasActiveFilters = Boolean(query.riskStatus || query.riskLevel || query.riskSource || query.riskName);
  const currentStatusLabel = query.riskStatus ? statusDict.getLabel(query.riskStatus) || query.riskStatus : '全部状态';
  const currentLevelLabel = query.riskLevel ? levelDict.getLabel(query.riskLevel) || query.riskLevel : '全部等级';
  const currentSourceLabel = query.riskSource ? sourceDict.getLabel(query.riskSource) || query.riskSource : '全部来源';
  const currentNameLabel = query.riskName || '全部风险';

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-3"
        actions={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-wrap items-center gap-2">
              <SummaryMetric label="待处理风险" value={unresolvedCount} tone={unresolvedCount > 0 ? 'danger' : 'default'} />
              <SummaryMetric label="高风险" value={stats?.highRiskCount ?? 0} tone={(stats?.highRiskCount ?? 0) > 0 ? 'warning' : 'default'} />
              <SummaryMetric label="规则生成" value={stats?.ruleCount ?? 0} />
              <SummaryMetric label="人工标记" value={stats?.manualCount ?? 0} tone="success" />
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void refreshPage()} disabled={loading}>
                <RotateCcw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
                刷新
              </Button>
              <Button size="sm" onClick={openManualDialog}>
                <Plus size={14} className="mr-1.5" />
                人工标记
              </Button>
            </div>
          </div>
        )}
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full sm:w-[150px]">
                <Select value={filterInput.riskStatus || ALL_FILTER_VALUE} onValueChange={(value) => setFilterInput((prev) => ({ ...prev, riskStatus: value === ALL_FILTER_VALUE ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>全部状态</SelectItem>
                    {statusDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[150px]">
                <Select value={filterInput.riskLevel || ALL_FILTER_VALUE} onValueChange={(value) => setFilterInput((prev) => ({ ...prev, riskLevel: value === ALL_FILTER_VALUE ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="等级" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>全部等级</SelectItem>
                    {RISK_LEVELS.map((value) => <SelectItem key={value} value={value}>{levelDict.getLabel(value)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[150px]">
                <Select value={filterInput.riskSource || ALL_FILTER_VALUE} onValueChange={(value) => setFilterInput((prev) => ({ ...prev, riskSource: value === ALL_FILTER_VALUE ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="来源" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>全部来源</SelectItem>
                    {sourceDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative min-w-[220px] flex-1 lg:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  className="h-10 pl-10"
                  value={filterInput.riskName}
                  onChange={(event) => setFilterInput((prev) => ({ ...prev, riskName: event.target.value }))}
                  onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                  placeholder="搜索风险名称"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{hasActiveFilters ? `${currentStatusLabel} / ${currentLevelLabel} / ${currentSourceLabel} / ${currentNameLabel}` : '全部风险'}</span>
                <span>共 {total} 条</span>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
              <Button variant="outline" size="sm" onClick={handleSearch}>
                <Search size={14} className="mr-1.5" />
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw size={14} className="mr-1.5" />
                清空筛选
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <Table className="min-w-[1120px]">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">风险</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">业务</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">等级</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">来源</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">负责人</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">发现 / 处理</TableHead>
                    <TableActionHead className="w-44 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">操作</TableActionHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={8} title="正在加载风险..." loading />
                  ) : rows.length === 0 ? (
                    <TableStateRow colSpan={8} title="暂无风险记录" />
                  ) : rows.map((item) => (
                    <TableRow key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                      <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.riskName}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.riskCode || '-'}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{businessTypeDict.getLabel(item.businessType || '') || item.businessType || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">ID {item.businessId}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3">{getLevelBadge(item.riskLevel)}</TableCell>
                      <TableCell className="px-4 py-3">{getStatusBadge(item.riskStatus)}</TableCell>
                      <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{sourceDict.getLabel(item.riskSource || '') || item.riskSource || '-'}</TableCell>
                      <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{item.ownerName || item.ownerId || '-'}</TableCell>
                      <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{formatDateTimeDisplay(item.detectedTime)}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.handledTime)}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            { label: '处理中', icon: <Clock3 size={14} />, onClick: () => openStatus(item, 'HANDLING'), tone: 'primary', hidden: item.riskStatus === 'HANDLING' || item.riskStatus === 'CLOSED' || item.riskStatus === 'IGNORED' },
                            { label: '关闭', icon: <CheckCircle2 size={14} />, onClick: () => openStatus(item, 'CLOSED'), tone: 'success', hidden: item.riskStatus === 'CLOSED' },
                            { label: '忽略', icon: <XCircle size={14} />, onClick: () => openStatus(item, 'IGNORED'), tone: 'warning', hidden: item.riskStatus === 'IGNORED' },
                            { label: '指派', icon: <UserPlus size={14} />, onClick: () => openAssign(item), tone: 'neutral' },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TableSurfaceCard>)}
        pagination={total > 0 ? (
          <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} showPageSizeSelector={false} showJump={false} onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))} onPageSizeChange={() => {}} />
        ) : null}
      />

      <BaseDialog
        open={manualOpen}
        title="人工标记风险"
        onClose={closeManualDialog}
        width="normal"
        footer={(
          <>
            <Button variant="outline" onClick={closeManualDialog}>取消</Button>
            <Button onClick={() => void submitManual()}>保存</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>业务类型</Label>
              <Select value={manualBusinessType} onValueChange={changeManualBusinessType}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MANUAL_BUSINESS_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>关联业务</Label>
              <Select
                value={manualForm.businessId ? String(manualForm.businessId) : undefined}
                onValueChange={changeManualBusiness}
                disabled={manualBusinessLoading}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={manualBusinessLoading ? '正在加载...' : `选择${businessTypeDict.getLabel(manualBusinessType) || '业务'}`} />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {manualBusinessOptions.length > 8 ? (
                    <div className="p-1">
                      <SearchInput
                        value={manualBusinessSearch}
                        onChange={setManualBusinessSearch}
                        placeholder="搜索编号、名称或负责人"
                        inputClassName="h-9"
                      />
                    </div>
                  ) : null}
                  {filteredManualBusinessOptions.length ? filteredManualBusinessOptions.map((item) => (
                    <SelectItem key={`${item.businessType}-${item.businessId}`} value={String(item.businessId)}>
                      {item.meta ? `${item.label} / ${item.meta}` : item.label}
                    </SelectItem>
                  )) : (
                    <div className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {manualBusinessLoading ? '正在加载关联业务...' : '暂无可选业务'}
                    </div>
                  )}
                </SelectContent>
              </Select>
              {selectedManualBusiness?.meta ? (
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{selectedManualBusiness.meta}</div>
              ) : null}
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
                  {RISK_LEVELS.map((value) => <SelectItem key={value} value={value}>{levelDict.getLabel(value)}</SelectItem>)}
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
            <div className="mt-1 text-xs text-slate-400">{statusDict.getLabel(nextStatus)}</div>
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
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>负责人</Label>
            <UserSelector
              single
              value={assignForm.ownerId || null}
              onChange={(id, picked) => setAssignForm({ ownerId: id || '', ownerName: picked?.name || '' })}
              placeholder="选择负责人"
            />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default RiskAlertPage;
