import React from 'react';
import {
  Button,
  Input,
  Label,
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
  Textarea,
} from '@/components/ui';
import { cn } from '@/utils/cn';
import { toDateInputValue } from '../hrShared';

type DialogComponents = {
  WorkspaceDialogShell: React.ComponentType<any>;
  WorkspaceInlineState: React.ComponentType<any>;
  WorkspaceMetricStrip: React.ComponentType<any>;
  WorkspaceDiagnosticSummary: React.ComponentType<any>;
  WorkspaceInlineRiskList: React.ComponentType<any>;
  WorkspaceTableStateRow: React.ComponentType<any>;
  DetailRow: React.ComponentType<any>;
};

type DialogProps = {
  components: DialogComponents;
  viewModel: any;
};

const subtleBadgeToneMap = {
  neutral: {
    wrap: 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300',
    dot: 'bg-slate-400 dark:bg-slate-500',
  },
  primary: {
    wrap: 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300',
    dot: 'bg-teal-500 dark:bg-teal-400',
  },
  warning: {
    wrap: 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  danger: {
    wrap: 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300',
    dot: 'bg-rose-500 dark:bg-rose-400',
  },
} as const;

type SubtleBadgeTone = keyof typeof subtleBadgeToneMap;

const SubtleStatusBadge: React.FC<{
  tone?: SubtleBadgeTone;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'neutral', children, className }) => {
  const resolvedTone = subtleBadgeToneMap[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        resolvedTone.wrap,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', resolvedTone.dot)} />
      {children}
    </span>
  );
};

const SubtleRiskList: React.FC<{
  items: Array<{
    key: string;
    title: string;
    detail: string;
    severity?: 'warning' | 'danger';
  }>;
  className?: string;
}> = ({ items, className }) => {
  if (!items.length) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {items.map(item => (
        <div
          key={item.key}
          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/55 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40"
        >
          <span
            className={cn(
              'mt-1 inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full',
              item.severity === 'danger' ? 'bg-rose-500 dark:bg-rose-400' : 'bg-amber-500 dark:bg-amber-400',
            )}
          />
          <div className="min-w-0 flex-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-slate-100">{item.title}</span>
            <span>：{item.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export const TaxConfigDialog: React.FC<DialogProps> = ({ components, viewModel }) => {
  const {
    WorkspaceDialogShell,
    WorkspaceInlineState,
    WorkspaceMetricStrip,
    WorkspaceDiagnosticSummary,
  } = components;
  const {
    open,
    close,
    taxConfigForm,
    setTaxConfigForm,
    taxConfigDialogLoading,
    getTodayValue,
    deductionTypeOptions,
    taxConfigStandardDeductionTotal,
    formatCurrency,
    defaultTaxBracketJson,
    taxConfigBracketPreview,
    formatPercent,
    taxConfigDiagnostics,
    currentEmployeeRecord,
    currentSelectedEmployeeLabel,
    taxReferencePeriod,
    currentEmployeeEffectiveDate,
    taxConfigReferenceEntries,
    currentTaxConfigReferenceMap,
    actionLoading,
    submit,
  } = viewModel;

  if (!open) return null;

  return (
    <WorkspaceDialogShell
      title={taxConfigForm.id ? '个税配置' : '新建个税配置'}
      onClose={close}
      width="wide"
    >
      {taxConfigDialogLoading ? (
        <WorkspaceInlineState
          type="loading"
          title="正在加载个税配置..."
          className="px-6 py-16"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 font-semibold text-slate-900">基础参数</div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>起征点</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={taxConfigForm.threshold}
                  onChange={event => setTaxConfigForm((prev: any) => ({ ...prev, threshold: event.target.value }))}
                />
              </div>
              <div>
                <Label>生效日期</Label>
                <Input
                  type="date"
                  value={taxConfigForm.effectiveDate}
                  max={getTodayValue()}
                  onChange={event => setTaxConfigForm((prev: any) => ({ ...prev, effectiveDate: event.target.value }))}
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="font-semibold text-slate-900">专项附加扣除</div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {deductionTypeOptions.map((item: any) => (
                  <div key={item.value}>
                    <Label>{item.label}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={taxConfigForm.deductionItems[item.value] ?? ''}
                      onChange={event => setTaxConfigForm((prev: any) => ({
                        ...prev,
                        deductionItems: {
                          ...prev.deductionItems,
                          [item.value]: event.target.value,
                        },
                      }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="font-semibold text-slate-900">税率档配置</div>
              <Button
                variant="outline"
                onClick={() => setTaxConfigForm((prev: any) => ({ ...prev, taxBracketsJson: defaultTaxBracketJson }))}
              >
                恢复默认档
              </Button>
            </div>

            <WorkspaceMetricStrip
              className="mt-4"
              gridClassName="md:grid-cols-2 xl:grid-cols-4"
              items={[
                {
                  key: 'tax-threshold',
                  label: '起征点',
                  value: formatCurrency(taxConfigForm.threshold),
                },
                {
                  key: 'tax-effective-date',
                  label: '生效日期',
                  value: taxConfigForm.effectiveDate || '-',
                },
                {
                  key: 'tax-bracket-count',
                  label: '税率档数',
                  value: taxConfigBracketPreview.rows.length,
                },
                {
                  key: 'tax-max-rate',
                  label: '最高税率',
                  value: taxConfigBracketPreview.rows.length ? formatPercent(Number(taxConfigBracketPreview.maxRate) * 100) : '-',
                },
              ]}
            />

            <WorkspaceDiagnosticSummary
              summary={taxConfigDiagnostics.riskSummary}
              items={taxConfigDiagnostics.riskItems}
              emptyText="已对齐"
              className="mt-4"
            />

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-slate-900">样本</div>
                </div>

                {currentEmployeeRecord ? (
                  <WorkspaceMetricStrip
                    className="mt-4"
                    gridClassName="md:grid-cols-2"
                    items={[
                      {
                        key: 'sample-taxable-income',
                        label: '计税前收入',
                        value: formatCurrency(taxConfigDiagnostics.sampleTaxableIncome),
                      },
                      {
                        key: 'sample-taxable-amount',
                        label: '应纳税所得额',
                        value: formatCurrency(taxConfigDiagnostics.sampleTaxableAmount),
                      },
                      {
                        key: 'sample-matched-bracket',
                        label: '命中税档',
                        value: taxConfigDiagnostics.matchedBracket
                          ? `第 ${taxConfigDiagnostics.matchedBracketIndex + 1} 档 / ${formatPercent(Number(taxConfigDiagnostics.matchedBracket.rate || 0) * 100)}`
                          : '未命中',
                      },
                      {
                        key: 'sample-estimated-tax',
                        label: '预估个税 / 到手',
                        value: formatCurrency(taxConfigDiagnostics.estimatedTaxAmount),
                        hint: `到手 ${formatCurrency(taxConfigDiagnostics.estimatedAfterTaxIncome)}`,
                      },
                    ]}
                  />
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                    无样本
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
                <div className="font-semibold text-slate-900">参考</div>

                {taxConfigReferenceEntries.length > 0 ? (
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/72">
                    {taxConfigReferenceEntries.map((item: any) => (
                      <div key={item.type} className="border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-900">{item.label}</div>
                          <div className="text-sm font-semibold text-slate-900">
                            {formatCurrency(item.amount)}
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              当前 {formatCurrency(currentTaxConfigReferenceMap.get(item.type) || 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-400">
                    无参考值
                  </div>
                )}
              </div>
            </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
            <div className="text-sm font-medium text-slate-900">税率档 JSON 与预览</div>

            <Textarea
              className="mt-4 min-h-[260px] font-mono text-sm"
              value={taxConfigForm.taxBracketsJson}
              onChange={event => setTaxConfigForm((prev: any) => ({ ...prev, taxBracketsJson: event.target.value }))}
              placeholder='[{"min":0,"max":36000,"rate":0.03,"deduction":0}]'
            />

            {taxConfigBracketPreview.error ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                {taxConfigBracketPreview.error}
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>档位</TableHead>
                      <TableHead>起点</TableHead>
                      <TableHead>终点</TableHead>
                      <TableHead>税率</TableHead>
                      <TableHead>速算扣除数</TableHead>
                      <TableHead>样本</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxConfigBracketPreview.rows.map((item: any, index: number) => {
                      const matched = taxConfigDiagnostics.matchedBracketIndex === index;
                      const next = taxConfigDiagnostics.nextBracket
                        && taxConfigDiagnostics.nextBracket.min === item.min
                        && taxConfigDiagnostics.nextBracket.max === item.max
                        && taxConfigDiagnostics.nextBracket.rate === item.rate
                        && taxConfigDiagnostics.nextBracket.deduction === item.deduction;
                      const rowClassName = matched ? 'bg-slate-50/70 dark:bg-slate-900/45' : '';

                      return (
                        <TableRow key={`${item.min}-${item.max ?? 'none'}-${item.rate}-${index}`} className={rowClassName}>
                          <TableCell>第 {index + 1} 档</TableCell>
                          <TableCell>{formatCurrency(item.min)}</TableCell>
                          <TableCell>{item.max == null ? '无上限' : formatCurrency(item.max)}</TableCell>
                          <TableCell>{formatPercent(Number(item.rate || 0) * 100)}</TableCell>
                          <TableCell>{formatCurrency(item.deduction)}</TableCell>
                          <TableCell>
                            {matched ? (
                              <SubtleStatusBadge tone="primary">命中</SubtleStatusBadge>
                            ) : next ? (
                              <SubtleStatusBadge tone="warning">下一档</SubtleStatusBadge>
                            ) : (
                              <span className="text-xs text-slate-400">未命中</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={close}>取消</Button>
        <Button disabled={actionLoading || taxConfigDialogLoading} onClick={() => void submit()}>
          {taxConfigForm.id ? '保存配置' : '创建配置'}
        </Button>
      </div>
    </WorkspaceDialogShell>
  );
};

export const TaxDeductionDialog: React.FC<DialogProps> = ({ components, viewModel }) => {
  const {
    WorkspaceDialogShell,
    WorkspaceMetricStrip,
    WorkspaceTableStateRow,
    DetailRow,
  } = components;
  const {
    open,
    close,
    currentEmployeeRecord,
    employeeTaxDeductionDiagnostics,
    applyTaxDeductionReferenceTemplate,
    editingTaxDeductionId,
    resetTaxDeductionForm,
    taxDeductionForm,
    setTaxDeductionForm,
    deductionTypeLabel,
    EMPTY_VALUE,
    deductionTypeOptions,
    taxDeductionStatusOptions,
    taxDeductionFormDiagnostics,
    formatCurrency,
    actionLoading,
    submit,
    employeeTaxDeductionStats,
    taxReferencePeriod,
    taxDeductionRiskItems,
    taxDeductionTypeFilter,
    setTaxDeductionTypeFilter,
    taxDeductionFilterTypeOptions,
    taxDeductionStatusFilter,
    setTaxDeductionStatusFilter,
    taxDeductionScopeFilter,
    setTaxDeductionScopeFilter,
    taxDeductionScopeOptions,
    ALL_VALUE,
    filteredEmployeeAllTaxDeductions,
    taxDeductionListLoading,
    currentTaxConfigReferenceMap,
    compactTaxDeductionRemark,
    taxDeductionStatusLabel,
    activeTaxDeductionIds,
    openTaxDeductionEditDialog,
    handleDeleteTaxDeduction,
  } = viewModel;

  if (!open) return null;

  return (
    <WorkspaceDialogShell
      title="专项扣除"
      onClose={close}
      width="extra-wide"
      headerAside={(
        <>
          {employeeTaxDeductionDiagnostics.missingReferenceEntries.length > 0 && (
            <Button
              variant="outline"
              onClick={() => applyTaxDeductionReferenceTemplate(
                employeeTaxDeductionDiagnostics.missingReferenceEntries[0].type,
                employeeTaxDeductionDiagnostics.missingReferenceEntries[0].referenceAmount,
              )}
            >
              优先回填一条
            </Button>
          )}
          {editingTaxDeductionId && (
            <Button variant="outline" onClick={() => resetTaxDeductionForm(currentEmployeeRecord?.employeeId)}>
              新建一条
            </Button>
          )}
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-4">
            <div className="font-semibold text-slate-900">{editingTaxDeductionId ? '编辑专项扣除' : '新增专项扣除'}</div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>员工</Label>
              <Input value={currentEmployeeRecord ? [currentEmployeeRecord.employeeName, currentEmployeeRecord.employeeNo].filter(Boolean).join(' / ') : ''} disabled />
            </div>
            <div>
              <Label>扣除类型</Label>
              {editingTaxDeductionId ? (
                <Input value={deductionTypeLabel(taxDeductionForm.deductionType)} disabled />
              ) : (
                <Select
                  value={taxDeductionForm.deductionType || EMPTY_VALUE}
                  onValueChange={value => setTaxDeductionForm((prev: any) => ({ ...prev, deductionType: value === EMPTY_VALUE ? '' : value }))}
                >
                  <SelectTrigger><SelectValue placeholder="请选择扣除类型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
                    {deductionTypeOptions.map((item: any) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>状态</Label>
              {editingTaxDeductionId ? (
                <Select
                  value={taxDeductionForm.status || 'ACTIVE'}
                  onValueChange={value => setTaxDeductionForm((prev: any) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger><SelectValue placeholder="请选择状态" /></SelectTrigger>
                  <SelectContent>
                    {taxDeductionStatusOptions.map((item: any) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value="生效中" disabled />
              )}
            </div>
            <div>
              <Label>月扣除金额</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={taxDeductionForm.amount || ''}
                onChange={event => setTaxDeductionForm((prev: any) => ({ ...prev, amount: Number(event.target.value || 0) }))}
              />
            </div>
            <div>
              <Label>开始日期</Label>
              <Input
                type="date"
                value={taxDeductionForm.startDate}
                onChange={event => setTaxDeductionForm((prev: any) => ({ ...prev, startDate: event.target.value }))}
              />
            </div>
            <div>
              <Label>结束日期</Label>
              <Input
                type="date"
                value={taxDeductionForm.endDate}
                min={taxDeductionForm.startDate || undefined}
                onChange={event => setTaxDeductionForm((prev: any) => ({ ...prev, endDate: event.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <Label>备注</Label>
              <Textarea
                rows={4}
                value={taxDeductionForm.remark}
                onChange={event => setTaxDeductionForm((prev: any) => ({ ...prev, remark: event.target.value }))}
                placeholder="备注"
              />
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/72">
            <DetailRow
              label="本月命中"
              value={`${taxDeductionFormDiagnostics.proposedInScope ? '命中' : '未命中'} / 当前 ${taxDeductionFormDiagnostics.sameTypeCurrentScopeCount} / 保存后 ${taxDeductionFormDiagnostics.predictedInScopeCount} / ${formatCurrency(taxDeductionFormDiagnostics.predictedInScopeAmount)}`}
              valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
            />
            <DetailRow
              label="参考与历史"
              value={`${taxDeductionFormDiagnostics.referenceAmount > 0 ? formatCurrency(taxDeductionFormDiagnostics.referenceAmount) : '-'} / 历史 ${taxDeductionFormDiagnostics.sameTypeHistoryCount} / ACTIVE ${taxDeductionFormDiagnostics.sameTypeActiveCount}${taxDeductionFormDiagnostics.overlappingActiveCount > 0 ? ` / 重叠 ${taxDeductionFormDiagnostics.overlappingActiveCount}` : ''}`}
              valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
            />
          </div>

          <SubtleRiskList items={taxDeductionFormDiagnostics.riskItems} className="mt-4" />

          <div className="mt-6 flex justify-end gap-3">
            {editingTaxDeductionId && (
              <Button variant="outline" onClick={() => resetTaxDeductionForm(currentEmployeeRecord?.employeeId)}>
                取消编辑
              </Button>
            )}
            <Button disabled={actionLoading} onClick={() => void submit()}>
              {editingTaxDeductionId ? '保存修改' : '确认新增'}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">个税参考</div>
            </div>
            <div className="text-xs text-slate-400">{employeeTaxDeductionStats.matched} / {employeeTaxDeductionStats.total} 条</div>
          </div>

          <WorkspaceMetricStrip
            className="mt-4"
            gridClassName="md:grid-cols-2 xl:grid-cols-4"
            items={[
              {
                key: 'deduction-total',
                label: '全部记录',
                value: employeeTaxDeductionStats.total,
              },
              {
                key: 'deduction-active',
                label: 'ACTIVE',
                value: employeeTaxDeductionStats.active,
              },
              {
                key: 'deduction-inscope',
                label: `命中 ${taxReferencePeriod}`,
                value: employeeTaxDeductionStats.inScope,
              },
              {
                key: 'deduction-amount',
                label: '当月扣除合计',
                value: formatCurrency(employeeTaxDeductionStats.currentAmount),
              },
            ]}
          />

          <SubtleRiskList items={taxDeductionRiskItems} className="mt-4" />

          {employeeTaxDeductionDiagnostics.referenceEntries.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/72">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-slate-100">参考值对照</div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>参考值</TableHead>
                    <TableHead>本月</TableHead>
                    <TableHead>历史</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeTaxDeductionDiagnostics.referenceEntries.map((item: any) => {
                    const statusLabel = item.hasDuplicateInScope
                      ? '重复命中'
                      : item.hasOverlap
                        ? '区间重叠'
                        : item.inScopeCount > 0
                          ? '已命中'
                          : item.activeCount > 0
                            ? 'ACTIVE 未命中'
                            : item.referenceAmount > 0
                            ? '待补录'
                            : '未配置';
                    const statusTone: SubtleBadgeTone = item.hasDuplicateInScope || item.hasOverlap
                      ? 'danger'
                      : item.inScopeCount > 0
                        ? 'primary'
                        : item.activeCount > 0 || item.referenceAmount > 0
                          ? 'warning'
                          : 'neutral';

                    return (
                      <TableRow key={item.type}>
                        <TableCell>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.label}</div>
                        </TableCell>
                        <TableCell>{item.referenceAmount > 0 ? formatCurrency(item.referenceAmount) : '未配置'}</TableCell>
                        <TableCell>
                          {item.inScopeCount ? `${item.inScopeCount} / ${formatCurrency(item.inScopeAmount)}` : '0'}
                        </TableCell>
                        <TableCell>
                          {item.totalCount}
                          {item.activeOutOfScopeCount ? ` / 未入月 ${item.activeOutOfScopeCount}` : ''}
                        </TableCell>
                        <TableCell>
                          <SubtleStatusBadge tone={statusTone}>{statusLabel}</SubtleStatusBadge>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.latestInScopeRecord ? (
                            <Button variant="outline" size="sm" onClick={() => openTaxDeductionEditDialog(item.latestInScopeRecord!)}>
                              编辑
                            </Button>
                          ) : item.referenceAmount > 0 ? (
                            <Button variant="outline" size="sm" onClick={() => applyTaxDeductionReferenceTemplate(item.type, item.referenceAmount)}>
                              回填
                            </Button>
                          ) : item.latestRecord ? (
                            <Button variant="outline" size="sm" onClick={() => openTaxDeductionEditDialog(item.latestRecord!)}>
                              编辑最近
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" disabled>
                              -
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">专项扣除记录</div>
            </div>
            <div className="text-xs text-slate-400">{filteredEmployeeAllTaxDeductions.length} 条结果</div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:grid-cols-[minmax(0,180px)_minmax(0,180px)_minmax(0,180px)_auto] xl:items-center">
            <div>
              <Select value={taxDeductionTypeFilter} onValueChange={setTaxDeductionTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>全部扣除项</SelectItem>
                  {taxDeductionFilterTypeOptions.map((option: any) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={taxDeductionStatusFilter} onValueChange={setTaxDeductionStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
                  {taxDeductionStatusOptions.map((option: any) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={taxDeductionScopeFilter} onValueChange={setTaxDeductionScopeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>全部测算范围</SelectItem>
                  {taxDeductionScopeOptions.map((option: any) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="justify-center xl:justify-self-end"
              onClick={() => {
                setTaxDeductionTypeFilter(ALL_VALUE);
                setTaxDeductionStatusFilter(ALL_VALUE);
                setTaxDeductionScopeFilter(ALL_VALUE);
              }}
            >
              清空筛选
            </Button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>扣除项</TableHead>
                  <TableHead>月金额</TableHead>
                  <TableHead>生效区间</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>状态 / 异常</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployeeAllTaxDeductions.map((item: any) => {
                  const rowIssues = employeeTaxDeductionDiagnostics.rowIssueMap.get(item.id) || [];
                  const referenceAmount = Number(currentTaxConfigReferenceMap.get(item.deductionType) || 0);

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{item.deductionTypeName || deductionTypeLabel(item.deductionType)}</div>
                        <div className="mt-1 text-xs text-slate-400">{compactTaxDeductionRemark(item.remark)}</div>
                      </TableCell>
                      <TableCell>{formatCurrency(item.amount)}</TableCell>
                      <TableCell>
                        <div>{toDateInputValue(item.startDate) || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">截止 {toDateInputValue(item.endDate) || '长期有效'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <SubtleStatusBadge tone={item.status === 'ACTIVE' ? 'primary' : 'neutral'} className="w-fit">
                            {taxDeductionStatusLabel(item.status)}
                          </SubtleStatusBadge>
                          {activeTaxDeductionIds.has(item.id) && (
                            <SubtleStatusBadge tone="primary" className="w-fit">当月</SubtleStatusBadge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {referenceAmount > 0 && (
                            <SubtleStatusBadge>参考 {formatCurrency(referenceAmount)}</SubtleStatusBadge>
                          )}
                          {rowIssues.map((issue: any) => (
                            <SubtleStatusBadge
                              key={issue.key}
                              tone={issue.severity === 'danger' ? 'danger' : 'warning'}
                            >
                              {issue.label}
                            </SubtleStatusBadge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => openTaxDeductionEditDialog(item)}>
                            编辑
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void handleDeleteTaxDeduction(item)}
                          >
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filteredEmployeeAllTaxDeductions.length && !taxDeductionListLoading && (
                  <WorkspaceTableStateRow colSpan={6} title="无专项扣除" />
                )}
                {taxDeductionListLoading && (
                  <WorkspaceTableStateRow
                    type="loading"
                    colSpan={6}
                    title="正在加载专项扣除记录..."
                    rowClassName="border-white/60 hover:bg-transparent"
                    cellClassName="px-4 py-10"
                  />
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </WorkspaceDialogShell>
  );
};
