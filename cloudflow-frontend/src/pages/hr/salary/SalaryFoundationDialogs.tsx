import React from 'react';
import { Button, DatePicker, DictSelect, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { cn } from '@/utils/cn';

type DialogComponents = {
  WorkspaceDialogShell: React.ComponentType<any>;
  WorkspaceInlineRiskList: React.ComponentType<any>;
  DetailRow: React.ComponentType<any>;
};

type DialogProps = {
  components: DialogComponents;
  viewModel: any;
};

const getBlockingRiskItems = (
  items: Array<{ key: string; title: string; detail: string; severity?: 'warning' | 'danger' }>,
) => items.filter(item => item.severity === 'danger');

export const SalaryItemDialog: React.FC<DialogProps> = ({ components, viewModel }) => {
  const {
    WorkspaceDialogShell,
    WorkspaceInlineRiskList,
    DetailRow,
  } = components;
  const {
    open,
    editingItemId,
    close,
    itemForm,
    setItemForm,
    itemTypeOptions,
    itemCategoryOptions,
    statusOptions,
    itemFormDiagnostics,
    itemCategoryLabel,
    itemTypeLabel,
    actionLoading,
    submit,
  } = viewModel;

  if (!open) return null;

  return (
    <WorkspaceDialogShell
      title={editingItemId ? '编辑薪资项目' : '新建薪资项目'}
      onClose={close}
      width="normal"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label>项目编码</Label>
          <Input value={itemForm.itemCode} onChange={event => setItemForm((prev: any) => ({ ...prev, itemCode: event.target.value }))} />
        </div>
        <div>
          <Label>项目名称</Label>
          <Input value={itemForm.itemName} onChange={event => setItemForm((prev: any) => ({ ...prev, itemName: event.target.value }))} />
        </div>
        <div>
          <Label>项目类型</Label>
          <Select value={itemForm.itemType} onValueChange={value => setItemForm((prev: any) => ({ ...prev, itemType: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {itemTypeOptions.map((option: any) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>项目分类</Label>
          <Select value={itemForm.category} onValueChange={value => setItemForm((prev: any) => ({ ...prev, category: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {itemCategoryOptions.map((option: any) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>是否计税</Label>
          <Select value={String(itemForm.isTaxable)} onValueChange={value => setItemForm((prev: any) => ({ ...prev, isTaxable: value === 'true' }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">计税</SelectItem>
              <SelectItem value="false">不计税</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>状态</Label>
          <Select value={String(itemForm.status ?? 1)} onValueChange={value => setItemForm((prev: any) => ({ ...prev, status: Number(value) }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((option: any) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>排序号</Label>
          <Input
            type="number"
            min={0}
            value={itemForm.sortOrder ?? 0}
            onChange={event => setItemForm((prev: any) => ({ ...prev, sortOrder: Number(event.target.value || 0) }))}
          />
        </div>
        <div className="md:col-span-2">
          <Label>计算公式</Label>
          <Textarea
            rows={4}
            value={itemForm.formula || ''}
            onChange={event => setItemForm((prev: any) => ({ ...prev, formula: event.target.value }))}
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden border border-slate-200 dark:border-slate-800">
        <DetailRow
          label="结构命中"
          value={itemFormDiagnostics.usage
            ? `${itemFormDiagnostics.usage.structureIds.size} 套结构 / ${itemFormDiagnostics.usage.activeEmployeeIds.size} 名员工 / ${itemFormDiagnostics.usage.activeArchiveCount} 条在岗档案${itemFormDiagnostics.usage.futureArchiveCount ? ` / 未来 ${itemFormDiagnostics.usage.futureArchiveCount} 条` : ''}`
            : '当前项目还没有被结构引用'}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
        <DetailRow
          label="当前口径"
          value={`${itemCategoryLabel(itemForm.category)} / ${itemTypeLabel(itemForm.itemType)} / ${itemForm.isTaxable ? '参与计税' : '不参与计税'}${itemForm.formula?.trim() ? ' / 已配公式' : ''}`}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
      </div>

      <WorkspaceInlineRiskList items={itemFormDiagnostics.riskItems} className="mt-4" />

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={close}>取消</Button>
        <Button disabled={actionLoading} onClick={() => void submit()}>
          {editingItemId ? '保存修改' : '创建项目'}
        </Button>
      </div>
    </WorkspaceDialogShell>
  );
};

export const SalaryStructureDialog: React.FC<DialogProps> = ({ components, viewModel }) => {
  const {
    WorkspaceDialogShell,
    WorkspaceInlineRiskList,
    DetailRow,
  } = components;
  const {
    open,
    editingStructureId,
    close,
    structureForm,
    setStructureForm,
    statusOptions,
    salaryItems,
    itemCategoryLabel,
    itemTypeLabel,
    structureFormDiagnostics,
    actionLoading,
    submit,
  } = viewModel;

  if (!open) return null;

  return (
    <WorkspaceDialogShell
      title={editingStructureId ? '编辑薪资结构' : '新建薪资结构'}
      onClose={close}
      width="wide"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label>结构编码</Label>
          <Input value={structureForm.structureCode} onChange={event => setStructureForm((prev: any) => ({ ...prev, structureCode: event.target.value }))} />
        </div>
        <div>
          <Label>结构名称</Label>
          <Input value={structureForm.structureName} onChange={event => setStructureForm((prev: any) => ({ ...prev, structureName: event.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <Label>结构描述</Label>
          <Textarea
            rows={4}
            value={structureForm.description || ''}
            onChange={event => setStructureForm((prev: any) => ({ ...prev, description: event.target.value }))}
          />
        </div>
        <div>
          <Label>状态</Label>
          <Select value={String(structureForm.status ?? 1)} onValueChange={value => setStructureForm((prev: any) => ({ ...prev, status: Number(value) }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((option: any) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>关联项目</Label>
          {salaryItems.length ? (
            <div className="mt-3 overflow-hidden border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800">
              <div className="grid grid-cols-1 gap-px bg-slate-200 dark:bg-slate-800 xl:grid-cols-2">
                {salaryItems.map((item: any) => {
                  const selected = structureForm.itemIds.includes(item.id);
                  const disabled = item.status === 0 && !selected;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={disabled}
                      className={cn(
                        'flex items-start justify-between gap-3 bg-[var(--cf-surface-strong)] px-3 py-3 text-left text-sm transition dark:bg-slate-950/72',
                        selected
                          ? 'text-slate-900 dark:text-slate-100'
                          : disabled
                            ? 'cursor-not-allowed text-slate-400 dark:text-slate-500'
                            : 'text-slate-700 hover:bg-[var(--cf-surface-muted)] dark:text-slate-200 dark:hover:bg-slate-900',
                      )}
                      onClick={() => setStructureForm((prev: any) => ({
                        ...prev,
                        itemIds: prev.itemIds.includes(item.id)
                          ? prev.itemIds.filter((itemId: number) => itemId !== item.id)
                          : [...prev.itemIds, item.id],
                      }))}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.itemName}</div>
                        <div className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
                          {[item.itemCode, itemCategoryLabel(item.category), itemTypeLabel(item.itemType)].filter(Boolean).join(' / ')}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={cn(
                          'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium',
                          item.isTaxable
                            ? 'border-slate-200 bg-[var(--cf-surface-strong)] text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300'
                            : 'border-slate-200 bg-[var(--cf-surface-strong)] text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300',
                        )}>
                          {item.isTaxable ? '计税' : '不计税'}
                        </span>
                        <span className={cn(
                          'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium',
                          selected
                            ? 'border-slate-200 bg-[var(--cf-surface-strong)] text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300'
                            : disabled
                              ? 'border-slate-200 bg-[var(--cf-surface-muted)] text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500'
                              : 'border-slate-200 bg-[var(--cf-surface-strong)] text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300',
                        )}>
                          {selected ? '已选' : item.status === 1 ? '可选' : '禁用'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-3 border border-dashed border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
              当前还没有可关联的薪资项目。
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden border border-slate-200 dark:border-slate-800">
        <DetailRow
          label="已选项目"
          value={`${structureFormDiagnostics.selectedItems.length} 个 / 计税 ${structureFormDiagnostics.taxableItems.length} 个 / 浮动 ${structureFormDiagnostics.variableItems.length} 个`}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
        <DetailRow
          label="历史命中"
          value={structureFormDiagnostics.activeUsage
            ? `${structureFormDiagnostics.activeUsage.employeeIds.size} 名员工 / ${structureFormDiagnostics.activeUsage.futureCount} 条未来生效`
            : '当前结构还没有在岗样本命中'}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
      </div>

      <WorkspaceInlineRiskList items={getBlockingRiskItems(structureFormDiagnostics.riskItems)} className="mt-4" />

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={close}>取消</Button>
        <Button disabled={actionLoading} onClick={() => void submit()}>
          {editingStructureId ? '保存修改' : '创建结构'}
        </Button>
      </div>
    </WorkspaceDialogShell>
  );
};

export const SalaryGradeDialog: React.FC<DialogProps> = ({ components, viewModel }) => {
  const {
    WorkspaceDialogShell,
    WorkspaceInlineRiskList,
    DetailRow,
  } = components;
  const {
    open,
    editingGradeLevelId,
    close,
    EMPTY_VALUE,
    gradeForm,
    setGradeForm,
    sortedJobLevels,
    gradeFormDiagnostics,
    formatCurrency,
    actionLoading,
    submit,
  } = viewModel;

  if (!open) return null;

  return (
    <WorkspaceDialogShell
      title={editingGradeLevelId ? '编辑薪资等级' : '设置薪资等级'}
      onClose={close}
      width="normal"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>职级</Label>
          <Select
            value={gradeForm.levelId ? String(gradeForm.levelId) : EMPTY_VALUE}
            onValueChange={value => setGradeForm((prev: any) => ({ ...prev, levelId: value === EMPTY_VALUE ? 0 : Number(value) }))}
          >
            <SelectTrigger><SelectValue placeholder="请选择职级" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
              {sortedJobLevels.map((level: any) => (
                <SelectItem key={level.id} value={String(level.id)}>
                  {[level.levelCode, level.levelName, level.levelSeries ? `${level.levelSeries} 序列` : ''].filter(Boolean).join(' / ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>最低薪资</Label>
          <Input type="number" min={0} value={gradeForm.minSalary} onChange={event => setGradeForm((prev: any) => ({ ...prev, minSalary: Number(event.target.value || 0) }))} />
        </div>
        <div>
          <Label>中位薪资</Label>
          <Input type="number" min={0} value={gradeForm.midSalary} onChange={event => setGradeForm((prev: any) => ({ ...prev, midSalary: Number(event.target.value || 0) }))} />
        </div>
        <div>
          <Label>最高薪资</Label>
          <Input type="number" min={0} value={gradeForm.maxSalary} onChange={event => setGradeForm((prev: any) => ({ ...prev, maxSalary: Number(event.target.value || 0) }))} />
        </div>
        <div>
          <Label>币种</Label>
          <DictSelect
            dictType="sys_currency"
            value={gradeForm.currency || 'CNY'}
            onChange={value => setGradeForm((prev: any) => ({ ...prev, currency: value }))}
            placeholder="选择币种"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden border border-slate-200 dark:border-slate-800">
        <DetailRow
          label="目标职级"
          value={gradeFormDiagnostics.selectedLevel
            ? [gradeFormDiagnostics.selectedLevel.levelCode, gradeFormDiagnostics.selectedLevel.levelName].filter(Boolean).join(' / ')
            : '请选择职级'}
          valueClassName="max-w-[72%] text-left text-slate-900 dark:text-slate-100"
        />
        <DetailRow
          label="覆盖变化"
          value={`${gradeFormDiagnostics.currentCoverageRate}% → ${gradeFormDiagnostics.nextCoverageRate}% / 序列 ${gradeFormDiagnostics.nextSeriesConfiguredCount}/${gradeFormDiagnostics.seriesTotal}`}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
        <DetailRow
          label="相邻薪级"
          value={[
            gradeFormDiagnostics.previousLevel && gradeFormDiagnostics.previousGrade
              ? `上一级 ${formatCurrency(gradeFormDiagnostics.previousGrade.minSalary)} - ${formatCurrency(gradeFormDiagnostics.previousGrade.maxSalary)}`
              : '上一级暂无样本',
            gradeFormDiagnostics.nextLevel && gradeFormDiagnostics.nextGrade
              ? `下一级 ${formatCurrency(gradeFormDiagnostics.nextGrade.minSalary)} - ${formatCurrency(gradeFormDiagnostics.nextGrade.maxSalary)}`
              : '下一级暂无样本',
          ].join(' / ')}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
      </div>

      <WorkspaceInlineRiskList items={getBlockingRiskItems(gradeFormDiagnostics.riskItems)} className="mt-4" />

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={close}>取消</Button>
        <Button disabled={actionLoading} onClick={() => void submit()}>
          {editingGradeLevelId ? '保存修改' : '保存薪级'}
        </Button>
      </div>
    </WorkspaceDialogShell>
  );
};

export const InsuranceSchemeDialog: React.FC<DialogProps> = ({ components, viewModel }) => {
  const {
    WorkspaceDialogShell,
    WorkspaceInlineRiskList,
    DetailRow,
  } = components;
  const {
    open,
    editingInsuranceSchemeId,
    close,
    insuranceSchemeForm,
    setInsuranceSchemeForm,
    statusOptions,
    formatPercent,
    insuranceSchemeFormDiagnostics,
    actionLoading,
    submit,
  } = viewModel;

  if (!open) return null;

  return (
    <WorkspaceDialogShell
      title={editingInsuranceSchemeId ? '编辑社保方案' : '新建社保方案'}
      onClose={close}
      width="wide"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label>方案名称</Label>
          <Input
            value={insuranceSchemeForm.schemeName}
            onChange={event => setInsuranceSchemeForm((prev: any) => ({ ...prev, schemeName: event.target.value }))}
          />
        </div>
        <div>
          <Label>适用城市</Label>
          <Input
            value={insuranceSchemeForm.city}
            onChange={event => setInsuranceSchemeForm((prev: any) => ({ ...prev, city: event.target.value }))}
          />
        </div>
        <div>
          <Label>生效日期</Label>
          <DatePicker
            type="date"
            value={insuranceSchemeForm.effectiveDate}
            onChange={event => setInsuranceSchemeForm((prev: any) => ({ ...prev, effectiveDate: event.target.value }))}
          />
        </div>
        <div>
          <Label>状态</Label>
          <Select
            value={String(insuranceSchemeForm.status ?? 1)}
            onValueChange={value => setInsuranceSchemeForm((prev: any) => ({ ...prev, status: Number(value) }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((option: any) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>基数下限</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={insuranceSchemeForm.baseMin}
            onChange={event => setInsuranceSchemeForm((prev: any) => ({ ...prev, baseMin: Number(event.target.value || 0) }))}
          />
        </div>
        <div>
          <Label>基数上限</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={insuranceSchemeForm.baseMax}
            onChange={event => setInsuranceSchemeForm((prev: any) => ({ ...prev, baseMax: Number(event.target.value || 0) }))}
          />
        </div>
        <div className="md:col-span-2">
          <Label>基数规则</Label>
          <Textarea
            rows={3}
            value={insuranceSchemeForm.baseRule || ''}
            onChange={event => setInsuranceSchemeForm((prev: any) => ({ ...prev, baseRule: event.target.value }))}
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">缴纳比例</div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['pensionCompanyRate', '养老公司比例'],
          ['pensionPersonalRate', '养老个人比例'],
          ['medicalCompanyRate', '医疗公司比例'],
          ['medicalPersonalRate', '医疗个人比例'],
          ['unemploymentCompanyRate', '失业公司比例'],
          ['unemploymentPersonalRate', '失业个人比例'],
          ['injuryCompanyRate', '工伤公司比例'],
          ['maternityCompanyRate', '生育公司比例'],
          ['housingFundCompanyRate', '公积金公司比例'],
          ['housingFundPersonalRate', '公积金个人比例'],
        ].map(([field, label]) => (
          <div key={field}>
            <Label>{label}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={(insuranceSchemeForm as any)[field] as number}
              onChange={event => setInsuranceSchemeForm((prev: any) => ({
                ...prev,
                [field]: Number(event.target.value || 0),
              }))}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden border border-slate-200 dark:border-slate-800">
        <DetailRow
          label="比例合计"
          value={`${formatPercent(insuranceSchemeFormDiagnostics.totalRate)} / 公司 ${formatPercent(insuranceSchemeFormDiagnostics.companyTotalRate)} / 个人 ${formatPercent(insuranceSchemeFormDiagnostics.personalTotalRate)}`}
          valueClassName="max-w-[72%] text-left text-slate-900 dark:text-slate-100"
        />
        <DetailRow
          label="台账命中"
          value={insuranceSchemeFormDiagnostics.usage
            ? `ACTIVE ${insuranceSchemeFormDiagnostics.usage.activeRecordCount} 条 / 在岗 ${insuranceSchemeFormDiagnostics.usage.activeEmployeeIds.size} 人 / 未来生效 ${insuranceSchemeFormDiagnostics.usage.futureRecordCount} 条`
            : '-'}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
      </div>

      <WorkspaceInlineRiskList items={getBlockingRiskItems(insuranceSchemeFormDiagnostics.riskItems)} className="mt-4" />

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={close}>取消</Button>
        <Button disabled={actionLoading} onClick={() => void submit()}>
          {editingInsuranceSchemeId ? '保存方案' : '创建方案'}
        </Button>
      </div>
    </WorkspaceDialogShell>
  );
};
