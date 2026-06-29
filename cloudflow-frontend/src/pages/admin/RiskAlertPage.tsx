import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { CheckCircle2, Clock3, Plus, RotateCcw, Search, ShieldAlert, UserPlus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Label, Pagination, SearchInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, UserSelector } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
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

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
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
  const statCards = [
    { label: '待处理风险', value: String(unresolvedCount), detail: unresolvedCount > 0 ? '需要跟进' : '当前清零', icon: ShieldAlert, tone: unresolvedCount > 0 ? 'amber' : 'blue' },
    { label: '高风险', value: String(stats?.highRiskCount ?? 0), detail: '重点复核', icon: ShieldAlert, tone: 'violet' },
    { label: '规则生成', value: String(stats?.ruleCount ?? 0), detail: '自动识别', icon: CheckCircle2, tone: 'blue' },
    { label: '人工标记', value: String(stats?.manualCount ?? 0), detail: '人工补录', icon: UserPlus, tone: 'green' },
  ];

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">RISK CONTROL</p>
          <h2>风控管理</h2>
          <span>管理合同、用印、车辆等业务风险，跟进处理和人工标记</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void refreshPage()} disabled={loading}>
            <RotateCcw size={16} className={loading ? 'animate-spin' : undefined} />
            刷新状态
          </Button>
          <Button size="sm" onClick={openManualDialog}>
            <Plus size={16} />
            人工标记
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
              <div className="admin-source-stat-icon"><Icon size={18} /></div>
              <div>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.detail}</span>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-oa-filter-grid">
        <label>
          <span className="input-label">状态</span>
          <Select value={filterInput.riskStatus || ALL_FILTER_VALUE} onValueChange={(value) => setFilterInput((prev) => ({ ...prev, riskStatus: value === ALL_FILTER_VALUE ? '' : value }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部状态</SelectItem>
              {statusDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">等级</span>
          <Select value={filterInput.riskLevel || ALL_FILTER_VALUE} onValueChange={(value) => setFilterInput((prev) => ({ ...prev, riskLevel: value === ALL_FILTER_VALUE ? '' : value }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="等级" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部等级</SelectItem>
              {RISK_LEVELS.map((value) => <SelectItem key={value} value={value}>{levelDict.getLabel(value)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">来源</span>
          <Select value={filterInput.riskSource || ALL_FILTER_VALUE} onValueChange={(value) => setFilterInput((prev) => ({ ...prev, riskSource: value === ALL_FILTER_VALUE ? '' : value }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="来源" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部来源</SelectItem>
              {sourceDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">风险名称</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filterInput.riskName}
              onChange={(event) => setFilterInput((prev) => ({ ...prev, riskName: event.target.value }))}
              onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
              placeholder="搜索风险名称"
              className="h-[42px] pl-9"
            />
          </div>
        </label>
        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">{hasActiveFilters ? `${currentStatusLabel} / ${currentLevelLabel} / ${currentSourceLabel} / ${currentNameLabel}` : `共 ${total} 条`}</span>
          <Button variant="outline" size="sm" onClick={handleSearch}>
            <Search size={14} />
            应用
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={!hasActiveFilters && !filterInput.riskName && !filterInput.riskStatus && !filterInput.riskLevel && !filterInput.riskSource}>
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[1120px]">
          <thead>
            <tr>
              <th>风险</th>
              <th>业务</th>
              <th>等级</th>
              <th>状态</th>
              <th>来源</th>
              <th>负责人</th>
              <th>发现 / 处理</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={8} title="正在加载风险..." loading />
            ) : rows.length === 0 ? (
              <TableStateRow colSpan={8} title="暂无风险记录" />
            ) : rows.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{item.riskName}</div>
                  <div className="mt-1 text-xs text-slate-400">{item.riskCode || '-'}</div>
                </td>
                <td>
                  <div>{businessTypeDict.getLabel(item.businessType || '') || item.businessType || '-'}</div>
                  <div className="mt-1 text-xs text-slate-400">ID {item.businessId}</div>
                </td>
                <td>{getLevelBadge(item.riskLevel)}</td>
                <td>{getStatusBadge(item.riskStatus)}</td>
                <td>{sourceDict.getLabel(item.riskSource || '') || item.riskSource || '-'}</td>
                <td>{item.ownerName || item.ownerId || '-'}</td>
                <td>
                  <div>{formatDateTimeDisplay(item.detectedTime)}</div>
                  <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.handledTime)}</div>
                </td>
                <td>
                  <div className="admin-users-row-actions">
                    {item.riskStatus !== 'HANDLING' && item.riskStatus !== 'CLOSED' && item.riskStatus !== 'IGNORED' ? (
                      <button type="button" title="处理中" aria-label="处理中" onClick={() => openStatus(item, 'HANDLING')}><Clock3 size={15} /></button>
                    ) : null}
                    {item.riskStatus !== 'CLOSED' ? (
                      <button type="button" title="关闭" aria-label="关闭" onClick={() => openStatus(item, 'CLOSED')}><CheckCircle2 size={15} /></button>
                    ) : null}
                    {item.riskStatus !== 'IGNORED' ? (
                      <button type="button" className="danger" title="忽略" aria-label="忽略" onClick={() => openStatus(item, 'IGNORED')}><XCircle size={15} /></button>
                    ) : null}
                    <button type="button" title="指派" aria-label="指派" onClick={() => openAssign(item)}><UserPlus size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} showPageSizeSelector={false} showJump={false} onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))} onPageSizeChange={() => {}} />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-risk-alert-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

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
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
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
            <div className="admin-dialog-field">
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
            <div className="admin-dialog-field">
              <Label>风险名称</Label>
              <Input className="h-11" value={manualForm.riskName} onChange={(event) => setManualForm((prev) => ({ ...prev, riskName: event.target.value }))} />
            </div>
            <div className="admin-dialog-field">
              <Label>等级</Label>
              <Select value={manualForm.riskLevel || 'MEDIUM'} onValueChange={(value) => setManualForm((prev) => ({ ...prev, riskLevel: value as OaRiskAlert['riskLevel'] }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((value) => <SelectItem key={value} value={value}>{levelDict.getLabel(value)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="admin-dialog-field">
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
        <div className="admin-dialog-stack">
          <div className="card admin-source-panel">
            <div className="admin-source-panel-head">
              <div>
                <h3>{statusTarget?.riskName || '-'}</h3>
                <span>{statusDict.getLabel(nextStatus)}</span>
              </div>
            </div>
          </div>
          <div className="admin-dialog-field">
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
        <div className="admin-dialog-stack">
          <div className="admin-dialog-field">
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
    </>
  );
};

export default RiskAlertPage;
