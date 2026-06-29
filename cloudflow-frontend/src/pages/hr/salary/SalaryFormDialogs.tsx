import React from 'react';
import { Button, DatePicker, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
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
      <div className="admin-source-form-grid md:grid-cols-3">
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
        </div>
        <div>
          <Label>生效日期</Label>
          <DatePicker
            type="date"
            value={assignForm.effectiveDate}
            max={getTodayValue()}
            onChange={event => setAssignForm((prev: any) => ({ ...prev, effectiveDate: event.target.value }))}
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden border border-slate-200 dark:border-slate-800">
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

      <div className="admin-source-content-grid mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">薪资明细</h3>
          </div>
          <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
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
      <div className="admin-source-form-grid xl:grid-cols-4">
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
          <DatePicker
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
          },
          {
            key: 'adjust-delta',
            label: '调薪差额',
            value: formatCurrency(adjustmentAfterTotal - Number(adjustmentBaseline?.totalSalary || 0)),
          },
        ]}
      />

      <div className="mt-4 overflow-hidden border border-slate-200 dark:border-slate-800">
        <DetailRow
          label="当前现薪"
          value={adjustmentFormEmployee
            ? `${buildEmployeeLabel(adjustmentFormEmployee)}${adjustmentBaseline ? ` / ${toDateInputValue(adjustmentBaseline.effectiveDate) || '-'} / ${formatCurrency(adjustmentBaseline.totalSalary)}` : ''}`
            : '-'}
          valueClassName="max-w-[72%] text-left text-slate-900 dark:text-slate-100"
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
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">调薪后明细</h3>
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
    WorkspaceInlineRiskList,
    DetailRow,
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
      <div className="admin-source-form-grid">
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
          <DatePicker
            type="date"
            value={insuranceForm.effectiveDate}
            max={getTodayValue()}
            onChange={event => setInsuranceForm((prev: any) => ({ ...prev, effectiveDate: event.target.value }))}
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden border border-slate-200 dark:border-slate-800">
        <DetailRow
          label="选定方案"
          value={selectedInsuranceScheme?.schemeName || '-'}
          valueClassName="max-w-[72%] text-left text-slate-900 dark:text-slate-100"
        />
        <DetailRow
          label="适用口径"
          value={selectedInsuranceScheme
            ? [
              selectedInsuranceScheme.city || '-',
              `${formatCurrency(selectedInsuranceScheme.baseMin)} - ${formatCurrency(selectedInsuranceScheme.baseMax)}`,
              toDateInputValue(selectedInsuranceScheme.effectiveDate) || '-',
            ].join(' / ')
            : '-'}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
        <DetailRow
          label="当前台账"
          value={insuranceAssignDiagnostics.currentActiveLedger
            ? `${insuranceAssignDiagnostics.currentActiveLedger.schemeName || '-'} / ${toDateInputValue(insuranceAssignDiagnostics.currentActiveLedger.effectiveDate) || '-'} / ${formatCurrency(insuranceAssignDiagnostics.currentActiveLedger.base)}`
            : employeeInsuranceDetail
              ? `${employeeInsuranceDetail.schemeName || '-'} / ${toDateInputValue(employeeInsuranceDetail.effectiveDate) || '-'} / ${formatCurrency(employeeInsuranceDetail.base)}`
              : '-'}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
        <DetailRow
          label="预计缴纳"
          value={insuranceAssignPreview
            ? `${formatCurrency(insuranceAssignPreview.totalAmount)} / 个人 ${formatCurrency(insuranceAssignPreview.personalTotal)} / 公司 ${formatCurrency(insuranceAssignPreview.companyTotal)}`
            : '-'}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
      </div>

      <WorkspaceInlineRiskList items={insuranceAssignDiagnostics.riskItems} className="mt-4" />

      {insuranceAssignPreview && (
        <InnerTableSurface className="mt-4">
          <table className="unity-data-table admin-source-table min-w-[560px]">
            <thead>
              <tr>
                <th>项目</th>
                <th>个人承担</th>
                <th>公司承担</th>
                <th>合计</th>
              </tr>
            </thead>
            <tbody>
              {insuranceAssignPreview.rows.map((row: any) => (
                <tr key={row.key}>
                  <td>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{row.label}</div>
                  </td>
                  <td>{formatCurrency(row.personalAmount)}</td>
                  <td>{formatCurrency(row.companyAmount)}</td>
                  <td>{formatCurrency(row.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </InnerTableSurface>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={close}>取消</Button>
        <Button disabled={actionLoading} onClick={() => void submit()}>确认分配</Button>
      </div>
    </WorkspaceDialogShell>
  );
};
