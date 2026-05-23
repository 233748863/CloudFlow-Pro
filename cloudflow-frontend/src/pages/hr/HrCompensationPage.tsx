import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import {
  EmployeeInsurance,
  EmployeeSalary,
  EmployeeTaxDeduction,
  HrEmployee,
  HrRecord,
  InsuranceScheme,
  SalaryAdjustment,
  SalaryGrade,
  SalaryItem,
  SalaryStructure,
  addTaxDeduction,
  approveSalaryAdjustment,
  assignInsuranceScheme,
  assignSalaryStructure,
  createInsuranceScheme,
  createSalaryAdjustment,
  createSalaryItem,
  createSalaryStructure,
  createTaxConfig,
  effectiveSalaryAdjustment,
  listEmployeeBenefits,
  listEmployeeSalaries,
  listEmployees,
  listInsuranceSchemes,
  listJobLevels,
  listSalaryAdjustments,
  listSalaryGrades,
  listSalaryItems,
  listSalaryStructures,
  listTaxDeductionRecords,
  listTaxProfiles,
  setSalaryGrade,
  submitSalaryAdjustment,
} from '@/services/api/hr';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  buildEmployeeLabel,
  enumLabel,
  formatDateValue,
  formatMoneyValue,
  normalizeRows,
  optionOrIdLabel,
  yesNoLabel,
} from './hrShared';
import { HrCrudPanel, HrFormField, HrPageHeader, renderStatus } from './HrDomainWorkspace';
import HrCompensationSimulatePanel from './components/HrCompensationSimulatePanel';

const componentTypeLabels: Record<string, string> = {
  FIXED: '固定薪酬',
  VARIABLE: '浮动薪酬',
  EARNING: '收入',
  DEDUCTION: '扣减',
  COMPANY: '公司成本',
};

const componentCategoryLabels: Record<string, string> = {
  BASE: '基本工资',
  ALLOWANCE: '津贴补贴',
  BONUS: '奖金绩效',
  BENEFIT: '福利成本',
  OTHER: '其他',
};

const changeTypeLabels: Record<string, string> = {
  ADJUST: '调薪',
  PROMOTION: '晋升',
  PERFORMANCE: '绩效',
};

const deductionTypeLabels: Record<string, string> = {
  CHILD_EDUCATION: '子女教育',
  CONTINUING_EDU: '继续教育',
  CONTINUING_EDUCATION: '继续教育',
  HOUSING_LOAN: '住房贷款利息',
  HOUSING_RENT: '住房租金',
  ELDERLY_CARE: '赡养老人',
  INFANT_CARE: '婴幼儿照护',
};

const componentDefault = (): HrRecord => ({
  itemCode: `COMP${Date.now()}`,
  itemName: '',
  itemType: 'FIXED',
  category: 'BASE',
  taxable: 1,
  sortOrder: 0,
  status: 1,
});

const structureDefault = (): HrRecord => ({
  structureCode: `STR${Date.now()}`,
  structureName: '',
  itemIds: [],
  description: '',
  status: 1,
});

const gradeDefault = (): HrRecord => ({
  gradeCode: `GR${Date.now()}`,
  gradeName: '',
  levelId: '',
  minSalary: 0,
  midSalary: 0,
  maxSalary: 0,
  currency: 'CNY',
  status: 1,
});

const employeeCompDefault = (): HrRecord => ({
  employeeId: '',
  structureId: '',
  gradeId: '',
  totalSalary: 0,
  effectiveDate: '',
  status: 'ACTIVE',
});

const changeDefault = (): HrRecord => ({
  changeNo: `HRCG${Date.now()}`,
  employeeId: '',
  changeType: 'ADJUST',
  beforeTotal: 0,
  afterTotal: 0,
  effectiveDate: '',
  reason: '',
  status: 'DRAFT',
});

const benefitDefault = (): HrRecord => ({
  schemeCode: `BEN${Date.now()}`,
  schemeName: '',
  city: '',
  effectiveDate: '',
  status: 1,
});

const employeeBenefitDefault = (): HrRecord => ({
  employeeId: '',
  schemeId: '',
  baseAmount: 0,
  effectiveDate: '',
  status: 'ACTIVE',
});

const taxProfileDefault = (): HrRecord => ({
  employeeId: '',
  taxResidenceCity: '',
  threshold: 5000,
  status: 'ACTIVE',
});

const taxDeductionDefault = (): HrRecord => ({
  employeeId: '',
  deductionType: 'CHILD_EDUCATION',
  amount: 0,
  startDate: '',
  endDate: '',
  status: 'ACTIVE',
});

const HrCompensationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('components');
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [components, setComponents] = useState<SalaryItem[]>([]);
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [grades, setGrades] = useState<SalaryGrade[]>([]);
  const [employeeComps, setEmployeeComps] = useState<EmployeeSalary[]>([]);
  const [changes, setChanges] = useState<SalaryAdjustment[]>([]);
  const [benefits, setBenefits] = useState<InsuranceScheme[]>([]);
  const [employeeBenefits, setEmployeeBenefits] = useState<EmployeeInsurance[]>([]);
  const [taxProfiles, setTaxProfiles] = useState<HrRecord[]>([]);
  const [taxDeductions, setTaxDeductions] = useState<EmployeeTaxDeduction[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [jobLevels, setJobLevels] = useState<HrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [componentForm, setComponentForm] = useState<HrRecord>(componentDefault);
  const [structureForm, setStructureForm] = useState<HrRecord>(structureDefault);
  const [gradeForm, setGradeForm] = useState<HrRecord>(gradeDefault);
  const [employeeCompForm, setEmployeeCompForm] = useState<HrRecord>(employeeCompDefault);
  const [changeForm, setChangeForm] = useState<HrRecord>(changeDefault);
  const [benefitForm, setBenefitForm] = useState<HrRecord>(benefitDefault);
  const [employeeBenefitForm, setEmployeeBenefitForm] = useState<HrRecord>(employeeBenefitDefault);
  const [taxProfileForm, setTaxProfileForm] = useState<HrRecord>(taxProfileDefault);
  const [taxDeductionForm, setTaxDeductionForm] = useState<HrRecord>(taxDeductionDefault);

  const loadData = async () => {
    setLoading(true);
    try {
      const [componentRes, structureRes, gradeRes, employeeCompRes, changeRes, benefitRes, employeeBenefitRes, taxProfileRes, deductionRes, employeeRes, levelRes] = await Promise.all([
        listSalaryItems(),
        listSalaryStructures(),
        listSalaryGrades(),
        listEmployeeSalaries(),
        listSalaryAdjustments({ pageNum: 1, pageSize: 200 }),
        listInsuranceSchemes(),
        listEmployeeBenefits({ pageNum: 1, pageSize: 200 }),
        listTaxProfiles(),
        listTaxDeductionRecords(),
        listEmployees({ pageNum: 1, pageSize: 500 }),
        listJobLevels({}),
      ]);
      setComponents(normalizeRows<SalaryItem>(componentRes));
      setStructures(normalizeRows<SalaryStructure>(structureRes));
      setGrades(normalizeRows<SalaryGrade>(gradeRes));
      setEmployeeComps(normalizeRows<EmployeeSalary>(employeeCompRes));
      setChanges(normalizeRows<SalaryAdjustment>(changeRes));
      setBenefits(normalizeRows<InsuranceScheme>(benefitRes));
      setEmployeeBenefits(normalizeRows<EmployeeInsurance>(employeeBenefitRes));
      setTaxProfiles(normalizeRows<HrRecord>(taxProfileRes));
      setTaxDeductions(normalizeRows<EmployeeTaxDeduction>(deductionRes));
      setEmployees(normalizeRows<HrEmployee>(employeeRes));
      setJobLevels(normalizeRows<HrRecord>(levelRes));
    } catch (error) {
      toast.error(getErrorMessage(error, '薪酬福利数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const componentOptions = useMemo(
    () => components.map((item) => ({ label: item.itemName || item.componentName || item.id, value: item.id })),
    [components],
  );
  const structureOptions = useMemo(
    () => structures.map((item) => ({ label: item.structureName, value: item.id })),
    [structures],
  );
  const gradeOptions = useMemo(
    () => grades.map((item) => ({ label: item.gradeName || item.gradeCode || item.id, value: item.id })),
    [grades],
  );
  const benefitOptions = useMemo(
    () => benefits.map((item) => ({ label: item.schemeName, value: item.id })),
    [benefits],
  );
  const employeeOptions = useMemo(
    () => employees.map((item) => ({ label: buildEmployeeLabel(item) || item.name || item.employeeNo, value: item.id })),
    [employees],
  );
  const levelOptions = useMemo(
    () => jobLevels.map((item) => ({ label: item.levelName || item.levelCode || String(item.id), value: item.id })),
    [jobLevels],
  );

  const employeeLabel = (row: HrRecord) =>
    String(row.employeeName || optionOrIdLabel('员工', employeeOptions, row.employeeId));

  const moneyCell = (value?: unknown, currency?: unknown) =>
    formatMoneyValue(value, String(currency || 'CNY'));

  const submitAndReload = async (runner: () => Promise<unknown>, success: string) => {
    try {
      await runner();
      toast.success(success);
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, success.replace('已', '') + '失败'));
    }
  };

  const changeActions = (row: SalaryAdjustment) => {
    const status = String(row.status || '').toUpperCase();
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {[
          { label: '提交', enabled: status === 'DRAFT', runner: () => submitSalaryAdjustment(row.id) },
          { label: '通过', enabled: status === 'APPROVING', runner: () => approveSalaryAdjustment(row.id) },
          { label: '生效', enabled: status === 'APPROVED', runner: () => effectiveSalaryAdjustment(row.id) },
        ].map((item) => (
          <Button
            key={item.label}
            variant="outline"
            size="sm"
            disabled={!item.enabled}
            onClick={() => void submitAndReload(item.runner, `调薪已${item.label}`)}
          >
            {item.label}
          </Button>
        ))}
      </div>
    );
  };

  const parseItemIds = (value: unknown) => {
    const rawItems = Array.isArray(value) ? value : String(value || '').split(',');
    return rawItems
      .map((item) => Number(String(item).trim()))
      .filter((item) => Number.isFinite(item) && item > 0);
  };

  const componentFields: HrFormField[] = [
    { key: 'itemName', label: '项目名称' },
    { key: 'itemType', label: '类型', type: 'select', options: [{ label: '固定薪酬', value: 'FIXED' }, { label: '浮动薪酬', value: 'VARIABLE' }, { label: '扣减项', value: 'DEDUCTION' }, { label: '公司成本', value: 'COMPANY' }] },
    { key: 'category', label: '分类', type: 'select', options: [{ label: '基本工资', value: 'BASE' }, { label: '津贴补贴', value: 'ALLOWANCE' }, { label: '奖金绩效', value: 'BONUS' }, { label: '福利成本', value: 'BENEFIT' }, { label: '其他', value: 'OTHER' }] },
    { key: 'taxable', label: '计税', type: 'select', valueType: 'number', options: [{ label: '是', value: 1 }, { label: '否', value: 0 }] },
    { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
  ];

  const structureFields: HrFormField[] = [
    { key: 'structureName', label: '结构名称' },
    { key: 'itemIds', label: '薪资项目', type: 'multiselect', valueType: 'number', options: componentOptions },
    { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
    { key: 'description', label: '说明', type: 'textarea', className: 'md:col-span-2' },
  ];

  return (
    <div className="space-y-4">
      <HrPageHeader
        eyebrow="Compensation"
        title="薪酬福利"
        stats={[
          { label: '薪资项目', value: components.length },
          { label: '薪资结构', value: structures.length },
          { label: '员工薪资', value: employeeComps.length },
          { label: '调薪', value: changes.length, tone: 'active' },
        ]}
      />

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setSimulateOpen(true)}>
          薪酬模拟器
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
          {[
            ['components', '薪资项目'],
            ['structures', '薪资结构'],
            ['grades', '薪级'],
            ['employeeComps', '员工薪资'],
            ['changes', '调薪'],
            ['benefits', '福利方案'],
            ['employeeBenefits', '员工福利'],
            ['taxProfiles', '个税档案'],
            ['taxDeductions', '专项扣除'],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="flex-1 lg:flex-none">{label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="components">
          <HrCrudPanel
            title="薪资项目"
            rows={components}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增项目"
            form={componentForm}
            setForm={setComponentForm}
            resetForm={componentDefault}
            formFields={componentFields}
            onCreate={(form) => submitAndReload(() => createSalaryItem(form), '薪资项目已保存')}
            columns={[
              { key: 'itemCode', label: '编码', render: (row) => row.itemCode || row.componentCode },
              { key: 'itemName', label: '名称', render: (row) => row.itemName || row.componentName },
              { key: 'itemType', label: '类型', render: (row) => enumLabel(componentTypeLabels, row.itemType || row.componentType) },
              { key: 'category', label: '分类', render: (row) => enumLabel(componentCategoryLabels, row.category) },
              { key: 'taxable', label: '计税', render: (row) => yesNoLabel(row.taxable ?? row.isTaxable) },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="structures">
          <HrCrudPanel
            title="薪资结构"
            rows={structures}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增结构"
            form={structureForm}
            setForm={setStructureForm}
            resetForm={structureDefault}
            formFields={structureFields}
            onCreate={(form) => submitAndReload(
              () => createSalaryStructure({ ...form, itemIds: parseItemIds(form.itemIds) } as Parameters<typeof createSalaryStructure>[0]),
              '薪资结构已保存',
            )}
            columns={[
              { key: 'structureCode', label: '编码' },
              { key: 'structureName', label: '名称' },
              { key: 'description', label: '说明', render: (row) => row.description || '-' },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="grades">
          <HrCrudPanel
            title="薪级"
            rows={grades}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增薪级"
            form={gradeForm}
            setForm={setGradeForm}
            resetForm={gradeDefault}
            formFields={[
              { key: 'gradeName', label: '薪级名称' },
              { key: 'levelId', label: '职级', type: 'select', valueType: 'number', options: levelOptions },
              { key: 'minSalary', label: '下限', type: 'number' },
              { key: 'midSalary', label: '中位', type: 'number' },
              { key: 'maxSalary', label: '上限', type: 'number' },
              { key: 'currency', label: '币种', type: 'select', options: [{ label: '人民币', value: 'CNY' }, { label: '美元', value: 'USD' }] },
              { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
            ]}
            onCreate={(form) => submitAndReload(() => setSalaryGrade(form), '薪级已保存')}
            columns={[
              { key: 'gradeCode', label: '编码' },
              { key: 'gradeName', label: '名称' },
              { key: 'levelId', label: '职级', render: (row) => row.levelName || optionOrIdLabel('职级', levelOptions, row.levelId) },
              { key: 'minSalary', label: '下限', render: (row) => moneyCell(row.minSalary, row.currency) },
              { key: 'midSalary', label: '中位', render: (row) => moneyCell(row.midSalary, row.currency) },
              { key: 'maxSalary', label: '上限', render: (row) => moneyCell(row.maxSalary, row.currency) },
            ]}
          />
        </TabsContent>

        <TabsContent value="employeeComps">
          <HrCrudPanel
            title="员工薪资"
            rows={employeeComps}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="分配薪资"
            form={employeeCompForm}
            setForm={setEmployeeCompForm}
            resetForm={employeeCompDefault}
            formFields={[
              { key: 'employeeId', label: '员工', type: 'employee' },
              { key: 'structureId', label: '薪资结构', type: 'select', valueType: 'number', options: structureOptions },
              { key: 'gradeId', label: '薪级', type: 'select', valueType: 'number', options: gradeOptions },
              { key: 'totalSalary', label: '总薪资', type: 'number' },
              { key: 'effectiveDate', label: '生效日期', type: 'date' },
              { key: 'status', label: '状态', type: 'select', options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'INACTIVE' }] },
            ]}
            onCreate={(form) => submitAndReload(() => assignSalaryStructure(form), '员工薪资已保存')}
            columns={[
              { key: 'employeeName', label: '员工', render: employeeLabel },
              { key: 'structureId', label: '结构', render: (row) => row.structureName || optionOrIdLabel('结构', structureOptions, row.structureId) },
              { key: 'gradeId', label: '薪级', render: (row) => row.gradeName || optionOrIdLabel('薪级', gradeOptions, row.gradeId) },
              { key: 'totalSalary', label: '总薪资', render: (row) => moneyCell(row.totalSalary, row.currency) },
              { key: 'effectiveDate', label: '生效日期', render: (row) => formatDateValue(row.effectiveDate) },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="changes">
          <HrCrudPanel
            title="调薪"
            rows={changes}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增调薪"
            form={changeForm}
            setForm={setChangeForm}
            resetForm={changeDefault}
            formFields={[
              { key: 'employeeId', label: '员工', type: 'employee' },
              { key: 'changeType', label: '类型', type: 'select', options: [{ label: '调薪', value: 'ADJUST' }, { label: '晋升', value: 'PROMOTION' }, { label: '绩效', value: 'PERFORMANCE' }] },
              { key: 'beforeTotal', label: '调整前', type: 'number' },
              { key: 'afterTotal', label: '调整后', type: 'number' },
              { key: 'effectiveDate', label: '生效日期', type: 'date' },
              { key: 'reason', label: '原因', type: 'textarea', className: 'md:col-span-2' },
            ]}
            onCreate={(form) => submitAndReload(() => createSalaryAdjustment(form), '调薪已保存')}
            columns={[
              { key: 'changeNo', label: '编号', render: (row) => row.changeNo || row.applicationNo },
              { key: 'employeeName', label: '员工', render: employeeLabel },
              { key: 'changeType', label: '类型', render: (row) => enumLabel(changeTypeLabels, row.changeType) },
              { key: 'beforeTotal', label: '调整前', render: (row) => moneyCell(row.beforeTotal) },
              { key: 'afterTotal', label: '调整后', render: (row) => moneyCell(row.afterTotal) },
              { key: 'effectiveDate', label: '生效日期', render: (row) => formatDateValue(row.effectiveDate) },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
            actions={changeActions}
            minWidthClassName="min-w-[1040px]"
          />
        </TabsContent>

        <TabsContent value="benefits">
          <HrCrudPanel
            title="福利方案"
            rows={benefits}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增方案"
            form={benefitForm}
            setForm={setBenefitForm}
            resetForm={benefitDefault}
            formFields={[
              { key: 'schemeName', label: '方案名称' },
              { key: 'city', label: '城市', type: 'city' },
              { key: 'effectiveDate', label: '生效日期', type: 'date' },
              { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
            ]}
            onCreate={(form) => submitAndReload(() => createInsuranceScheme(form), '福利方案已保存')}
            columns={[
              { key: 'schemeCode', label: '编码' },
              { key: 'schemeName', label: '名称' },
              { key: 'city', label: '城市', render: (row) => row.city || '-' },
              { key: 'effectiveDate', label: '生效日期', render: (row) => formatDateValue(row.effectiveDate) },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="employeeBenefits">
          <HrCrudPanel
            title="员工福利"
            rows={employeeBenefits}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="分配福利"
            form={employeeBenefitForm}
            setForm={setEmployeeBenefitForm}
            resetForm={employeeBenefitDefault}
            formFields={[
              { key: 'employeeId', label: '员工', type: 'employee' },
              { key: 'schemeId', label: '方案', type: 'select', valueType: 'number', options: benefitOptions },
              { key: 'baseAmount', label: '缴费基数', type: 'number' },
              { key: 'effectiveDate', label: '生效日期', type: 'date' },
              { key: 'status', label: '状态', type: 'select', options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'INACTIVE' }] },
            ]}
            onCreate={(form) => submitAndReload(() => assignInsuranceScheme(form), '员工福利已保存')}
            columns={[
              { key: 'employeeName', label: '员工', render: employeeLabel },
              { key: 'schemeName', label: '方案', render: (row) => row.schemeName || optionOrIdLabel('方案', benefitOptions, row.schemeId) },
              { key: 'baseAmount', label: '基数', render: (row) => moneyCell(row.baseAmount ?? row.base) },
              { key: 'effectiveDate', label: '生效日期', render: (row) => formatDateValue(row.effectiveDate) },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="taxProfiles">
          <HrCrudPanel
            title="个税档案"
            rows={taxProfiles}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增档案"
            form={taxProfileForm}
            setForm={setTaxProfileForm}
            resetForm={taxProfileDefault}
            formFields={[
              { key: 'employeeId', label: '员工', type: 'employee' },
              { key: 'taxResidenceCity', label: '纳税城市', type: 'city' },
              { key: 'threshold', label: '起征点', type: 'number' },
              { key: 'status', label: '状态', type: 'select', options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'INACTIVE' }] },
            ]}
            onCreate={(form) => submitAndReload(() => createTaxConfig(form), '个税档案已保存')}
            columns={[
              { key: 'employeeName', label: '员工', render: employeeLabel },
              { key: 'taxResidenceCity', label: '城市', render: (row) => row.taxResidenceCity || '-' },
              { key: 'threshold', label: '起征点', render: (row) => moneyCell(row.threshold) },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="taxDeductions">
          <HrCrudPanel
            title="专项扣除"
            rows={taxDeductions}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增扣除"
            form={taxDeductionForm}
            setForm={setTaxDeductionForm}
            resetForm={taxDeductionDefault}
            formFields={[
              { key: 'employeeId', label: '员工', type: 'employee' },
              { key: 'deductionType', label: '扣除类型', type: 'select', options: [{ label: '子女教育', value: 'CHILD_EDUCATION' }, { label: '继续教育', value: 'CONTINUING_EDU' }, { label: '住房贷款利息', value: 'HOUSING_LOAN' }, { label: '住房租金', value: 'HOUSING_RENT' }, { label: '赡养老人', value: 'ELDERLY_CARE' }, { label: '婴幼儿照护', value: 'INFANT_CARE' }] },
              { key: 'amount', label: '金额', type: 'number' },
              { key: 'startDate', label: '开始日期', type: 'date' },
              { key: 'endDate', label: '结束日期', type: 'date' },
              { key: 'status', label: '状态', type: 'select', options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'INACTIVE' }] },
            ]}
            onCreate={(form) => submitAndReload(() => addTaxDeduction(form), '专项扣除已保存')}
            columns={[
              { key: 'employeeName', label: '员工', render: employeeLabel },
              { key: 'deductionType', label: '类型', render: (row) => enumLabel(deductionTypeLabels, row.deductionType) },
              { key: 'amount', label: '金额', render: (row) => moneyCell(row.amount) },
              { key: 'startDate', label: '开始', render: (row) => formatDateValue(row.startDate) },
              { key: 'endDate', label: '结束', render: (row) => formatDateValue(row.endDate) },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>
      </Tabs>

      <HrCompensationSimulatePanel
        open={simulateOpen}
        onClose={() => setSimulateOpen(false)}
        employees={employees.map((emp) => ({ id: emp.id, name: emp.name, employeeNo: emp.employeeNo }))}
        positionLevels={grades.map((g) => ({ id: g.id, gradeName: g.gradeName, gradeCode: g.gradeCode }))}
      />
    </div>
  );
};

export default HrCompensationPage;
