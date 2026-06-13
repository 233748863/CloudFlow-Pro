import React from 'react';
import { BadgePlus, FileText, RefreshCcw, Search, ShieldCheck } from 'lucide-react';
import {
  Button,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { cn } from '@/utils/cn';
import { buildEmployeeLabel, toDateInputValue } from '../hrShared';

type SectionComponents = {
  WorkspaceSectionCard: React.ComponentType<any>;
  WorkspaceMetricStrip: React.ComponentType<any>;
  WorkspaceDiagnosticSummary: React.ComponentType<any>;
  WorkspaceTableStateRow: React.ComponentType<any>;
  WorkspaceInlineState: React.ComponentType<any>;
  WorkspaceInlineRiskList: React.ComponentType<any>;
  DetailRow: React.ComponentType<any>;
  SalaryDiffTable: React.ComponentType<any>;
};

type SectionProps = {
  components: SectionComponents;
  viewModel: any;
};

// 把主链路大段视图抽到独立 section 文件，主页面只保留路由和数据编排。
export const SalaryEmployeesSection: React.FC<SectionProps> = ({ components, viewModel }) => {
  const {
    WorkspaceSectionCard,
    WorkspaceMetricStrip,
    WorkspaceDiagnosticSummary,
    WorkspaceTableStateRow,
    WorkspaceInlineState,
    DetailRow,
  } = components;
  const {
    ALL_VALUE,
    loading,
    salaryKeyword,
    setSalaryKeyword,
    salaryDeptFilter,
    setSalaryDeptFilter,
    salaryStructureFilter,
    setSalaryStructureFilter,
    salaryDeptOptions,
    salaryStructureOptions,
    loadEmployeeSalaryList,
    currentEmployeeRecord,
    workingEmployeeSalaries,
    filteredEmployeeSalaries,
    futureEffectiveEmployeeSalaries,
    assignableEmployees,
    resignedEmployeeSalaries,
    selectedEmployeeId,
    setSelectedEmployeeId,
    isFutureDate,
    formatCurrency,
    employeeSalaryListLoading,
    latestEmployeeAdjustment,
    openAdjustmentFromHistory,
    refreshCurrentEmployeeWorkspace,
    employeeSalaryDetailLoading,
    employeeSalaryDetail,
    currentEmployeeEffectiveDate,
    currentEmployeeFutureEffective,
    currentEmployeeEffectiveOffsetDays,
    salaryHistoryMetrics,
    employeeSalaryDuplicateEffectiveDates,
    latestEmployeeAdjustmentMatchedCurrentSalary,
    latestEmployeeAdjustmentMatchedArchive,
    itemCategoryLabel,
    salaryHistoryStatusFilter,
    setSalaryHistoryStatusFilter,
    employeeSalaryHistoryLoading,
    loadEmployeeSalaryHistory,
    sortedEmployeeSalaryHistory,
    salaryArchiveStatusClass,
    salaryArchiveStatusLabel,
    openInsuranceDialog,
    openTaxDeductionDialog,
    loadEmployeeCompensationProfile,
    currentGrossSalary,
    employeeCompensationLoading,
    hasInsuranceProfile,
    currentEmployeeEffectiveHint,
    employeeInsuranceDetail,
    latestEmployeeInsuranceLedger,
    insuranceBaseMismatch,
    insuranceReferenceBase,
    insuranceCalculatedBase,
    employeeInsuranceCalculation,
    sortedEmployeeTaxDeductions,
    taxReferencePeriod,
    currentTaxDeductionTotal,
    compensationRiskSummary,
    compensationRiskItems,
    currentTaxConfig,
    currentPersonalInsurance,
    currentTaxableIncome,
    employeeTaxCalculation,
    currentNetIncome,
    currentCompanyInsurance,
    currentEmployerCost,
    currentTaxableAmount,
    insuranceBreakdownRows,
    openTaxConfigDialog,
    compactTaxDeductionRemark,
    insuranceLedgerStatusFilter,
    setInsuranceLedgerStatusFilter,
    setInsuranceLedgerPageNum,
    loadEmployeeInsuranceLedger,
    insuranceLedgerPageNum,
    insuranceLedgerStatusOptions,
    employeeInsuranceListLoading,
    employeeInsuranceLedgerDiagnostics,
    employeeInsuranceLedgerPage,
    employeeInsuranceLedgerRecords,
    loadEmployeeAdjustmentHistory,
    employeeAdjustmentHistoryLoading,
    sortedEmployeeAdjustmentHistory,
    employeeAdjustmentHistoryDiagnostics,
    adjustmentStatusClass,
    adjustmentStatusLabel,
    adjustmentTypeLabel,
    normalizeAmount,
    currentTaxAmount,
    insuranceReferenceEffectiveDate,
  } = viewModel;

  const employeeDetailTotalSalary = employeeSalaryDetail?.totalSalary || currentEmployeeRecord?.totalSalary;
  const employeeDetailStatusLabel = employeeSalaryDetail?.statusDesc || currentEmployeeRecord?.statusDesc || currentEmployeeRecord?.status || '-';
  const employeeDetailDuplicateCount = employeeSalaryDuplicateEffectiveDates[0]?.[1] || 1;
  const employeeDetailDuplicateDate = employeeSalaryDuplicateEffectiveDates[0]?.[0] || '-';
  const employeeDetailAdjustmentHint = latestEmployeeAdjustment
    ? `${latestEmployeeAdjustment.applicationNo} / ${toDateInputValue(latestEmployeeAdjustment.effectiveDate) || '-'}`
    : '-';
  const compensationRiskTone =
    compensationRiskSummary.className.includes('emerald')
      ? 'emerald'
      : compensationRiskSummary.className.includes('amber')
        ? 'amber'
        : compensationRiskSummary.className.includes('sky')
          ? 'sky'
          : compensationRiskSummary.className.includes('rose')
            ? 'rose'
            : 'default';
  const employeeOverviewStripItems = [
    {
      key: 'employee',
      label: '员工',
      value: employeeSalaryDetail?.employeeName || currentEmployeeRecord?.employeeName || '-',
      hint: employeeSalaryDetail?.employeeNo || currentEmployeeRecord?.employeeNo || '-',
    },
    {
      key: 'structure',
      label: '薪资结构',
      value: employeeSalaryDetail?.structureName || currentEmployeeRecord?.structureName || '-',
      hint: employeeSalaryDetail?.structureCode || currentEmployeeRecord?.structureCode || '-',
    },
    {
      key: 'salary',
      label: '总薪资',
      value: formatCurrency(employeeDetailTotalSalary),
    },
    {
      key: 'effective-date',
      label: '生效日期',
      value: currentEmployeeEffectiveDate || '-',
      hint: `${employeeDetailStatusLabel}${currentEmployeeFutureEffective ? ' · 未来生效' : ''}`,
      tone: currentEmployeeFutureEffective ? 'amber' : 'default',
    },
  ];
  const employeeArchiveStripItems = [
    {
      key: 'phase',
      label: '档案阶段',
      value: currentEmployeeFutureEffective ? '未来生效' : '生效中',
      hint: currentEmployeeFutureEffective ? `${currentEmployeeEffectiveOffsetDays ?? '-'} 天后` : '当前档案',
      tone: currentEmployeeFutureEffective ? 'amber' : 'emerald',
    },
    {
      key: 'active-count',
      label: 'ACTIVE 档案数',
      value: salaryHistoryMetrics.active,
      hint: salaryHistoryMetrics.active === 1 ? '正常' : '需核对',
      tone: salaryHistoryMetrics.active === 1 ? 'emerald' : 'rose',
    },
    {
      key: 'duplicate-peak',
      label: '同日档案峰值',
      value: employeeDetailDuplicateCount,
      hint: employeeDetailDuplicateCount > 1 ? employeeDetailDuplicateDate : '无重复生效日',
      tone: employeeDetailDuplicateCount > 1 ? 'amber' : 'default',
    },
    {
      key: 'latest-adjustment',
      label: '最近调薪',
      value: latestEmployeeAdjustment ? adjustmentStatusLabel(latestEmployeeAdjustment.status) : '暂无',
      hint: employeeDetailAdjustmentHint,
      tone: latestEmployeeAdjustment ? 'sky' : 'default',
    },
  ];
  const salaryHistoryStripItems = [
    {
      key: 'history-total',
      label: '档案总数',
      value: salaryHistoryMetrics.total,
    },
    {
      key: 'history-active',
      label: '生效中',
      value: salaryHistoryMetrics.active,
      tone: 'emerald',
    },
    {
      key: 'history-expired',
      label: '已失效',
      value: salaryHistoryMetrics.expired,
    },
    {
      key: 'history-duplicate',
      label: '重复生效日',
      value: employeeSalaryDuplicateEffectiveDates.length,
      hint: employeeSalaryDuplicateEffectiveDates[0]?.[0] || '无重复生效日',
      tone: employeeSalaryDuplicateEffectiveDates.length ? 'amber' : 'default',
    },
  ];
  const compensationBaselineStripItems = [
    {
      key: 'gross-salary',
      label: '测算基准薪资',
      value: formatCurrency(currentGrossSalary),
      hint: `${currentEmployeeEffectiveHint} · ${currentEmployeeFutureEffective ? '未来生效' : '生效中'}`,
      tone: currentEmployeeFutureEffective ? 'amber' : 'emerald',
    },
    {
      key: 'insurance-scheme',
      label: '社保方案口径',
      value: employeeInsuranceDetail?.schemeName || latestEmployeeInsuranceLedger?.schemeName || '未分配',
      hint: hasInsuranceProfile
        ? [
          employeeInsuranceDetail?.city || latestEmployeeInsuranceLedger?.city || '-',
          insuranceBaseMismatch
            ? `台账 ${formatCurrency(insuranceReferenceBase)} / 测算 ${formatCurrency(insuranceCalculatedBase)}`
            : `基数 ${formatCurrency(employeeInsuranceCalculation?.base ?? employeeInsuranceDetail?.base ?? latestEmployeeInsuranceLedger?.base)}`,
        ].join(' · ')
        : '按 0 估算',
      tone: hasInsuranceProfile ? (insuranceBaseMismatch ? 'amber' : 'default') : 'amber',
    },
    {
      key: 'tax-deductions',
      label: '专项扣除命中',
      value: `${sortedEmployeeTaxDeductions.length} 项`,
      hint: `${taxReferencePeriod} · ${formatCurrency(currentTaxDeductionTotal)}`,
      tone: sortedEmployeeTaxDeductions.length ? 'emerald' : 'default',
    },
    {
      key: 'risk-level',
      label: '联调风险等级',
      value: compensationRiskSummary.label,
      hint: `${taxReferencePeriod}${currentTaxConfig ? ` · ${toDateInputValue(currentTaxConfig.effectiveDate) || '-'}` : ''} · ${compensationRiskItems.length} 项`,
      tone: compensationRiskTone,
    },
  ];
  const compensationResultStripItems = [
    {
      key: 'pre-tax',
      label: '税前总薪资',
      value: formatCurrency(currentGrossSalary),
    },
    {
      key: 'personal-insurance',
      label: '个人社保公积金',
      value: hasInsuranceProfile ? formatCurrency(currentPersonalInsurance) : '-',
    },
    {
      key: 'taxable-income',
      label: '应税收入',
      value: formatCurrency(currentTaxableIncome),
    },
    {
      key: 'tax-amount',
      label: '个税',
      value: employeeTaxCalculation ? formatCurrency(currentTaxAmount) : '-',
    },
    {
      key: 'net-income',
      label: '预估到手',
      value: employeeTaxCalculation ? formatCurrency(currentNetIncome) : '-',
      tone: employeeTaxCalculation ? 'emerald' : 'default',
    },
    {
      key: 'company-insurance',
      label: '公司额外缴纳',
      value: hasInsuranceProfile ? formatCurrency(currentCompanyInsurance) : '-',
    },
    {
      key: 'employer-cost',
      label: '用工总成本',
      value: hasInsuranceProfile ? formatCurrency(currentEmployerCost) : formatCurrency(currentGrossSalary),
    },
    {
      key: 'deduction-total',
      label: '专项扣除合计',
      value: (employeeTaxCalculation || sortedEmployeeTaxDeductions.length)
        ? formatCurrency(currentTaxDeductionTotal)
        : '-',
    },
  ];
  const adjustmentHistoryStripItems = [
    {
      key: 'adjustment-total',
      label: '累计调薪次数',
      value: sortedEmployeeAdjustmentHistory.length,
      hint: employeeAdjustmentHistoryDiagnostics.duplicateEffectiveDates.length
        ? `${employeeAdjustmentHistoryDiagnostics.duplicateEffectiveDates.length} 个生效日重复`
        : '无重复生效日',
      tone: employeeAdjustmentHistoryDiagnostics.duplicateEffectiveDates.length ? 'amber' : 'default',
    },
    {
      key: 'adjustment-latest',
      label: '最近状态',
      value: latestEmployeeAdjustment ? adjustmentStatusLabel(latestEmployeeAdjustment.status) : '暂无',
      hint: latestEmployeeAdjustment
        ? `${toDateInputValue(latestEmployeeAdjustment.effectiveDate) || '-'} / ${latestEmployeeAdjustment.applicationNo}`
        : '-',
      tone: latestEmployeeAdjustment ? 'sky' : 'default',
    },
    {
      key: 'adjustment-landed',
      label: '落档命中',
      value: employeeAdjustmentHistoryDiagnostics.landedCurrentCount + employeeAdjustmentHistoryDiagnostics.landedHistoryCount,
      hint: `现薪 ${employeeAdjustmentHistoryDiagnostics.landedCurrentCount} / 历史 ${employeeAdjustmentHistoryDiagnostics.landedHistoryCount}`,
      tone: 'emerald',
    },
    {
      key: 'adjustment-risk',
      label: '待核对风险',
      value: employeeAdjustmentHistoryDiagnostics.pendingPastDueCount + employeeAdjustmentHistoryDiagnostics.unmatchedEffectiveCount,
      hint: `过期未推进 ${employeeAdjustmentHistoryDiagnostics.pendingPastDueCount} / 已生效未落档 ${employeeAdjustmentHistoryDiagnostics.unmatchedEffectiveCount}`,
      tone: (employeeAdjustmentHistoryDiagnostics.pendingPastDueCount + employeeAdjustmentHistoryDiagnostics.unmatchedEffectiveCount) > 0
        ? 'rose'
        : 'default',
    },
  ];
  const insuranceLedgerStripItems = [
    {
      key: 'ledger-total',
      label: '全量台账',
      value: employeeInsuranceLedgerDiagnostics.allRecords.length,
      hint: `筛选 ${employeeInsuranceLedgerPage?.total ?? 0} 条 · ${insuranceLedgerStatusOptions.find((option: any) => option.value === insuranceLedgerStatusFilter)?.label || '-'}`,
    },
    {
      key: 'ledger-active',
      label: 'ACTIVE 方案',
      value: employeeInsuranceLedgerDiagnostics.activeReferenceRecord?.schemeName || employeeInsuranceDetail?.schemeName || latestEmployeeInsuranceLedger?.schemeName || '-',
      hint: [
        employeeInsuranceLedgerDiagnostics.activeReferenceRecord?.city || employeeInsuranceDetail?.city || latestEmployeeInsuranceLedger?.city || '-',
        employeeInsuranceLedgerDiagnostics.activeRecords.length ? `ACTIVE ${employeeInsuranceLedgerDiagnostics.activeRecords.length} 条` : '-',
      ].join(' · '),
      tone: employeeInsuranceLedgerDiagnostics.activeRecords.length ? 'emerald' : 'default',
    },
    {
      key: 'ledger-future',
      label: '未来生效记录',
      value: employeeInsuranceLedgerDiagnostics.futureRecords.length,
      hint: employeeInsuranceLedgerDiagnostics.futureRecords[0]
        ? `${toDateInputValue(employeeInsuranceLedgerDiagnostics.futureRecords[0].effectiveDate) || '-'} / ${employeeInsuranceLedgerDiagnostics.futureRecords[0].schemeName || '-'} / ${formatCurrency(employeeInsuranceLedgerDiagnostics.futureRecords[0].base)}`
        : '-',
      tone: employeeInsuranceLedgerDiagnostics.futureRecords.length ? 'amber' : 'default',
    },
    {
      key: 'ledger-base-shift',
      label: '最近基数变化',
      value: employeeInsuranceLedgerDiagnostics.latestBaseShift
        ? `${employeeInsuranceLedgerDiagnostics.latestBaseShift.delta >= 0 ? '+' : '-'}${formatCurrency(Math.abs(employeeInsuranceLedgerDiagnostics.latestBaseShift.delta))}`
        : '-',
      hint: employeeInsuranceLedgerDiagnostics.latestBaseShift
        ? `${toDateInputValue(employeeInsuranceLedgerDiagnostics.latestBaseShift.previous.effectiveDate) || '-'} -> ${toDateInputValue(employeeInsuranceLedgerDiagnostics.latestBaseShift.current.effectiveDate) || '-'} · ${formatCurrency(employeeInsuranceLedgerDiagnostics.latestBaseShift.previous.base)} -> ${formatCurrency(employeeInsuranceLedgerDiagnostics.latestBaseShift.current.base)}`
        : '-',
      tone: (employeeInsuranceLedgerDiagnostics.latestBaseShift?.delta ?? 0) >= 0 ? 'sky' : 'rose',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <WorkspaceSectionCard title="在岗薪资档案">
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-10"
              placeholder="搜索员工工号、姓名、薪资结构"
              value={salaryKeyword}
              onChange={event => setSalaryKeyword(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              value={salaryDeptFilter}
              onValueChange={value => {
                setSalaryDeptFilter(value);
                void loadEmployeeSalaryList(currentEmployeeRecord?.employeeId, value, salaryStructureFilter);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="筛选部门" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部部门</SelectItem>
                {salaryDeptOptions.map((option: any) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={salaryStructureFilter}
              onValueChange={value => {
                setSalaryStructureFilter(value);
                void loadEmployeeSalaryList(currentEmployeeRecord?.employeeId, salaryDeptFilter, value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="筛选薪资结构" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部结构</SelectItem>
                {salaryStructureOptions.map((option: any) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              在岗现薪 {workingEmployeeSalaries.length} 条
              {salaryKeyword.trim() ? ` / 筛后 ${filteredEmployeeSalaries.length} 条` : ''}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSalaryKeyword('');
                setSalaryDeptFilter(ALL_VALUE);
                setSalaryStructureFilter(ALL_VALUE);
                void loadEmployeeSalaryList(currentEmployeeRecord?.employeeId, ALL_VALUE, ALL_VALUE);
              }}
            >
              清空筛选
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
            {futureEffectiveEmployeeSalaries.length > 0 && (
              <span>
                未来生效 {futureEffectiveEmployeeSalaries.length} 条
              </span>
            )}
            <span>
              待分配 {assignableEmployees.length} 人
            </span>
            {resignedEmployeeSalaries.length > 0 && (
              <span>
                已过滤离职 {resignedEmployeeSalaries.length} 条
              </span>
            )}
          </div>

          <div className="space-y-3">
            {filteredEmployeeSalaries.map((item: any) => {
              const isActive = String(item.employeeId) === selectedEmployeeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    isActive
                      ? 'border-slate-300 bg-slate-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  onClick={() => setSelectedEmployeeId(String(item.employeeId))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {item.employeeName || `员工 #${item.employeeId}`}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {[item.employeeNo, item.structureName].filter(Boolean).join(' / ')}
                      </div>
                    </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {isFutureDate(item.effectiveDate) && (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                            未来生效
                          </span>
                        )}
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                          {item.statusDesc || item.status}
                        </span>
                      </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{formatCurrency(item.totalSalary)}</span>
                    <span>生效 {toDateInputValue(item.effectiveDate) || '-'}</span>
                  </div>
                </button>
              );
            })}

            {!filteredEmployeeSalaries.length && !employeeSalaryListLoading && (
              <WorkspaceInlineState title="无在岗现薪" className="py-12" />
            )}

            {(loading || employeeSalaryListLoading) && (
              <WorkspaceInlineState type="loading" title="正在加载员工薪资..." className="py-12" />
            )}
          </div>
        </div>
      </WorkspaceSectionCard>

      <div className="space-y-6">
        <WorkspaceSectionCard
          title="员工薪资详情"
          headerAside={currentEmployeeRecord ? (
            <>
              {latestEmployeeAdjustment ? (
                <Button variant="outline" onClick={() => openAdjustmentFromHistory(latestEmployeeAdjustment.id)}>
                  <FileText size={14} className="mr-2" />
                  查看最近调薪
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => {
                  void refreshCurrentEmployeeWorkspace(currentEmployeeRecord);
                }}
              >
                <RefreshCcw size={14} className="mr-2" />
                刷新当前员工
              </Button>
            </>
          ) : undefined}
        >
          {!currentEmployeeRecord && !employeeSalaryDetailLoading && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center text-sm text-slate-500">
              选择现薪记录
            </div>
          )}

          {currentEmployeeRecord && (
            <div className="space-y-4">
              <WorkspaceMetricStrip items={employeeOverviewStripItems} />

              <WorkspaceMetricStrip items={employeeArchiveStripItems} />

              {(currentEmployeeFutureEffective
                || (latestEmployeeAdjustment && latestEmployeeAdjustmentMatchedCurrentSalary)
                || (latestEmployeeAdjustment && !latestEmployeeAdjustmentMatchedCurrentSalary && latestEmployeeAdjustmentMatchedArchive)
                || (latestEmployeeAdjustment && !latestEmployeeAdjustmentMatchedCurrentSalary && !latestEmployeeAdjustmentMatchedArchive)) && (
                <div className="flex flex-wrap gap-2">
                  {currentEmployeeFutureEffective && (
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                      ACTIVE 未来生效
                    </span>
                  )}
                  {!currentEmployeeFutureEffective && latestEmployeeAdjustment && latestEmployeeAdjustmentMatchedCurrentSalary && (
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                      调薪已对齐
                    </span>
                  )}
                  {!currentEmployeeFutureEffective
                    && latestEmployeeAdjustment
                    && !latestEmployeeAdjustmentMatchedCurrentSalary
                    && latestEmployeeAdjustmentMatchedArchive && (
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                      已落档 #{latestEmployeeAdjustmentMatchedArchive.id}
                    </span>
                  )}
                  {!currentEmployeeFutureEffective
                    && latestEmployeeAdjustment
                    && !latestEmployeeAdjustmentMatchedCurrentSalary
                    && !latestEmployeeAdjustmentMatchedArchive && (
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                      调薪待落档
                    </span>
                  )}
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>薪资项目</TableHead>
                      <TableHead>项目编码</TableHead>
                      <TableHead>分类</TableHead>
                      <TableHead>金额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(employeeSalaryDetail?.items || []).map((item: any) => (
                      <TableRow key={item.itemId}>
                        <TableCell className="font-medium text-slate-900">{item.itemName || `项目 ${item.itemId}`}</TableCell>
                        <TableCell>{item.itemCode || '-'}</TableCell>
                        <TableCell>{itemCategoryLabel(item.category)}</TableCell>
                        <TableCell>{formatCurrency(item.amount)}</TableCell>
                      </TableRow>
                    ))}
                    {!employeeSalaryDetail?.items?.length && !employeeSalaryDetailLoading && (
                      <WorkspaceTableStateRow colSpan={4} title="无薪资项目" />
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {employeeSalaryDetailLoading && (
            <WorkspaceInlineState type="loading" title="正在加载员工薪资详情..." className="mt-4 py-4" />
          )}
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="薪资档案历史"
          headerAside={(
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={salaryHistoryStatusFilter} onValueChange={setSalaryHistoryStatusFilter}>
                <SelectTrigger className="min-w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>全部档案</SelectItem>
                  <SelectItem value="ACTIVE">生效中</SelectItem>
                  <SelectItem value="EXPIRED">已失效</SelectItem>
                </SelectContent>
              </Select>

              {currentEmployeeRecord ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    void loadEmployeeSalaryHistory(currentEmployeeRecord.employeeId);
                  }}
                >
                  <RefreshCcw size={14} className="mr-2" />
                  刷新历史
                </Button>
              ) : null}
            </div>
          )}
        >
          {!currentEmployeeRecord && !employeeSalaryHistoryLoading && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center text-sm text-slate-500">
              选择员工后查看档案
            </div>
          )}

          {currentEmployeeRecord && (
            <div className="space-y-4">
              <WorkspaceMetricStrip items={salaryHistoryStripItems} />

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>结构信息</TableHead>
                      <TableHead>总薪资</TableHead>
                      <TableHead>生效日期</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEmployeeSalaryHistory.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{item.structureName || '-'}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {[item.structureCode, item.employeeNo].filter(Boolean).join(' / ') || '-'}
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(item.totalSalary)}</TableCell>
                        <TableCell>
                          <div>{toDateInputValue(item.effectiveDate) || '-'}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {isFutureDate(item.effectiveDate) && (
                              <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                                未来生效
                              </span>
                            )}
                            {latestEmployeeAdjustment
                              && (toDateInputValue(item.effectiveDate) || '') === (toDateInputValue(latestEmployeeAdjustment.effectiveDate) || '')
                              && normalizeAmount(item.totalSalary) === normalizeAmount(latestEmployeeAdjustment.afterTotal) && (
                              <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                                对应最近调薪
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${salaryArchiveStatusClass(item.status)}`}>
                            {salaryArchiveStatusLabel(item.status, item.statusDesc)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!sortedEmployeeSalaryHistory.length && !employeeSalaryHistoryLoading && (
                      <WorkspaceTableStateRow colSpan={4} title="无薪资档案" />
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {employeeSalaryHistoryLoading && (
            <WorkspaceInlineState type="loading" title="正在加载薪资档案..." className="mt-4 py-4" />
          )}
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="到手收入测算"
          headerAside={currentEmployeeRecord ? (
            <>
              <Button variant="outline" onClick={openInsuranceDialog}>
                <ShieldCheck size={14} className="mr-2" />
                分配社保方案
              </Button>
              <Button variant="outline" onClick={() => void openTaxDeductionDialog()}>
                <BadgePlus size={14} className="mr-2" />
                管理专项扣除
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void loadEmployeeCompensationProfile(
                    currentEmployeeRecord.employeeId,
                    currentGrossSalary,
                    employeeSalaryDetail?.effectiveDate || currentEmployeeRecord.effectiveDate,
                  );
                }}
              >
                <RefreshCcw size={14} className="mr-2" />
                刷新测算
              </Button>
            </>
          ) : undefined}
        >
          {!currentEmployeeRecord && !employeeCompensationLoading && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center text-sm text-slate-500">
              选择员工后查看测算
            </div>
          )}

          {currentEmployeeRecord && (
            <div className="space-y-4">
              {!hasInsuranceProfile && !employeeCompensationLoading && (
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                    未分配社保方案
                  </span>
                </div>
              )}

              <WorkspaceMetricStrip items={compensationBaselineStripItems} />

              {!employeeCompensationLoading && (
                <WorkspaceDiagnosticSummary
                  summary={compensationRiskSummary}
                  items={compensationRiskItems}
                  emptyText="已对齐"
                />
              )}

              <WorkspaceMetricStrip items={compensationResultStripItems} />

              <div className="grid grid-cols-1 gap-4 xl:items-start xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">五险一金拆分</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {employeeInsuranceDetail?.schemeName || '未分配方案'}
                        {employeeInsuranceDetail?.city ? ` / ${employeeInsuranceDetail.city}` : ''}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      {hasInsuranceProfile ? (
                        <>
                          <div>台账 {formatCurrency(insuranceReferenceBase)}</div>
                          <div className="mt-1">
                            {insuranceBaseMismatch
                              ? `测算 ${formatCurrency(insuranceCalculatedBase)}`
                              : `基数 ${formatCurrency(employeeInsuranceCalculation?.base ?? insuranceReferenceBase)}`}
                          </div>
                          <div className="mt-1">生效 {insuranceReferenceEffectiveDate || '-'}</div>
                        </>
                      ) : (
                        <div>-</div>
                      )}
                    </div>
                  </div>

                  {insuranceBaseMismatch && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                        台账 / 测算基数不同
                      </span>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>项目</TableHead>
                          <TableHead>个人</TableHead>
                          <TableHead>公司</TableHead>
                          <TableHead>合计</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {insuranceBreakdownRows.map((row: any) => {
                          const personal = Number(row.personal ?? 0);
                          const company = Number(row.company ?? 0);
                          const total = Number((personal + company).toFixed(2));

                          return (
                            <TableRow key={row.key}>
                              <TableCell className="font-medium text-slate-900">{row.label}</TableCell>
                              <TableCell>{row.personal != null ? formatCurrency(personal) : '-'}</TableCell>
                              <TableCell>{row.company != null ? formatCurrency(company) : '-'}</TableCell>
                              <TableCell>{(row.personal != null || row.company != null) ? formatCurrency(total) : '-'}</TableCell>
                            </TableRow>
                          );
                        })}
                        {!hasInsuranceProfile && !employeeCompensationLoading && (
                          <WorkspaceTableStateRow colSpan={4} title="无拆分数据" />
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white xl:sticky xl:top-0">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
                    <div>
                      <div className="font-semibold text-slate-900">个税与专项扣除</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {currentTaxConfig ? `${toDateInputValue(currentTaxConfig.effectiveDate) || '-'} / ${taxReferencePeriod}` : taxReferencePeriod}
                      </div>
                    </div>
                    <Button variant="outline" onClick={() => void openTaxConfigDialog()}>
                      <FileText size={14} className="mr-2" />
                      维护个税配置
                    </Button>
                  </div>

                  <div className="overflow-hidden border-b border-slate-200 bg-slate-50/45 dark:border-slate-800 dark:bg-slate-950/40">
                    <DetailRow
                      label="起征点"
                      value={employeeTaxCalculation ? formatCurrency(employeeTaxCalculation.threshold) : '-'}
                    />
                    <DetailRow
                      label="专项扣除合计"
                      value={(employeeTaxCalculation || sortedEmployeeTaxDeductions.length)
                        ? formatCurrency(currentTaxDeductionTotal)
                        : '-'}
                    />
                    <DetailRow
                      label="应纳税所得额"
                      value={employeeTaxCalculation ? formatCurrency(currentTaxableAmount) : '-'}
                    />
                  </div>

                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">专项扣除明细</div>
                    <div className="text-xs text-slate-400">{taxReferencePeriod}</div>
                  </div>

                  <div className="overflow-hidden border-t border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>扣除项</TableHead>
                          <TableHead>金额</TableHead>
                          <TableHead>生效区间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedEmployeeTaxDeductions.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-medium text-slate-900">
                                {item.deductionTypeName || item.deductionType}
                              </div>
                              <div className="mt-1 text-xs text-slate-400">{compactTaxDeductionRemark(item.remark)}</div>
                            </TableCell>
                            <TableCell>{formatCurrency(item.amount)}</TableCell>
                            <TableCell>
                              <div>{toDateInputValue(item.startDate) || '-'}</div>
                              <div className="mt-1 text-xs text-slate-400">
                                截止 {toDateInputValue(item.endDate) || '长期有效'}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {!sortedEmployeeTaxDeductions.length && !employeeCompensationLoading && (
                          <WorkspaceTableStateRow colSpan={3} title="无专项扣除" />
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {employeeCompensationLoading && (
            <WorkspaceInlineState type="loading" title="正在加载五险一金与个税测算..." className="mt-4 py-4" />
          )}
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="社保台账"
          headerAside={currentEmployeeRecord ? (
            <>
              <Select
                value={insuranceLedgerStatusFilter}
                onValueChange={value => {
                  setInsuranceLedgerStatusFilter(value);
                  setInsuranceLedgerPageNum(1);
                }}
              >
                <SelectTrigger className="w-[168px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {insuranceLedgerStatusOptions.map((option: any) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => void loadEmployeeInsuranceLedger(
                  currentEmployeeRecord.employeeId,
                  insuranceLedgerStatusFilter,
                  insuranceLedgerPageNum,
                )}
              >
                <RefreshCcw size={14} className="mr-2" />
                刷新台账
              </Button>
            </>
          ) : undefined}
        >
          {!currentEmployeeRecord && !employeeInsuranceListLoading && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center text-sm text-slate-500">
              选择员工后查看台账
            </div>
          )}

          {currentEmployeeRecord && (
            <div className="space-y-4">
              <WorkspaceMetricStrip items={insuranceLedgerStripItems} />

              <WorkspaceDiagnosticSummary
                summary={employeeInsuranceLedgerDiagnostics.riskSummary}
                items={employeeInsuranceLedgerDiagnostics.riskItems}
                emptyText="已对齐"
              />

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>方案</TableHead>
                      <TableHead>缴费基数</TableHead>
                      <TableHead>生效日期</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>校验</TableHead>
                      <TableHead>更新时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeeInsuranceLedgerRecords.map((item: any) => {
                      const rowIssues = employeeInsuranceLedgerDiagnostics.rowIssueMap.get(item.id) || [];
                      const rowClassName = rowIssues.length
                        ? 'bg-slate-50/70 dark:bg-slate-900/40'
                        : '';

                      return (
                        <TableRow key={item.id} className={rowClassName}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{item.schemeName || '-'}</div>
                            <div className="mt-1 text-xs text-slate-400">{item.city || '未填写城市'}</div>
                          </TableCell>
                          <TableCell>{formatCurrency(item.base)}</TableCell>
                          <TableCell>{toDateInputValue(item.effectiveDate) || '-'}</TableCell>
                          <TableCell>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${salaryArchiveStatusClass(item.status)}`}>
                              {salaryArchiveStatusLabel(item.status)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {rowIssues.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {rowIssues.map((issue: any) => (
                                  <span
                                    key={issue.key}
                                    className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300"
                                  >
                                    {issue.label}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>{toDateInputValue(item.updateTime || item.createTime) || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                    {!employeeInsuranceLedgerRecords.length && !employeeInsuranceListLoading && (
                      <WorkspaceTableStateRow colSpan={6} title="无社保台账" />
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
                <div>
                  共 {employeeInsuranceLedgerPage?.total ?? 0} 条，第 {employeeInsuranceLedgerPage?.current ?? 1} / {Math.max(Number(employeeInsuranceLedgerPage?.pages ?? 1), 1)} 页
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setInsuranceLedgerPageNum((prev: number) => Math.max(1, prev - 1))}
                    disabled={employeeInsuranceListLoading || Number(employeeInsuranceLedgerPage?.current ?? 1) <= 1}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setInsuranceLedgerPageNum((prev: number) => prev + 1)}
                    disabled={
                      employeeInsuranceListLoading
                      || Number(employeeInsuranceLedgerPage?.current ?? 1) >= Math.max(Number(employeeInsuranceLedgerPage?.pages ?? 1), 1)
                    }
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          )}

          {employeeInsuranceListLoading && (
            <WorkspaceInlineState type="loading" title="正在加载员工社保台账..." className="mt-4 py-4" />
          )}
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="调薪履历"
          headerAside={currentEmployeeRecord ? (
            <Button variant="outline" onClick={() => void loadEmployeeAdjustmentHistory(currentEmployeeRecord.employeeId)}>
              <RefreshCcw size={14} className="mr-2" />
              刷新履历
            </Button>
          ) : undefined}
        >
          {!currentEmployeeRecord && !employeeAdjustmentHistoryLoading && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center text-sm text-slate-500">
              选择员工后查看履历
            </div>
          )}

          {currentEmployeeRecord && (
            <div className="space-y-4">
              <WorkspaceMetricStrip items={adjustmentHistoryStripItems} />

              <WorkspaceDiagnosticSummary
                summary={employeeAdjustmentHistoryDiagnostics.riskSummary}
                items={employeeAdjustmentHistoryDiagnostics.riskItems}
                className="mt-0"
              />

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>申请编号</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>调薪变化</TableHead>
                      <TableHead>生效日期</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>校验</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEmployeeAdjustmentHistory.map((item: any) => {
                      const amount = Number(item.adjustmentAmount || 0);
                      const rowIssues = employeeAdjustmentHistoryDiagnostics.rowIssueMap.get(item.id) || [];
                      const matchedArchive = employeeAdjustmentHistoryDiagnostics.matchedArchiveMap.get(item.id) || null;
                      const rowClassName = rowIssues.length
                        ? 'cursor-pointer bg-slate-50/70 hover:bg-slate-50 dark:bg-slate-900/40 dark:hover:bg-slate-900/55'
                        : 'cursor-pointer hover:bg-slate-50';

                      return (
                        <TableRow
                          key={item.id}
                          className={rowClassName}
                          onClick={() => openAdjustmentFromHistory(item.id)}
                        >
                          <TableCell>
                            <div className="font-medium text-slate-900">{item.applicationNo}</div>
                            <div className="mt-1 text-xs text-slate-400">
                              {item.adjustmentReason || '-'}
                            </div>
                          </TableCell>
                          <TableCell>{adjustmentTypeLabel(item.adjustmentType)}</TableCell>
                          <TableCell>
                            <div className="font-medium text-slate-900">
                              {formatCurrency(item.beforeTotal)} → {formatCurrency(item.afterTotal)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {amount >= 0 ? '+' : ''}
                              {formatCurrency(item.adjustmentAmount)}
                              {Number.isFinite(Number(item.adjustmentRate))
                                ? ` / ${Number(item.adjustmentRate).toFixed(2)}%`
                                : ''}
                            </div>
                          </TableCell>
                          <TableCell>{toDateInputValue(item.effectiveDate) || '-'}</TableCell>
                          <TableCell>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${adjustmentStatusClass(item.status)}`}>
                              {adjustmentStatusLabel(item.status)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {rowIssues.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {rowIssues.map((issue: any) => (
                                  <span
                                    key={issue.key}
                                    className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300"
                                  >
                                    {issue.label}
                                  </span>
                                ))}
                                {matchedArchive && (
                                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                                    档案 #{matchedArchive.id}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!sortedEmployeeAdjustmentHistory.length && !employeeAdjustmentHistoryLoading && (
                      <WorkspaceTableStateRow colSpan={6} title="无调薪履历" />
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {employeeAdjustmentHistoryLoading && (
            <WorkspaceInlineState type="loading" title="正在加载调薪履历..." className="mt-4 py-4" />
          )}
        </WorkspaceSectionCard>
      </div>
    </div>
  );
};

export const SalaryAdjustmentsSection: React.FC<SectionProps> = ({ components, viewModel }) => {
  const {
    WorkspaceSectionCard,
    WorkspaceMetricStrip,
    WorkspaceDiagnosticSummary,
    WorkspaceInlineState,
    WorkspaceInlineRiskList,
    DetailRow,
    SalaryDiffTable,
  } = components;
  const {
    ALL_VALUE,
    loading,
    adjustmentKeyword,
    setAdjustmentKeyword,
    adjustmentStatusFilter,
    setAdjustmentStatusFilter,
    adjustmentTypeFilter,
    setAdjustmentTypeFilter,
    adjustmentEmployeeFilter,
    setAdjustmentEmployeeFilter,
    adjustmentEmployeeOptions,
    adjustmentEffectiveStart,
    setAdjustmentEffectiveStart,
    adjustmentEffectiveEnd,
    setAdjustmentEffectiveEnd,
    currentEmployeeRecord,
    currentSelectedEmployeeLabel,
    selectedEmployeeId,
    currentAdjustmentFilterEmployee,
    salaryAdjustments,
    filteredAdjustments,
    adjustmentListDiagnostics,
    selectedAdjustmentId,
    setSelectedAdjustmentId,
    adjustmentStatusClass,
    adjustmentStatusLabel,
    adjustmentTypeLabel,
    formatCurrency,
    adjustmentListLoading,
    adjustmentDetail,
    canSubmitAdjustment,
    handleSubmitAdjustment,
    canApproveAdjustment,
    handleApproveAdjustment,
    canEffectiveAdjustment,
    handleEffectiveAdjustment,
    actionLoading,
    adjustmentDetailLoading,
    adjustmentActionDiagnostics,
    adjustmentEmployeeSalaryLoading,
    loadAdjustmentEmployeeSalaryContext,
    focusAdjustmentEmployeeWorkspace,
    adjustmentClosureInsight,
    adjustmentEmployeeSalaryDetail,
    adjustmentCurrentSalaryMatched,
    adjustmentMatchedArchive,
    salaryArchiveStatusLabel,
    adjustmentCurrentTotalDelta,
    adjustmentDiffRows,
  } = viewModel;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <WorkspaceSectionCard title="调薪申请列表">
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-10"
              placeholder="搜索申请单号、员工姓名、工号"
              value={adjustmentKeyword}
              onChange={event => setAdjustmentKeyword(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Select value={adjustmentStatusFilter} onValueChange={setAdjustmentStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
                <SelectItem value="DRAFT">草稿</SelectItem>
                <SelectItem value="APPROVING">审批中</SelectItem>
                <SelectItem value="APPROVED">已通过</SelectItem>
                <SelectItem value="EFFECTIVE">已生效</SelectItem>
                <SelectItem value="REJECTED">已拒绝</SelectItem>
              </SelectContent>
            </Select>

            <Select value={adjustmentTypeFilter} onValueChange={setAdjustmentTypeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部类型</SelectItem>
                {viewModel.adjustmentTypeOptions.map((option: any) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={adjustmentEmployeeFilter} onValueChange={setAdjustmentEmployeeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部员工</SelectItem>
                {adjustmentEmployeeOptions.map((option: any) => (
                  <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DatePicker
              type="date"
              value={adjustmentEffectiveStart}
              onChange={event => setAdjustmentEffectiveStart(event.target.value)}
            />
            <DatePicker
              type="date"
              value={adjustmentEffectiveEnd}
              onChange={event => setAdjustmentEffectiveEnd(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="text-xs text-slate-500">
              {currentEmployeeRecord ? currentSelectedEmployeeLabel : '未锁定员工'}
            </div>
            <Button
              variant={selectedEmployeeId && adjustmentEmployeeFilter === selectedEmployeeId ? 'secondary' : 'outline'}
              size="sm"
              disabled={!selectedEmployeeId}
              onClick={() => {
                if (!selectedEmployeeId) return;
                setAdjustmentEmployeeFilter(selectedEmployeeId);
              }}
            >
              只看当前员工
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              调薪单 {salaryAdjustments.length} 条
              {currentAdjustmentFilterEmployee ? ` / ${buildEmployeeLabel(currentAdjustmentFilterEmployee)}` : ''}
              {adjustmentKeyword.trim() ? ` / 筛后 ${filteredAdjustments.length} 条` : ''}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdjustmentKeyword('');
                setAdjustmentStatusFilter(ALL_VALUE);
                setAdjustmentTypeFilter(ALL_VALUE);
                setAdjustmentEmployeeFilter(ALL_VALUE);
                setAdjustmentEffectiveStart('');
                setAdjustmentEffectiveEnd('');
              }}
            >
              清空筛选
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
            <span>已落现薪 {adjustmentListDiagnostics.matchedCurrentCount}</span>
            <span>过期 {adjustmentListDiagnostics.pendingPastDueCount}</span>
            <span>现薪未追平 {adjustmentListDiagnostics.currentMismatchCount}</span>
            <span>同日多单 / 未来生效 {adjustmentListDiagnostics.duplicateEmployeeDateGroups.length} / {adjustmentListDiagnostics.futureEffectiveCount}</span>
          </div>

          <WorkspaceDiagnosticSummary
            summary={adjustmentListDiagnostics.riskSummary}
            items={adjustmentListDiagnostics.riskItems}
          />

          <div className="space-y-3">
            {filteredAdjustments.map((item: any) => {
              const isActive = String(item.id) === selectedAdjustmentId;
              const rowIssues = adjustmentListDiagnostics.rowIssueMap.get(item.id) || [];
              const itemClassName = rowIssues.some((issue: any) => issue.severity === 'danger')
                ? 'border-slate-300 bg-slate-50 shadow-sm hover:border-slate-400 hover:bg-slate-50'
                : rowIssues.length
                  ? 'border-slate-300 bg-slate-50 shadow-sm hover:border-slate-400 hover:bg-slate-50'
                  : isActive
                    ? 'border-slate-300 bg-slate-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50';

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    isActive && !rowIssues.length ? 'border-slate-300 bg-slate-50 shadow-sm' : itemClassName
                  }`}
                  onClick={() => setSelectedAdjustmentId(String(item.id))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{item.applicationNo}</div>
                      <div className="mt-1 text-sm text-slate-600">{item.employeeName || `员工 #${item.employeeId}`}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {[item.employeeNo, adjustmentTypeLabel(item.adjustmentType)].filter(Boolean).join(' / ')}
                      </div>
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${adjustmentStatusClass(item.status)}`}>
                      {adjustmentStatusLabel(item.status)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{formatCurrency(item.afterTotal)}</span>
                    <span>生效 {toDateInputValue(item.effectiveDate) || '-'}</span>
                  </div>
                  {rowIssues.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {rowIssues.map((issue: any) => (
                        <span
                          key={issue.key}
                          className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300"
                        >
                          {issue.label}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}

            {!filteredAdjustments.length && !adjustmentListLoading && (
              <WorkspaceInlineState title="无调薪单" className="py-12" />
            )}

            {(adjustmentListLoading || loading) && (
              <WorkspaceInlineState type="loading" title="正在加载调薪申请..." className="py-12" />
            )}
          </div>
        </div>
      </WorkspaceSectionCard>

      <div className="space-y-6">
        <WorkspaceSectionCard
          title="调薪详情"
          headerAside={adjustmentDetail ? (
            <>
              <Button
                variant="outline"
                disabled={!canSubmitAdjustment || actionLoading}
                onClick={() => void handleSubmitAdjustment()}
              >
                提交审批
              </Button>
              <Button
                variant="outline"
                disabled={!canApproveAdjustment || actionLoading}
                onClick={() => void handleApproveAdjustment()}
              >
                审批通过
              </Button>
              <Button
                disabled={!canEffectiveAdjustment || actionLoading}
                onClick={() => void handleEffectiveAdjustment()}
              >
                执行生效
              </Button>
            </>
          ) : undefined}
        >
          {!adjustmentDetail && !adjustmentDetailLoading && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center text-sm text-slate-500">
              选择调薪单
            </div>
          )}

          {adjustmentDetail && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                <DetailRow label="申请编号" value={adjustmentDetail.applicationNo} />
                <DetailRow
                  label="员工"
                  value={`${adjustmentDetail.employeeName || '-'} / ${adjustmentDetail.employeeNo || '-'}`}
                />
                <DetailRow
                  label="类型 / 状态"
                  value={(
                    <div className="flex flex-col items-end gap-2">
                      <span>{adjustmentTypeLabel(adjustmentDetail.adjustmentType)}</span>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${adjustmentStatusClass(adjustmentDetail.status)}`}>
                        {adjustmentStatusLabel(adjustmentDetail.status)}
                      </span>
                    </div>
                  )}
                />
                <DetailRow
                  label="生效日期"
                  value={toDateInputValue(adjustmentDetail.effectiveDate) || '-'}
                />
                <DetailRow label="流程实例" value={adjustmentDetail.processInstanceId || '-'} />
                <DetailRow label="调薪前总额" value={formatCurrency(adjustmentDetail.beforeTotal)} />
                <DetailRow label="调薪后总额" value={formatCurrency(adjustmentDetail.afterTotal)} />
                <DetailRow
                  label="调薪金额"
                  value={formatCurrency(adjustmentDetail.adjustmentAmount)}
                />
                <DetailRow
                  label="调薪比例"
                  value={
                    Number.isFinite(Number(adjustmentDetail.adjustmentRate))
                      ? `${Number(adjustmentDetail.adjustmentRate).toFixed(2)}%`
                      : '-'
                  }
                />
              </div>

              {adjustmentActionDiagnostics && (
                <div className="rounded-lg border border-slate-200/80 bg-slate-50/55 p-3.5 dark:border-slate-800 dark:bg-slate-950/72">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {adjustmentActionDiagnostics.canRun ? `${adjustmentActionDiagnostics.actionLabel}校验` : '流程动作'}
                    </div>
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                      {adjustmentActionDiagnostics.riskSummary.label}
                    </span>
                  </div>

                  {adjustmentActionDiagnostics.riskItems.length ? (
                    <WorkspaceInlineRiskList items={adjustmentActionDiagnostics.riskItems} className="mt-4" />
                  ) : null}
                </div>
              )}

              <div className="rounded-lg border border-slate-200/80 bg-slate-50/55 p-3.5 dark:border-slate-800 dark:bg-slate-950/72">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="font-semibold text-slate-900">闭环</div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={adjustmentEmployeeSalaryLoading}
                      onClick={() => void loadAdjustmentEmployeeSalaryContext(adjustmentDetail.employeeId)}
                    >
                      <RefreshCcw size={14} className="mr-2" />
                      刷新闭环
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void focusAdjustmentEmployeeWorkspace(adjustmentDetail.employeeId)}
                    >
                      查看员工现薪
                    </Button>
                  </div>
                </div>

                {adjustmentEmployeeSalaryLoading ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                    正在读取调薪对应员工的现薪与档案历史...
                  </div>
                ) : (
                  <>
                    <WorkspaceMetricStrip
                      className="mt-4"
                      items={[
                        {
                          key: 'stage',
                          label: '流程阶段',
                          value: adjustmentClosureInsight?.stageLabel || '-',
                        },
                        {
                          key: 'landing',
                          label: '档案落地',
                          value: adjustmentClosureInsight?.landingLabel || '-',
                          tone: adjustmentClosureInsight?.landingTone === 'emerald'
                            ? 'emerald'
                            : adjustmentClosureInsight?.landingTone === 'amber'
                              ? 'amber'
                              : adjustmentClosureInsight?.landingTone === 'sky'
                                ? 'sky'
                                : adjustmentClosureInsight?.landingTone === 'rose'
                                  ? 'rose'
                                  : 'default',
                        },
                        {
                          key: 'target',
                          label: '目标结果',
                          value: formatCurrency(adjustmentDetail.afterTotal),
                        },
                        {
                          key: 'current',
                          label: '当前现薪',
                          value: adjustmentEmployeeSalaryDetail
                            ? formatCurrency(adjustmentEmployeeSalaryDetail.totalSalary)
                            : '-',
                          tone: adjustmentCurrentSalaryMatched
                            ? 'emerald'
                            : adjustmentEmployeeSalaryDetail
                              ? 'sky'
                              : 'default',
                        },
                      ]}
                    />

                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/72">
                      <DetailRow
                        label="档案匹配"
                        value={adjustmentMatchedArchive
                          ? `#${adjustmentMatchedArchive.id} / ${salaryArchiveStatusLabel(adjustmentMatchedArchive.status, adjustmentMatchedArchive.statusDesc)}`
                          : '未命中目标档案'}
                        valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
                      />
                      {adjustmentEmployeeSalaryDetail && adjustmentCurrentTotalDelta != null ? (
                        <DetailRow
                          label="当前总额差"
                          value={adjustmentCurrentTotalDelta === 0
                            ? '一致'
                            : `${adjustmentCurrentTotalDelta > 0 ? '高于' : '低于'} ${formatCurrency(Math.abs(adjustmentCurrentTotalDelta))}`}
                          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
                        />
                      ) : null}
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-lg border border-slate-200/80 bg-slate-50/55 p-3.5 dark:border-slate-800 dark:bg-slate-950/72">
                <div className="text-xs text-slate-400">调薪原因</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {adjustmentDetail.adjustmentReason || '-'}
                </div>
              </div>

              <SalaryDiffTable rows={adjustmentDiffRows} />
            </div>
          )}

          {adjustmentDetailLoading && (
            <WorkspaceInlineState type="loading" title="正在加载调薪详情..." className="mt-4 py-4" />
          )}
        </WorkspaceSectionCard>
      </div>
    </div>
  );
};
