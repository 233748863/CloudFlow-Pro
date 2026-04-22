import React from 'react';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from '@/components/ui';
import { buildEmployeeLabel, toDateInputValue } from '../hrShared';

type DialogComponents = {
  WorkspaceDialogShell: React.ComponentType<any>;
  WorkspaceMetricStrip: React.ComponentType<any>;
  WorkspaceInlineRiskList: React.ComponentType<any>;
  DetailRow: React.ComponentType<any>;
  SalaryAmountEditor: React.ComponentType<any>;
};

type DialogProps = {
  components: DialogComponents;
  viewModel: any;
};

export const AssignSalaryDialog: React.FC<DialogProps> = ({ components, viewModel }) => {
  const {
    WorkspaceDialogShell,
    WorkspaceInlineRiskList,
    DetailRow,
    SalaryAmountEditor,
  } = components;
  const {
    open,
    EMPTY_VALUE,
    assignForm,
    setAssignForm,
    assignableEmployees,
    enabledSalaryStructures,
    getTodayValue,
    assignFormDiagnostics,
    formatCurrency,
    structurePreviewFields,
    assignTotal,
    actionLoading,
    close,
    submit,
  } = viewModel;

  if (!open) return null;

  return (
    <WorkspaceDialogShell
      title="分配员工薪资"
      onClose={close}
      width="wide"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <Label>员工</Label>
          <Select
            value={assignForm.employeeId ? String(assignForm.employeeId) : EMPTY_VALUE}
            onValueChange={value => setAssignForm((prev: any) => ({ ...prev, employeeId: value === EMPTY_VALUE ? 0 : Number(value) }))}
          >
            <SelectTrigger><SelectValue placeholder="请选择员工" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
              {assignableEmployees.map((employee: any) => (
                <SelectItem key={employee.id} value={String(employee.id)}>
                  {buildEmployeeLabel(employee)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-1 text-xs text-slate-400">
            {assignFormDiagnostics.selectedEmployee
              ? `${assignFormDiagnostics.selectedEmployee.deptName || '未分配部门'} / 入职 ${assignFormDiagnostics.hireDate || '-'}`
              : '-'}
          </div>
        </div>
        <div>
          <Label>薪资结构</Label>
          <Select
            value={assignForm.structureId ? String(assignForm.structureId) : EMPTY_VALUE}
            onValueChange={value => setAssignForm((prev: any) => ({ ...prev, structureId: value === EMPTY_VALUE ? 0 : Number(value) }))}
          >
            <SelectTrigger><SelectValue placeholder="请选择结构" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
              {enabledSalaryStructures.map((item: any) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {[item.structureName, item.structureCode].filter(Boolean).join(' / ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-1 text-xs text-slate-400">
            {assignFormDiagnostics.selectedStructureUsage
              ? `${assignFormDiagnostics.selectedStructureUsage.employeeIds.size} 名员工 / ${assignFormDiagnostics.selectedStructureUsage.archiveCount} 条档案`
              : '-'}
          </div>
        </div>
        <div>
          <Label>生效日期</Label>
          <Input
            type="date"
            value={assignForm.effectiveDate}
            max={getTodayValue()}
            onChange={event => setAssignForm((prev: any) => ({ ...prev, effectiveDate: event.target.value }))}
          />
          <div className="mt-1 text-xs text-slate-400">
            {assignFormDiagnostics.hireDate && assignForm.effectiveDate
              ? `${assignFormDiagnostics.hireDate === assignForm.effectiveDate ? '入职当天' : assignForm.effectiveDate < assignFormDiagnostics.hireDate ? '入职前' : '入职后'}`
              : '-'}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/72">
        <DetailRow
          label="保存动作"
          value={assignFormDiagnostics.modeLabel}
          valueClassName="max-w-[72%] text-left text-slate-900 dark:text-slate-100"
        />
        <DetailRow
          label="结构样本"
          value={assignFormDiagnostics.benchmarkStats.count
            ? `${assignFormDiagnostics.benchmarkStats.count} 条 / ${formatCurrency(assignFormDiagnostics.benchmarkStats.min)} - ${formatCurrency(assignFormDiagnostics.benchmarkStats.max)}`
            : '-'}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
        <DetailRow
          label="录入口径"
          value={`已录入 ${assignFormDiagnostics.filledItemCount} / ${assignFormDiagnostics.selectedItemCount} 项 / 固定 ${assignFormDiagnostics.fixedItemCount} 个 / 浮动 ${assignFormDiagnostics.variableItemCount} 个 / 正值 ${assignFormDiagnostics.positiveItemCount} 项${assignFormDiagnostics.positiveVariableItemCount > 0 ? ` / 浮动正值 ${assignFormDiagnostics.positiveVariableItemCount} 项` : ''}`}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
      </div>

      <WorkspaceInlineRiskList items={assignFormDiagnostics.riskItems} className="mt-4" />

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">薪资明细</h3>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
            合计 {formatCurrency(assignTotal)}
          </div>
        </div>

        <SalaryAmountEditor
          fields={structurePreviewFields}
          valueMap={assignForm.salaryData}
          onValueChange={(fieldKey: string, value: string) => setAssignForm((prev: any) => ({
            ...prev,
            salaryData: {
              ...prev.salaryData,
              [fieldKey]: value,
            },
          }))}
          emptyText="选择薪资结构后展开"
        />
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={close}>取消</Button>
        <Button disabled={actionLoading} onClick={() => void submit()}>确认分配</Button>
      </div>
    </WorkspaceDialogShell>
  );
};

export const CreateAdjustmentDialog: React.FC<DialogProps> = ({ components, viewModel }) => {
  const {
    WorkspaceDialogShell,
    WorkspaceMetricStrip,
    WorkspaceInlineRiskList,
    DetailRow,
    SalaryAmountEditor,
  } = components;
  const {
    open,
    EMPTY_VALUE,
    adjustForm,
    setAdjustForm,
    employeesWithSalary,
    adjustmentTypeOptions,
    adjustmentBaseline,
    adjustmentAfterTotal,
    adjustmentFormEmployee,
    adjustmentFormDiagnostics,
    formatCurrency,
    adjustmentEditorFields,
    actionLoading,
    close,
    submit,
  } = viewModel;

  if (!open) return null;

  return (
    <WorkspaceDialogShell
      title="发起调薪"
      onClose={close}
      width="wide"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <Label>员工</Label>
          <Select
            value={adjustForm.employeeId ? String(adjustForm.employeeId) : EMPTY_VALUE}
            onValueChange={value => setAdjustForm((prev: any) => ({ ...prev, employeeId: value === EMPTY_VALUE ? 0 : Number(value) }))}
          >
            <SelectTrigger><SelectValue placeholder="请选择员工" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
              {employeesWithSalary.map((employee: any) => (
                <SelectItem key={employee.id} value={String(employee.id)}>
                  {buildEmployeeLabel(employee)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>调薪类型</Label>
          <Select value={adjustForm.adjustmentType} onValueChange={value => setAdjustForm((prev: any) => ({ ...prev, adjustmentType: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {adjustmentTypeOptions.map((option: any) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>生效日期</Label>
          <Input
            type="date"
            value={adjustForm.effectiveDate}
            onChange={event => setAdjustForm((prev: any) => ({ ...prev, effectiveDate: event.target.value }))}
          />
        </div>
        <div className="md:col-span-2 xl:col-span-4">
          <Label>调薪原因</Label>
          <Textarea
            rows={4}
            value={adjustForm.adjustmentReason}
            onChange={event => setAdjustForm((prev: any) => ({ ...prev, adjustmentReason: event.target.value }))}
          />
        </div>
      </div>

      <WorkspaceMetricStrip
        className="mt-6"
        gridClassName="md:grid-cols-3"
        items={[
          {
            key: 'adjust-before-total',
            label: '调薪前总额',
            value: formatCurrency(adjustmentBaseline?.totalSalary),
          },
          {
            key: 'adjust-after-total',
            label: '调薪后总额',
            value: formatCurrency(adjustmentAfterTotal),
            tone: 'emerald',
          },
          {
            key: 'adjust-delta',
            label: '调薪差额',
            value: formatCurrency(adjustmentAfterTotal - Number(adjustmentBaseline?.totalSalary || 0)),
            tone: adjustmentAfterTotal >= Number(adjustmentBaseline?.totalSalary || 0) ? 'emerald' : 'rose',
          },
        ]}
      />

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/72">
        <DetailRow
          label="当前现薪"
          value={adjustmentFormEmployee
            ? `${buildEmployeeLabel(adjustmentFormEmployee)}${adjustmentBaseline ? ` / ${toDateInputValue(adjustmentBaseline.effectiveDate) || '-'} / ${formatCurrency(adjustmentBaseline.totalSalary)}` : ''}`
            : '-'}
          valueClassName="max-w-[72%] text-left text-slate-900 dark:text-slate-100"
        />
        <DetailRow
          label="创建动作"
          value={adjustmentFormDiagnostics.modeLabel}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
        <DetailRow
          label="变更规模"
          value={`${adjustmentFormDiagnostics.changedItemCount} 项 / 同日 ${adjustmentFormDiagnostics.sameDateAdjustments.length} 张 / 未来 ${adjustmentFormDiagnostics.futureAdjustments.length} 条`}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
      </div>

      <WorkspaceInlineRiskList items={adjustmentFormDiagnostics.riskItems} className="mt-4" />

      <div className="mt-6">
        <div className="mb-3">
          <h3 className="text-base font-semibold text-slate-900">调薪后明细</h3>
        </div>

        <SalaryAmountEditor
          fields={adjustmentEditorFields}
          valueMap={adjustForm.afterSalaryData}
          onValueChange={(fieldKey: string, value: string) => setAdjustForm((prev: any) => ({
            ...prev,
            afterSalaryData: {
              ...prev.afterSalaryData,
              [fieldKey]: value,
            },
          }))}
          emptyText="选择员工后带入明细"
        />
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={close}>取消</Button>
        <Button disabled={actionLoading} onClick={() => void submit()}>创建调薪申请</Button>
      </div>
    </WorkspaceDialogShell>
  );
};

export const InsuranceAssignDialog: React.FC<DialogProps> = ({ components, viewModel }) => {
  const {
    WorkspaceDialogShell,
  } = components;
  const {
    open,
    close,
    EMPTY_VALUE,
    currentEmployeeRecord,
    insuranceForm,
    setInsuranceForm,
    enabledInsuranceSchemes,
    selectedInsuranceScheme,
    getTodayValue,
    insuranceAssignDiagnostics,
    employeeInsuranceDetail,
    insuranceAssignPreview,
    formatCurrency,
    actionLoading,
    submit,
  } = viewModel;

  if (!open) return null;

  return (
    <WorkspaceDialogShell
      title="分配社保公积金方案"
      onClose={close}
      width="wide"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>员工</Label>
          <Input value={currentEmployeeRecord ? [currentEmployeeRecord.employeeName, currentEmployeeRecord.employeeNo].filter(Boolean).join(' / ') : ''} disabled />
        </div>
        <div>
          <Label>社保方案</Label>
          <Select
            value={insuranceForm.schemeId ? String(insuranceForm.schemeId) : EMPTY_VALUE}
            onValueChange={value => setInsuranceForm((prev: any) => ({ ...prev, schemeId: value === EMPTY_VALUE ? 0 : Number(value) }))}
          >
            <SelectTrigger><SelectValue placeholder="请选择方案" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
              {enabledInsuranceSchemes.map((item: any) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {[item.schemeName, item.city].filter(Boolean).join(' / ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>缴纳基数</Label>
          <Input
            type="number"
            min={0}
            value={insuranceForm.base || ''}
            onChange={event => setInsuranceForm((prev: any) => ({ ...prev, base: Number(event.target.value || 0) }))}
          />
        </div>
        <div>
          <Label>生效日期</Label>
          <Input
            type="date"
            value={insuranceForm.effectiveDate}
            max={getTodayValue()}
            onChange={event => setInsuranceForm((prev: any) => ({ ...prev, effectiveDate: event.target.value }))}
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="font-semibold text-slate-900">{selectedInsuranceScheme?.schemeName || '请选择社保方案'}</div>
        <div className="mt-2 grid grid-cols-1 gap-3 text-sm text-slate-600 md:grid-cols-3">
          <div>
            <div className="text-xs text-slate-400">适用城市</div>
            <div className="mt-1">{selectedInsuranceScheme?.city || '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">基数范围</div>
            <div className="mt-1">
              {selectedInsuranceScheme
                ? `${formatCurrency(selectedInsuranceScheme.baseMin)} - ${formatCurrency(selectedInsuranceScheme.baseMax)}`
                : '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">方案生效</div>
            <div className="mt-1">{toDateInputValue(selectedInsuranceScheme?.effectiveDate) || '-'}</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">{selectedInsuranceScheme?.baseRule || '-'}</div>
      </div>

      <div className={`mt-4 rounded-2xl border p-4 ${insuranceAssignDiagnostics.riskSummary.className}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="font-semibold text-current">
            {selectedInsuranceScheme ? '分配校验' : '校验'}
          </div>
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${insuranceAssignDiagnostics.riskSummary.className}`}>
            {insuranceAssignDiagnostics.riskSummary.label}
          </span>
        </div>

        {insuranceAssignDiagnostics.riskItems.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {insuranceAssignDiagnostics.riskItems.map((item: any) => (
              <span
                key={item.key}
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                  item.severity === 'danger'
                    ? 'border-rose-200 bg-white text-rose-700'
                    : 'border-amber-200 bg-white text-amber-700'
                }`}
              >
                {item.title}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">当前方案</div>
          <div className="mt-2 font-semibold text-slate-900">
            {insuranceAssignDiagnostics.currentActiveLedger?.schemeName || employeeInsuranceDetail?.schemeName || '-'}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {insuranceAssignDiagnostics.currentActiveLedger
              ? `${toDateInputValue(insuranceAssignDiagnostics.currentActiveLedger.effectiveDate) || '-'} / ${formatCurrency(insuranceAssignDiagnostics.currentActiveLedger.base)}`
              : employeeInsuranceDetail
                ? `${toDateInputValue(employeeInsuranceDetail.effectiveDate) || '-'} / ${formatCurrency(employeeInsuranceDetail.base)}`
                : '-'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">保存动作</div>
          <div className="mt-2 font-semibold text-slate-900">{insuranceAssignDiagnostics.modeLabel}</div>
          <div className="mt-1 text-xs text-slate-400">
            {insuranceAssignDiagnostics.sameDateRecords.length > 0
              ? `同日 ${insuranceAssignDiagnostics.sameDateRecords.length} 条`
              : '-'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">预计缴纳合计</div>
          <div className="mt-2 font-semibold text-slate-900">
            {insuranceAssignPreview ? formatCurrency(insuranceAssignPreview.totalAmount) : '-'}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            个人 {insuranceAssignPreview ? formatCurrency(insuranceAssignPreview.personalTotal) : '-'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            公司 {insuranceAssignPreview ? formatCurrency(insuranceAssignPreview.companyTotal) : '-'}
          </div>
        </div>
      </div>

      {insuranceAssignPreview && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>项目</TableHead>
                <TableHead>个人承担</TableHead>
                <TableHead>公司承担</TableHead>
                <TableHead>合计</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {insuranceAssignPreview.rows.map((row: any) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <div className="font-medium text-slate-900">{row.label}</div>
                  </TableCell>
                  <TableCell>{formatCurrency(row.personalAmount)}</TableCell>
                  <TableCell>{formatCurrency(row.companyAmount)}</TableCell>
                  <TableCell>{formatCurrency(row.totalAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={close}>取消</Button>
        <Button disabled={actionLoading} onClick={() => void submit()}>确认分配</Button>
      </div>
    </WorkspaceDialogShell>
  );
};
