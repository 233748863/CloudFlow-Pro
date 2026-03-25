import React, { useEffect, useMemo, useState } from 'react';
import { BadgePlus, FilePlus2, FileText, Landmark, Layers3, RefreshCcw, Search, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui';
import {
  EmployeeSalary,
  EmployeeSalaryAssignPayload,
  EmployeeSalaryDetail,
  EmployeeInsuranceDetail,
  EmployeeTaxDeduction,
  HrEmployee,
  HrPagedResult,
  InsuranceCalculation,
  JobLevelOption,
  SalaryAdjustment,
  SalaryAdjustmentHistory,
  SalaryAdjustmentPayload,
  SalaryGrade,
  SalaryGradePayload,
  SalaryItem,
  SalaryItemPayload,
  SalaryStructure,
  SalaryStructureDetail,
  SalaryStructurePayload,
  TaxCalculation,
  approveSalaryAdjustment,
  assignSalaryStructure,
  calculateEmployeeInsurance,
  calculateTax,
  createSalaryAdjustment,
  createSalaryItem,
  createSalaryStructure,
  deleteSalaryGrade,
  deleteSalaryItem,
  deleteSalaryStructure,
  effectiveSalaryAdjustment,
  getEmployeeInsurance,
  getEmployeeSalary,
  getSalaryAdjustment,
  getSalaryAdjustmentHistory,
  getSalaryStructure,
  listEmployees,
  listActiveTaxDeductions,
  listEmployeeSalaries,
  listJobLevels,
  listSalaryAdjustments,
  listSalaryGrades,
  listSalaryItems,
  listSalaryStructures,
  setSalaryGrade,
  submitSalaryAdjustment,
  updateSalaryItem,
  updateSalaryStructure,
} from '@/services/api/hr';
import { buildEmployeeLabel, toDateInputValue } from './hrShared';

const EMPTY_VALUE = '__empty__';
const ALL_VALUE = '__all__';

const adjustmentTypeOptions = [
  { value: 'ANNUAL', label: '年度调薪' },
  { value: 'PROMOTION', label: '晋升调薪' },
  { value: 'PERFORMANCE', label: '绩效调薪' },
  { value: 'MARKET', label: '市场调薪' },
];

const itemTypeOptions = [
  { value: 'FIXED', label: '固定项' },
  { value: 'VARIABLE', label: '浮动项' },
];

const itemCategoryOptions = [
  { value: 'BASIC', label: '基本工资' },
  { value: 'ALLOWANCE', label: '津贴' },
  { value: 'BONUS', label: '奖金' },
  { value: 'DEDUCTION', label: '扣款' },
  { value: 'INSURANCE', label: '社保' },
  { value: 'TAX', label: '个税' },
];

const createDefaultItemForm = (): SalaryItemPayload => ({
  itemCode: '',
  itemName: '',
  itemType: 'FIXED',
  category: 'BASIC',
  isTaxable: true,
  formula: '',
  sortOrder: 10,
});

const createDefaultStructureForm = (): SalaryStructurePayload => ({
  structureCode: '',
  structureName: '',
  description: '',
  itemIds: [],
});

const createDefaultGradeForm = (): SalaryGradePayload => ({
  levelId: 0,
  minSalary: 0,
  maxSalary: 0,
  midSalary: 0,
  currency: 'CNY',
});

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayValue() {
  return formatLocalDate(new Date());
}

function getYearMonthFromDate(value?: string | null) {
  if (!value) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }

  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
}

const createDefaultAssignForm = (): {
  employeeId: number;
  structureId: number;
  effectiveDate: string;
  salaryData: Record<string, string>;
} => ({
  employeeId: 0,
  structureId: 0,
  effectiveDate: getTodayValue(),
  salaryData: {},
});

const createDefaultAdjustmentForm = (): {
  employeeId: number;
  adjustmentType: string;
  adjustmentReason: string;
  effectiveDate: string;
  afterSalaryData: Record<string, string>;
} => ({
  employeeId: 0,
  adjustmentType: 'ANNUAL',
  adjustmentReason: '',
  effectiveDate: getTodayValue(),
  afterSalaryData: {},
});

const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const formatCurrency = (value?: number | string | null) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `¥${currencyFormatter.format(amount)}`;
};

const adjustmentStatusLabel = (status?: string | null) => {
  switch ((status || '').toUpperCase()) {
    case 'DRAFT':
      return '草稿';
    case 'APPROVING':
      return '审批中';
    case 'APPROVED':
      return '已通过';
    case 'EFFECTIVE':
      return '已生效';
    case 'REJECTED':
      return '已拒绝';
    default:
      return status || '-';
  }
};

const adjustmentStatusClass = (status?: string | null) => {
  switch ((status || '').toUpperCase()) {
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'APPROVING':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'APPROVED':
      return 'bg-sky-50 text-sky-700 border-sky-100';
    case 'EFFECTIVE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'REJECTED':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const salaryArchiveStatusLabel = (status?: string | null, statusDesc?: string | null) => {
  if (statusDesc) return statusDesc;

  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return '生效中';
    case 'EXPIRED':
      return '已失效';
    default:
      return status || '-';
  }
};

const salaryArchiveStatusClass = (status?: string | null) => {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'EXPIRED':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-sky-50 text-sky-700 border-sky-100';
  }
};

const structureStatusClass = (status?: number | null) =>
  status === 1
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : 'bg-slate-100 text-slate-700 border-slate-200';

const itemTypeLabel = (value?: string | null) =>
  itemTypeOptions.find(option => option.value === value)?.label || value || '-';

const itemCategoryLabel = (value?: string | null) =>
  itemCategoryOptions.find(option => option.value === value)?.label || value || '-';

const adjustmentTypeLabel = (value?: string | null) =>
  adjustmentTypeOptions.find(option => option.value === value)?.label || value || '-';

const sumInputMap = (valueMap: Record<string, string>) =>
  Object.values(valueMap).reduce((sum, value) => {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

const parseJsonSalaryData = (value?: string | null) => {
  if (!value) return {} as Record<string, number>;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const result: Record<string, number> = {};

    Object.entries(parsed || {}).forEach(([key, rawValue]) => {
      const amount = Number(rawValue);
      if (Number.isFinite(amount)) {
        result[key] = amount;
      }
    });

    return result;
  } catch (error) {
    console.error(error);
    return {} as Record<string, number>;
  }
};

const buildAmountPayload = (valueMap: Record<string, string>) => {
  const payload: Record<string, number> = {};

  Object.entries(valueMap).forEach(([key, rawValue]) => {
    const trimmedValue = String(rawValue ?? '').trim();
    if (!trimmedValue) {
      payload[key] = 0;
      return;
    }

    const amount = Number(trimmedValue);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('金额必须是大于等于 0 的数字');
    }

    payload[key] = Number(amount.toFixed(2));
  });

  return payload;
};

type SalaryEditorField = {
  key: string;
  label: string;
  description: string;
};

type SalaryDiffField = {
  key: string;
  label: string;
  description: string;
  beforeAmount: number;
  afterAmount: number;
  delta: number;
};

const SalaryAmountEditor: React.FC<{
  fields: SalaryEditorField[];
  valueMap: Record<string, string>;
  onValueChange: (fieldKey: string, value: string) => void;
  emptyText: string;
}> = ({ fields, valueMap, onValueChange, emptyText }) => {
  if (!fields.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {fields.map(field => (
        <div key={field.key} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="font-medium text-slate-900">{field.label}</div>
          <div className="mt-1 text-xs text-slate-400">{field.description}</div>
          <Input
            className="mt-3"
            type="number"
            min={0}
            step="0.01"
            value={valueMap[field.key] ?? ''}
            onChange={event => onValueChange(field.key, event.target.value)}
          />
        </div>
      ))}
    </div>
  );
};

const SalaryDiffTable: React.FC<{ rows: SalaryDiffField[] }> = ({ rows }) => {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center text-sm text-slate-500">
        当前没有可展示的薪资明细差异。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>薪资项目</TableHead>
            <TableHead>调薪前</TableHead>
            <TableHead>调薪后</TableHead>
            <TableHead>差额</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.key}>
              <TableCell>
                <div className="font-medium text-slate-900">{row.label}</div>
                <div className="text-xs text-slate-400">{row.description}</div>
              </TableCell>
              <TableCell>{formatCurrency(row.beforeAmount)}</TableCell>
              <TableCell>{formatCurrency(row.afterAmount)}</TableCell>
              <TableCell>
                <span className={row.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {row.delta >= 0 ? '+' : ''}
                  {formatCurrency(row.delta)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export const HrSalaryPage: React.FC = () => {
  const [tab, setTab] = useState('employees');
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [salaryItems, setSalaryItems] = useState<SalaryItem[]>([]);
  const [salaryStructures, setSalaryStructures] = useState<SalaryStructure[]>([]);
  const [salaryGrades, setSalaryGrades] = useState<SalaryGrade[]>([]);
  const [jobLevels, setJobLevels] = useState<JobLevelOption[]>([]);
  const [employeeSalaries, setEmployeeSalaries] = useState<EmployeeSalary[]>([]);
  const [salaryAdjustments, setSalaryAdjustments] = useState<SalaryAdjustment[]>([]);
  const [employeeAdjustmentHistory, setEmployeeAdjustmentHistory] = useState<SalaryAdjustmentHistory[]>([]);
  const [employeeSalaryHistory, setEmployeeSalaryHistory] = useState<EmployeeSalary[]>([]);
  const [employeeInsuranceDetail, setEmployeeInsuranceDetail] = useState<EmployeeInsuranceDetail | null>(null);
  const [employeeInsuranceCalculation, setEmployeeInsuranceCalculation] = useState<InsuranceCalculation | null>(null);
  const [employeeTaxDeductions, setEmployeeTaxDeductions] = useState<EmployeeTaxDeduction[]>([]);
  const [employeeTaxCalculation, setEmployeeTaxCalculation] = useState<TaxCalculation | null>(null);
  const [adjustmentPage, setAdjustmentPage] = useState<HrPagedResult<SalaryAdjustment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [foundationLoading, setFoundationLoading] = useState(false);
  const [employeeSalaryListLoading, setEmployeeSalaryListLoading] = useState(false);
  const [employeeSalaryDetailLoading, setEmployeeSalaryDetailLoading] = useState(false);
  const [employeeAdjustmentHistoryLoading, setEmployeeAdjustmentHistoryLoading] = useState(false);
  const [employeeSalaryHistoryLoading, setEmployeeSalaryHistoryLoading] = useState(false);
  const [employeeCompensationLoading, setEmployeeCompensationLoading] = useState(false);
  const [structureDetailLoading, setStructureDetailLoading] = useState(false);
  const [adjustmentListLoading, setAdjustmentListLoading] = useState(false);
  const [adjustmentDetailLoading, setAdjustmentDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedAdjustmentId, setSelectedAdjustmentId] = useState('');
  const [salaryKeyword, setSalaryKeyword] = useState('');
  const [salaryHistoryStatusFilter, setSalaryHistoryStatusFilter] = useState(ALL_VALUE);
  const [adjustmentKeyword, setAdjustmentKeyword] = useState('');
  const [adjustmentStatusFilter, setAdjustmentStatusFilter] = useState(ALL_VALUE);
  const [adjustmentTypeFilter, setAdjustmentTypeFilter] = useState(ALL_VALUE);
  const [structureDetail, setStructureDetail] = useState<SalaryStructureDetail | null>(null);
  const [employeeSalaryDetail, setEmployeeSalaryDetail] = useState<EmployeeSalaryDetail | null>(null);
  const [adjustmentDetail, setAdjustmentDetail] = useState<SalaryAdjustment | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [structureDialogOpen, setStructureDialogOpen] = useState(false);
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingStructureId, setEditingStructureId] = useState<number | null>(null);
  const [editingGradeLevelId, setEditingGradeLevelId] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState<SalaryItemPayload>(createDefaultItemForm);
  const [structureForm, setStructureForm] = useState<SalaryStructurePayload>(createDefaultStructureForm);
  const [gradeForm, setGradeForm] = useState<SalaryGradePayload>(createDefaultGradeForm);
  const [assignForm, setAssignForm] = useState(createDefaultAssignForm);
  const [adjustForm, setAdjustForm] = useState(createDefaultAdjustmentForm);
  const [assignStructurePreview, setAssignStructurePreview] = useState<SalaryStructureDetail | null>(null);
  const [adjustmentBaseline, setAdjustmentBaseline] = useState<EmployeeSalaryDetail | null>(null);

  const salaryItemMap = useMemo(
    () => new Map(salaryItems.map(item => [String(item.id), item])),
    [salaryItems],
  );

  const employeeMap = useMemo(
    () => new Map(employees.map(employee => [employee.id, employee])),
    [employees],
  );

  const activeEmployees = useMemo(
    () => employees.filter(employee => employee.employeeStatus !== 'RESIGNED'),
    [employees],
  );

  const salaryEnabledEmployeeIds = useMemo(
    () => new Set(employeeSalaries.map(item => item.employeeId)),
    [employeeSalaries],
  );

  const assignableEmployees = useMemo(
    () => activeEmployees.filter(employee => !salaryEnabledEmployeeIds.has(employee.id)),
    [activeEmployees, salaryEnabledEmployeeIds],
  );

  const resignedEmployeeSalaries = useMemo(
    () => employeeSalaries.filter(record => employeeMap.get(record.employeeId)?.employeeStatus === 'RESIGNED'),
    [employeeMap, employeeSalaries],
  );

  const workingEmployeeSalaries = useMemo(
    () => employeeSalaries.filter(record => employeeMap.get(record.employeeId)?.employeeStatus !== 'RESIGNED'),
    [employeeMap, employeeSalaries],
  );

  const employeesWithSalary = useMemo(
    () => workingEmployeeSalaries
      .map(record => employeeMap.get(record.employeeId))
      .filter((employee): employee is HrEmployee => Boolean(employee)),
    [employeeMap, workingEmployeeSalaries],
  );

  const filteredEmployeeSalaries = useMemo(() => {
    const normalizedKeyword = salaryKeyword.trim().toLowerCase();
    if (!normalizedKeyword) return workingEmployeeSalaries;

    return workingEmployeeSalaries.filter(item =>
      [item.employeeNo, item.employeeName, item.structureName, item.structureCode]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(normalizedKeyword)),
    );
  }, [salaryKeyword, workingEmployeeSalaries]);

  const filteredAdjustments = useMemo(() => {
    const normalizedKeyword = adjustmentKeyword.trim().toLowerCase();
    if (!normalizedKeyword) return salaryAdjustments;

    return salaryAdjustments.filter(item =>
      [item.applicationNo, item.employeeName, item.employeeNo, adjustmentTypeLabel(item.adjustmentType)]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(normalizedKeyword)),
    );
  }, [adjustmentKeyword, salaryAdjustments]);

  const metrics = useMemo(() => {
    const pendingAdjustmentCount = salaryAdjustments.filter(item =>
      ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase()),
    ).length;

    return [
      {
        label: '薪资项目',
        value: salaryItems.length,
        hint: '项目、税务属性和计算口径',
        icon: <Layers3 size={18} />,
        tone: 'bg-slate-100 text-slate-600',
      },
      {
        label: '薪资结构',
        value: salaryStructures.length,
        hint: '结构决定项目组合与分配范围',
        icon: <Landmark size={18} />,
        tone: 'bg-sky-50 text-sky-600',
      },
      {
        label: '在岗薪资档案',
        value: workingEmployeeSalaries.length,
        hint: resignedEmployeeSalaries.length
          ? `${assignableEmployees.length} 名待分配，${resignedEmployeeSalaries.length} 条离职档案已过滤`
          : `${assignableEmployees.length} 名员工待分配薪资`,
        icon: <Users size={18} />,
        tone: 'bg-emerald-50 text-emerald-600',
      },
      {
        label: '调薪申请',
        value: salaryAdjustments.length,
        hint: `${pendingAdjustmentCount} 条待推进`,
        icon: <FileText size={18} />,
        tone: 'bg-amber-50 text-amber-600',
      },
    ];
  }, [
    assignableEmployees.length,
    resignedEmployeeSalaries.length,
    salaryAdjustments,
    salaryItems.length,
    salaryStructures.length,
    workingEmployeeSalaries.length,
  ]);

  const currentEmployeeRecord = useMemo(
    () => filteredEmployeeSalaries.find(item => String(item.employeeId) === selectedEmployeeId) || null,
    [filteredEmployeeSalaries, selectedEmployeeId],
  );

  const currentAdjustmentRecord = useMemo(
    () => filteredAdjustments.find(item => String(item.id) === selectedAdjustmentId) || null,
    [filteredAdjustments, selectedAdjustmentId],
  );
  const defaultAssignableEmployeeId = (
    (selectedEmployeeId && assignableEmployees.some(employee => String(employee.id) === selectedEmployeeId)
      ? Number(selectedEmployeeId)
      : undefined)
    || assignableEmployees[0]?.id
    || 0
  );
  const defaultAdjustEmployeeId = (
    currentEmployeeRecord?.employeeId
    || employeesWithSalary[0]?.id
    || 0
  );

  const structurePreviewFields = useMemo<SalaryEditorField[]>(
    () => (assignStructurePreview?.items || []).map(item => ({
      key: String(item.id),
      label: item.itemName,
      description: `${itemCategoryLabel(item.category)} / ${itemTypeLabel(item.itemType)}`,
    })),
    [assignStructurePreview],
  );

  const adjustmentEditorFields = useMemo<SalaryEditorField[]>(
    () => (adjustmentBaseline?.items || []).map(item => ({
      key: String(item.itemId),
      label: item.itemName || `项目 ${item.itemId}`,
      description: `${itemCategoryLabel(item.category)} / ${item.itemCode || '-'}`,
    })),
    [adjustmentBaseline],
  );

  const adjustmentDiffRows = useMemo<SalaryDiffField[]>(() => {
    const beforeData = parseJsonSalaryData(adjustmentDetail?.beforeSalaryData);
    const afterData = parseJsonSalaryData(adjustmentDetail?.afterSalaryData);
    const keys = Array.from(new Set([...Object.keys(beforeData), ...Object.keys(afterData)])).sort((left, right) => Number(left) - Number(right));

    return keys.map(key => {
      const salaryItem = salaryItemMap.get(key);
      const beforeAmount = beforeData[key] ?? 0;
      const afterAmount = afterData[key] ?? 0;

      return {
        key,
        label: salaryItem?.itemName || `项目 ${key}`,
        description: salaryItem ? `${salaryItem.itemCode} / ${itemCategoryLabel(salaryItem.category)}` : `项目 ID ${key}`,
        beforeAmount,
        afterAmount,
        delta: Number((afterAmount - beforeAmount).toFixed(2)),
      };
    });
  }, [adjustmentDetail, salaryItemMap]);

  const sortedEmployeeAdjustmentHistory = useMemo(
    () => [...employeeAdjustmentHistory].sort((left, right) => {
      const rightTime = new Date(right.effectiveDate || right.createTime || 0).getTime();
      const leftTime = new Date(left.effectiveDate || left.createTime || 0).getTime();
      return rightTime - leftTime || right.id - left.id;
    }),
    [employeeAdjustmentHistory],
  );

  const latestEmployeeAdjustment = sortedEmployeeAdjustmentHistory[0] || null;

  const filteredEmployeeSalaryHistory = useMemo(() => {
    if (salaryHistoryStatusFilter === ALL_VALUE) {
      return employeeSalaryHistory;
    }

    return employeeSalaryHistory.filter(item => String(item.status || '').toUpperCase() === salaryHistoryStatusFilter);
  }, [employeeSalaryHistory, salaryHistoryStatusFilter]);

  const sortedEmployeeSalaryHistory = useMemo(
    () => [...filteredEmployeeSalaryHistory].sort((left, right) => {
      const rightTime = new Date(right.effectiveDate || right.updateTime || right.createTime || 0).getTime();
      const leftTime = new Date(left.effectiveDate || left.updateTime || left.createTime || 0).getTime();
      return rightTime - leftTime || right.id - left.id;
    }),
    [filteredEmployeeSalaryHistory],
  );

  const salaryHistoryMetrics = useMemo(() => ({
    total: employeeSalaryHistory.length,
    active: employeeSalaryHistory.filter(item => String(item.status || '').toUpperCase() === 'ACTIVE').length,
    expired: employeeSalaryHistory.filter(item => String(item.status || '').toUpperCase() === 'EXPIRED').length,
  }), [employeeSalaryHistory]);

  const currentGrossSalary = useMemo(
    () => Number(employeeSalaryDetail?.totalSalary ?? currentEmployeeRecord?.totalSalary ?? 0),
    [currentEmployeeRecord?.totalSalary, employeeSalaryDetail?.totalSalary],
  );

  const currentPersonalInsurance = useMemo(
    () => Number(employeeInsuranceCalculation?.personalTotalAmount ?? employeeInsuranceDetail?.personalTotalAmount ?? 0),
    [employeeInsuranceCalculation?.personalTotalAmount, employeeInsuranceDetail?.personalTotalAmount],
  );

  const currentCompanyInsurance = useMemo(
    () => Number(employeeInsuranceCalculation?.companyTotalAmount ?? employeeInsuranceDetail?.companyTotalAmount ?? 0),
    [employeeInsuranceCalculation?.companyTotalAmount, employeeInsuranceDetail?.companyTotalAmount],
  );

  const currentTaxAmount = useMemo(
    () => Number(employeeTaxCalculation?.taxAmount ?? 0),
    [employeeTaxCalculation?.taxAmount],
  );

  const currentTaxableIncome = useMemo(
    () => Number(employeeTaxCalculation?.taxableIncome ?? Math.max(currentGrossSalary - currentPersonalInsurance, 0).toFixed(2)),
    [currentGrossSalary, currentPersonalInsurance, employeeTaxCalculation?.taxableIncome],
  );

  const currentTaxDeductionTotal = useMemo(
    () => Number(
      employeeTaxCalculation?.totalDeduction
        ?? employeeTaxDeductions.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    ),
    [employeeTaxCalculation?.totalDeduction, employeeTaxDeductions],
  );

  const currentTaxableAmount = useMemo(
    () => Number(employeeTaxCalculation?.taxableAmount ?? 0),
    [employeeTaxCalculation?.taxableAmount],
  );

  const currentNetIncome = useMemo(
    () => Number(
      employeeTaxCalculation?.afterTaxIncome
        ?? (currentGrossSalary - currentPersonalInsurance - currentTaxAmount).toFixed(2),
    ),
    [currentGrossSalary, currentPersonalInsurance, currentTaxAmount, employeeTaxCalculation?.afterTaxIncome],
  );

  const currentEmployerCost = useMemo(
    () => Number((currentGrossSalary + currentCompanyInsurance).toFixed(2)),
    [currentGrossSalary, currentCompanyInsurance],
  );

  const hasInsuranceProfile = useMemo(
    () => Boolean(employeeInsuranceDetail || employeeInsuranceCalculation),
    [employeeInsuranceCalculation, employeeInsuranceDetail],
  );

  const taxReferencePeriod = useMemo(() => {
    const { year, month } = getYearMonthFromDate(
      employeeSalaryDetail?.effectiveDate || currentEmployeeRecord?.effectiveDate,
    );

    return `${year}年${month}月`;
  }, [currentEmployeeRecord?.effectiveDate, employeeSalaryDetail?.effectiveDate]);

  const insuranceBreakdownRows = useMemo(
    () => [
      {
        key: 'pension',
        label: '养老保险',
        personal: employeeInsuranceCalculation?.pensionPersonalAmount ?? employeeInsuranceDetail?.pensionPersonalAmount,
        company: employeeInsuranceCalculation?.pensionCompanyAmount ?? employeeInsuranceDetail?.pensionCompanyAmount,
      },
      {
        key: 'medical',
        label: '医疗保险',
        personal: employeeInsuranceCalculation?.medicalPersonalAmount ?? employeeInsuranceDetail?.medicalPersonalAmount,
        company: employeeInsuranceCalculation?.medicalCompanyAmount ?? employeeInsuranceDetail?.medicalCompanyAmount,
      },
      {
        key: 'unemployment',
        label: '失业保险',
        personal: employeeInsuranceCalculation?.unemploymentPersonalAmount ?? employeeInsuranceDetail?.unemploymentPersonalAmount,
        company: employeeInsuranceCalculation?.unemploymentCompanyAmount ?? employeeInsuranceDetail?.unemploymentCompanyAmount,
      },
      {
        key: 'injury',
        label: '工伤保险',
        personal: undefined,
        company: employeeInsuranceCalculation?.injuryCompanyAmount ?? employeeInsuranceDetail?.injuryCompanyAmount,
      },
      {
        key: 'maternity',
        label: '生育保险',
        personal: undefined,
        company: employeeInsuranceCalculation?.maternityCompanyAmount ?? employeeInsuranceDetail?.maternityCompanyAmount,
      },
      {
        key: 'housingFund',
        label: '住房公积金',
        personal: employeeInsuranceCalculation?.housingFundPersonalAmount ?? employeeInsuranceDetail?.housingFundPersonalAmount,
        company: employeeInsuranceCalculation?.housingFundCompanyAmount ?? employeeInsuranceDetail?.housingFundCompanyAmount,
      },
    ],
    [
      employeeInsuranceCalculation?.housingFundCompanyAmount,
      employeeInsuranceCalculation?.housingFundPersonalAmount,
      employeeInsuranceCalculation?.injuryCompanyAmount,
      employeeInsuranceCalculation?.maternityCompanyAmount,
      employeeInsuranceCalculation?.medicalCompanyAmount,
      employeeInsuranceCalculation?.medicalPersonalAmount,
      employeeInsuranceCalculation?.pensionCompanyAmount,
      employeeInsuranceCalculation?.pensionPersonalAmount,
      employeeInsuranceCalculation?.unemploymentCompanyAmount,
      employeeInsuranceCalculation?.unemploymentPersonalAmount,
      employeeInsuranceDetail?.housingFundCompanyAmount,
      employeeInsuranceDetail?.housingFundPersonalAmount,
      employeeInsuranceDetail?.injuryCompanyAmount,
      employeeInsuranceDetail?.maternityCompanyAmount,
      employeeInsuranceDetail?.medicalCompanyAmount,
      employeeInsuranceDetail?.medicalPersonalAmount,
      employeeInsuranceDetail?.pensionCompanyAmount,
      employeeInsuranceDetail?.pensionPersonalAmount,
      employeeInsuranceDetail?.unemploymentCompanyAmount,
      employeeInsuranceDetail?.unemploymentPersonalAmount,
    ],
  );

  const sortedEmployeeTaxDeductions = useMemo(
    () => [...employeeTaxDeductions].sort((left, right) => {
      const rightTime = new Date(right.startDate || right.createTime || 0).getTime();
      const leftTime = new Date(left.startDate || left.createTime || 0).getTime();
      return rightTime - leftTime || right.id - left.id;
    }),
    [employeeTaxDeductions],
  );

  const assignTotal = useMemo(
    () => sumInputMap(assignForm.salaryData),
    [assignForm.salaryData],
  );

  const adjustmentAfterTotal = useMemo(
    () => sumInputMap(adjustForm.afterSalaryData),
    [adjustForm.afterSalaryData],
  );

  const loadFoundationData = async () => {
    setFoundationLoading(true);
    try {
      const [employeeRes, itemRes, structureRes, gradeRes, levelRes] = await Promise.all([
        listEmployees(),
        listSalaryItems(),
        listSalaryStructures(),
        listSalaryGrades(),
        listJobLevels(),
      ]);

      setEmployees(Array.isArray(employeeRes) ? employeeRes : []);
      setSalaryItems(Array.isArray(itemRes) ? itemRes : []);
      setSalaryStructures(Array.isArray(structureRes) ? structureRes : []);
      setSalaryGrades(Array.isArray(gradeRes) ? gradeRes : []);
      setJobLevels(Array.isArray(levelRes) ? levelRes : []);
    } catch (error) {
      console.error(error);
      toast.error('薪酬基础数据加载失败');
    } finally {
      setFoundationLoading(false);
    }
  };

  const loadEmployeeSalaryList = async (preservedEmployeeId?: number) => {
    setEmployeeSalaryListLoading(true);
    try {
      const data = await listEmployeeSalaries({ status: 'ACTIVE' });
      const rows = Array.isArray(data) ? data : [];
      setEmployeeSalaries(rows);

      let nextSelectedId = '';
      if (preservedEmployeeId && rows.some(item => item.employeeId === preservedEmployeeId)) {
        nextSelectedId = String(preservedEmployeeId);
      } else if (selectedEmployeeId && rows.some(item => String(item.employeeId) === selectedEmployeeId)) {
        nextSelectedId = selectedEmployeeId;
      } else if (rows[0]) {
        nextSelectedId = String(rows[0].employeeId);
      }

      setSelectedEmployeeId(nextSelectedId);
      if (!nextSelectedId) {
        setEmployeeSalaryDetail(null);
      }
    } catch (error) {
      console.error(error);
      toast.error('员工薪资列表加载失败');
    } finally {
      setEmployeeSalaryListLoading(false);
    }
  };

  const loadAdjustmentList = async (
    preservedId?: number,
    nextStatusFilter = adjustmentStatusFilter,
    nextTypeFilter = adjustmentTypeFilter,
  ) => {
    setAdjustmentListLoading(true);
    try {
      const data = await listSalaryAdjustments({
        pageNum: 1,
        pageSize: 50,
        status: nextStatusFilter === ALL_VALUE ? undefined : nextStatusFilter,
        adjustmentType: nextTypeFilter === ALL_VALUE ? undefined : nextTypeFilter,
      });

      const rows = Array.isArray(data?.records) ? data.records : [];
      setSalaryAdjustments(rows);
      setAdjustmentPage(data || null);

      let nextSelectedId = '';
      if (preservedId && rows.some(item => item.id === preservedId)) {
        nextSelectedId = String(preservedId);
      } else if (selectedAdjustmentId && rows.some(item => String(item.id) === selectedAdjustmentId)) {
        nextSelectedId = selectedAdjustmentId;
      } else if (rows[0]) {
        nextSelectedId = String(rows[0].id);
      }

      setSelectedAdjustmentId(nextSelectedId);
      if (!nextSelectedId) {
        setAdjustmentDetail(null);
      }
    } catch (error) {
      console.error(error);
      toast.error('调薪申请列表加载失败');
    } finally {
      setAdjustmentListLoading(false);
    }
  };

  const loadStructureDetail = async (structureId: number) => {
    setStructureDetailLoading(true);
    try {
      setStructureDetail(await getSalaryStructure(structureId));
    } catch (error) {
      console.error(error);
      setStructureDetail(null);
      toast.error('薪资结构详情加载失败');
    } finally {
      setStructureDetailLoading(false);
    }
  };

  const loadEmployeeSalaryDetail = async (employeeId: number) => {
    setEmployeeSalaryDetailLoading(true);
    try {
      setEmployeeSalaryDetail(await getEmployeeSalary(employeeId));
    } catch (error) {
      console.error(error);
      setEmployeeSalaryDetail(null);
      toast.error('员工薪资详情加载失败');
    } finally {
      setEmployeeSalaryDetailLoading(false);
    }
  };

  const loadEmployeeSalaryHistory = async (employeeId: number) => {
    setEmployeeSalaryHistoryLoading(true);
    try {
      const rows = await listEmployeeSalaries({ employeeId });
      setEmployeeSalaryHistory(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error(error);
      setEmployeeSalaryHistory([]);
      toast.error('员工薪资档案历史加载失败');
    } finally {
      setEmployeeSalaryHistoryLoading(false);
    }
  };

  const loadEmployeeAdjustmentHistory = async (employeeId: number) => {
    setEmployeeAdjustmentHistoryLoading(true);
    try {
      const rows = await getSalaryAdjustmentHistory(employeeId);
      setEmployeeAdjustmentHistory(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error(error);
      setEmployeeAdjustmentHistory([]);
      toast.error('调薪履历加载失败');
    } finally {
      setEmployeeAdjustmentHistoryLoading(false);
    }
  };

  const loadEmployeeCompensationProfile = async (employeeId: number, grossSalary: number, effectiveDate?: string | null) => {
    setEmployeeCompensationLoading(true);
    setEmployeeInsuranceDetail(null);
    setEmployeeInsuranceCalculation(null);
    setEmployeeTaxDeductions([]);
    setEmployeeTaxCalculation(null);

    try {
      const { year, month } = getYearMonthFromDate(effectiveDate);

      let insuranceDetail: EmployeeInsuranceDetail | null = null;
      let insuranceCalculation: InsuranceCalculation | null = null;
      let taxDeductions: EmployeeTaxDeduction[] = [];
      let taxCalculation: TaxCalculation | null = null;

      try {
        insuranceDetail = await getEmployeeInsurance(employeeId);
      } catch (error) {
        console.error(error);
      }

      try {
        if (grossSalary > 0) {
          insuranceCalculation = await calculateEmployeeInsurance(employeeId, grossSalary);
        }
      } catch (error) {
        console.error(error);
      }

      try {
        const rows = await listActiveTaxDeductions(employeeId, year, month);
        taxDeductions = Array.isArray(rows) ? rows : [];
      } catch (error) {
        console.error(error);
      }

      try {
        if (grossSalary > 0) {
          const personalInsurance = Number(
            insuranceCalculation?.personalTotalAmount ?? insuranceDetail?.personalTotalAmount ?? 0,
          );
          const taxableIncome = Number(Math.max(grossSalary - personalInsurance, 0).toFixed(2));
          taxCalculation = await calculateTax({
            employeeId,
            taxableIncome,
            year,
            month,
          });
        }
      } catch (error) {
        console.error(error);
      }

      setEmployeeInsuranceDetail(insuranceDetail);
      setEmployeeInsuranceCalculation(insuranceCalculation);
      setEmployeeTaxDeductions(taxDeductions);
      setEmployeeTaxCalculation(taxCalculation);
    } finally {
      setEmployeeCompensationLoading(false);
    }
  };

  const refreshCurrentEmployeeWorkspace = async (record: EmployeeSalary) => {
    const latestGrossSalary =
      employeeSalaryDetail?.employeeId === record.employeeId
        ? Number(employeeSalaryDetail?.totalSalary ?? record.totalSalary ?? 0)
        : Number(record.totalSalary ?? 0);
    const latestEffectiveDate =
      employeeSalaryDetail?.employeeId === record.employeeId
        ? employeeSalaryDetail?.effectiveDate || record.effectiveDate
        : record.effectiveDate;

    await Promise.all([
      loadEmployeeSalaryDetail(record.employeeId),
      loadEmployeeSalaryHistory(record.employeeId),
      loadEmployeeAdjustmentHistory(record.employeeId),
      loadEmployeeCompensationProfile(record.employeeId, latestGrossSalary, latestEffectiveDate),
    ]);
  };

  const loadAdjustmentDetail = async (adjustmentId: number) => {
    setAdjustmentDetailLoading(true);
    try {
      setAdjustmentDetail(await getSalaryAdjustment(adjustmentId));
    } catch (error) {
      console.error(error);
      setAdjustmentDetail(null);
      toast.error('调薪申请详情加载失败');
    } finally {
      setAdjustmentDetailLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      await Promise.all([loadFoundationData(), loadEmployeeSalaryList()]);
      setLoading(false);
      setBootstrapped(true);
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!bootstrapped) return;
    void loadAdjustmentList();
  }, [adjustmentStatusFilter, adjustmentTypeFilter, bootstrapped]);

  useEffect(() => {
    if (!salaryStructures.length) {
      setSelectedStructureId('');
      setStructureDetail(null);
      return;
    }

    if (!selectedStructureId || !salaryStructures.some(item => String(item.id) === selectedStructureId)) {
      setSelectedStructureId(String(salaryStructures[0].id));
    }
  }, [salaryStructures, selectedStructureId]);

  useEffect(() => {
    if (!filteredEmployeeSalaries.length) {
      setSelectedEmployeeId('');
      setEmployeeSalaryDetail(null);
      return;
    }

    if (!selectedEmployeeId || !filteredEmployeeSalaries.some(item => String(item.employeeId) === selectedEmployeeId)) {
      setSelectedEmployeeId(String(filteredEmployeeSalaries[0].employeeId));
    }
  }, [filteredEmployeeSalaries, selectedEmployeeId]);

  useEffect(() => {
    if (!filteredAdjustments.length) {
      setSelectedAdjustmentId('');
      setAdjustmentDetail(null);
      return;
    }

    if (!selectedAdjustmentId || !filteredAdjustments.some(item => String(item.id) === selectedAdjustmentId)) {
      setSelectedAdjustmentId(String(filteredAdjustments[0].id));
    }
  }, [filteredAdjustments, selectedAdjustmentId]);

  useEffect(() => {
    if (!selectedStructureId) return;
    void loadStructureDetail(Number(selectedStructureId));
  }, [selectedStructureId]);

  useEffect(() => {
    if (!currentEmployeeRecord) {
      setEmployeeSalaryHistory([]);
      setEmployeeAdjustmentHistory([]);
      setEmployeeInsuranceDetail(null);
      setEmployeeInsuranceCalculation(null);
      setEmployeeTaxDeductions([]);
      setEmployeeTaxCalculation(null);
      return;
    }

    void refreshCurrentEmployeeWorkspace(currentEmployeeRecord);
  }, [currentEmployeeRecord]);

  useEffect(() => {
    if (!currentAdjustmentRecord) return;
    void loadAdjustmentDetail(currentAdjustmentRecord.id);
  }, [currentAdjustmentRecord]);

  useEffect(() => {
    if (!assignDialogOpen || !assignForm.structureId) {
      setAssignStructurePreview(null);
      return;
    }

    let cancelled = false;
    const loadPreview = async () => {
      try {
        const detail = await getSalaryStructure(assignForm.structureId);
        if (cancelled) return;

        setAssignStructurePreview(detail);
        setAssignForm(prev => {
          const nextSalaryData = { ...prev.salaryData };
          detail.items.forEach(item => {
            const itemKey = String(item.id);
            if (nextSalaryData[itemKey] === undefined) {
              nextSalaryData[itemKey] = '';
            }
          });

          Object.keys(nextSalaryData).forEach(key => {
            if (!detail.items.some(item => String(item.id) === key)) {
              delete nextSalaryData[key];
            }
          });

          return { ...prev, salaryData: nextSalaryData };
        });
      } catch (error) {
        console.error(error);
        setAssignStructurePreview(null);
        toast.error('分配表单加载薪资结构失败');
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [assignDialogOpen, assignForm.structureId]);

  useEffect(() => {
    if (!adjustDialogOpen || !adjustForm.employeeId) {
      setAdjustmentBaseline(null);
      return;
    }

    let cancelled = false;
    const loadBaseline = async () => {
      try {
        const detail = await getEmployeeSalary(adjustForm.employeeId);
        if (cancelled) return;

        setAdjustmentBaseline(detail);
        setAdjustForm(prev => ({
          ...prev,
          afterSalaryData: detail.items.reduce<Record<string, string>>((result, item) => {
            result[String(item.itemId)] = item.amount == null ? '' : String(item.amount);
            return result;
          }, {}),
        }));
      } catch (error) {
        console.error(error);
        setAdjustmentBaseline(null);
        toast.error('调薪表单加载员工现薪失败');
      }
    };

    void loadBaseline();
    return () => {
      cancelled = true;
    };
  }, [adjustDialogOpen, adjustForm.employeeId]);

  const openItemDialog = () => {
    setEditingItemId(null);
    setItemForm(createDefaultItemForm());
    setItemDialogOpen(true);
  };

  const openItemEditDialog = (item: SalaryItem) => {
    setEditingItemId(item.id);
    setItemForm({
      itemCode: item.itemCode,
      itemName: item.itemName,
      itemType: item.itemType,
      category: item.category,
      isTaxable: Boolean(item.isTaxable),
      formula: item.formula || '',
      sortOrder: item.sortOrder ?? 10,
    });
    setItemDialogOpen(true);
  };

  const closeItemDialog = () => {
    setItemDialogOpen(false);
    setEditingItemId(null);
    setItemForm(createDefaultItemForm());
  };

  const openStructureDialog = async () => {
    setEditingStructureId(null);
    setStructureForm({
      ...createDefaultStructureForm(),
      itemIds: salaryItems.slice(0, 3).map(item => item.id),
    });
    setStructureDialogOpen(true);
  };

  const openStructureEditDialog = async (structureId: number) => {
    setActionLoading(true);
    try {
      const detail = structureDetail?.id === structureId ? structureDetail : await getSalaryStructure(structureId);
      setEditingStructureId(structureId);
      setStructureForm({
        structureCode: detail.structureCode,
        structureName: detail.structureName,
        description: detail.description || '',
        itemIds: (detail.items || []).map(item => item.id),
      });
      setStructureDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error('薪资结构编辑数据加载失败');
    } finally {
      setActionLoading(false);
    }
  };

  const closeStructureDialog = () => {
    setStructureDialogOpen(false);
    setEditingStructureId(null);
    setStructureForm(createDefaultStructureForm());
  };

  const openGradeDialog = () => {
    setEditingGradeLevelId(null);
    setGradeForm({ ...createDefaultGradeForm(), levelId: jobLevels[0]?.id || 0 });
    setGradeDialogOpen(true);
  };

  const openGradeEditDialog = (grade: SalaryGrade) => {
    setEditingGradeLevelId(grade.levelId);
    setGradeForm({
      levelId: grade.levelId,
      minSalary: grade.minSalary,
      midSalary: grade.midSalary,
      maxSalary: grade.maxSalary,
      currency: grade.currency || 'CNY',
    });
    setGradeDialogOpen(true);
  };

  const closeGradeDialog = () => {
    setGradeDialogOpen(false);
    setEditingGradeLevelId(null);
    setGradeForm(createDefaultGradeForm());
  };

  const openAssignDialog = () => {
    if (!assignableEmployees.length) {
      toast.error('当前没有待分配薪资的在岗员工');
      return;
    }
    if (!salaryStructures.length) {
      toast.error('请先配置薪资结构');
      return;
    }

    setAssignForm({
      ...createDefaultAssignForm(),
      employeeId: defaultAssignableEmployeeId,
      structureId: Number(selectedStructureId || salaryStructures[0]?.id || 0),
    });
    setAssignStructurePreview(null);
    setAssignDialogOpen(true);
  };

  const openAdjustDialog = () => {
    if (!employeesWithSalary.length) {
      toast.error('当前没有可发起调薪的在岗现薪员工');
      return;
    }

    setAdjustForm({
      ...createDefaultAdjustmentForm(),
      employeeId: defaultAdjustEmployeeId,
    });
    setAdjustmentBaseline(null);
    setAdjustDialogOpen(true);
  };

  const focusEmployeeWorkspace = (employeeId?: number) => {
    setSalaryKeyword('');
    setSalaryHistoryStatusFilter(ALL_VALUE);
    if (employeeId) {
      setSelectedEmployeeId(String(employeeId));
    }
    setTab('employees');
  };

  const focusAdjustmentWorkspace = (adjustmentId?: number, employeeId?: number) => {
    // 真实联调时要保证刚创建或刚流转的记录不会被旧筛选条件“藏起来”。
    setAdjustmentKeyword('');
    setAdjustmentStatusFilter(ALL_VALUE);
    setAdjustmentTypeFilter(ALL_VALUE);
    if (adjustmentId) {
      setSelectedAdjustmentId(String(adjustmentId));
    }
    if (employeeId) {
      setSelectedEmployeeId(String(employeeId));
    }
    setTab('adjustments');
  };

  const handleSaveItem = async () => {
    if (!itemForm.itemCode.trim() || !itemForm.itemName.trim()) {
      toast.error('请填写项目编码和项目名称');
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        ...itemForm,
        itemCode: itemForm.itemCode.trim(),
        itemName: itemForm.itemName.trim(),
        formula: itemForm.formula?.trim() || undefined,
      };

      if (editingItemId) {
        await updateSalaryItem(editingItemId, payload);
        toast.success('薪资项目已更新');
      } else {
        await createSalaryItem(payload);
        toast.success('薪资项目已创建');
      }

      closeItemDialog();
      await loadFoundationData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (editingItemId ? '更新薪资项目失败' : '创建薪资项目失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteItem = async (item: SalaryItem) => {
    if (!window.confirm(`确认删除薪资项目“${item.itemName}”吗？`)) {
      return;
    }

    setActionLoading(true);
    try {
      await deleteSalaryItem(item.id);
      toast.success('薪资项目已删除');
      if (editingItemId === item.id) {
        closeItemDialog();
      }
      await loadFoundationData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '删除薪资项目失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveStructure = async () => {
    if (!structureForm.structureCode.trim() || !structureForm.structureName.trim()) {
      toast.error('请填写结构编码和结构名称');
      return;
    }
    if (!structureForm.itemIds.length) {
      toast.error('至少选择一个薪资项目');
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        ...structureForm,
        structureCode: structureForm.structureCode.trim(),
        structureName: structureForm.structureName.trim(),
        description: structureForm.description?.trim() || undefined,
      };

      if (editingStructureId) {
        await updateSalaryStructure(editingStructureId, payload);
        toast.success('薪资结构已更新');
        closeStructureDialog();
        await loadFoundationData();
        setSelectedStructureId(String(editingStructureId));
      } else {
        const structureId = await createSalaryStructure(payload);
        toast.success('薪资结构已创建');
        closeStructureDialog();
        await loadFoundationData();
        setSelectedStructureId(String(structureId));
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (editingStructureId ? '更新薪资结构失败' : '创建薪资结构失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStructure = async (structure: SalaryStructure | SalaryStructureDetail) => {
    if (!window.confirm(`确认删除薪资结构“${structure.structureName}”吗？`)) {
      return;
    }

    setActionLoading(true);
    try {
      await deleteSalaryStructure(structure.id);
      toast.success('薪资结构已删除');
      if (selectedStructureId === String(structure.id)) {
        setSelectedStructureId('');
        setStructureDetail(null);
      }
      if (editingStructureId === structure.id) {
        closeStructureDialog();
      }
      await loadFoundationData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '删除薪资结构失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetGrade = async () => {
    if (!gradeForm.levelId) {
      toast.error('请选择职级');
      return;
    }
    if (gradeForm.minSalary < 0 || gradeForm.midSalary < 0 || gradeForm.maxSalary < 0) {
      toast.error('薪资区间不能为负数');
      return;
    }
    if (!(gradeForm.minSalary <= gradeForm.midSalary && gradeForm.midSalary <= gradeForm.maxSalary)) {
      toast.error('请确保最低薪资 <= 中位薪资 <= 最高薪资');
      return;
    }

    setActionLoading(true);
    try {
      await setSalaryGrade(gradeForm);
      toast.success(editingGradeLevelId ? '薪级已更新' : '薪级已设置');
      closeGradeDialog();
      await loadFoundationData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (editingGradeLevelId ? '更新薪级失败' : '设置薪级失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteGrade = async (grade: SalaryGrade) => {
    const gradeLabel = [grade.levelCode, grade.levelName].filter(Boolean).join(' / ') || `职级 ${grade.levelId}`;
    if (!window.confirm(`确认删除薪级“${gradeLabel}”吗？`)) {
      return;
    }

    setActionLoading(true);
    try {
      await deleteSalaryGrade(grade.levelId);
      toast.success('薪级已删除');
      await loadFoundationData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '删除薪级失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignSalary = async () => {
    if (!assignForm.employeeId || !assignForm.structureId || !assignForm.effectiveDate) {
      toast.error('请填写员工、薪资结构和生效日期');
      return;
    }

    let salaryData: EmployeeSalaryAssignPayload['salaryData'];
    try {
      salaryData = buildAmountPayload(assignForm.salaryData);
    } catch (error: any) {
      toast.error(error?.message || '薪资明细格式不正确');
      return;
    }

    if (Object.keys(salaryData).length === 0) {
      toast.error('请填写薪资明细');
      return;
    }

    setActionLoading(true);
    try {
      await assignSalaryStructure({
        employeeId: assignForm.employeeId,
        structureId: assignForm.structureId,
        effectiveDate: assignForm.effectiveDate,
        salaryData,
      });
      toast.success('员工薪资已分配');
      setAssignDialogOpen(false);
      focusEmployeeWorkspace(assignForm.employeeId);
      await loadEmployeeSalaryList(assignForm.employeeId);
      await loadFoundationData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '分配员工薪资失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateAdjustment = async () => {
    if (!adjustForm.employeeId || !adjustForm.effectiveDate) {
      toast.error('请先选择员工并填写生效日期');
      return;
    }
    if (!adjustmentBaseline) {
      toast.error('当前员工没有可用的现薪数据');
      return;
    }

    let salaryData: Record<string, number>;
    try {
      salaryData = buildAmountPayload(adjustForm.afterSalaryData);
    } catch (error: any) {
      toast.error(error?.message || '调薪明细格式不正确');
      return;
    }

    const afterTotal = Number(Object.values(salaryData).reduce((sum, value) => sum + value, 0).toFixed(2));
    if (afterTotal <= 0) {
      toast.error('调薪后总额必须大于 0');
      return;
    }

    setActionLoading(true);
    try {
      // 调薪接口会把 afterSalaryData 直接写回员工薪资 JSON，因此这里保留项目 ID 作为 key。
      const adjustmentId = await createSalaryAdjustment({
        employeeId: adjustForm.employeeId,
        adjustmentType: adjustForm.adjustmentType,
        adjustmentReason: adjustForm.adjustmentReason.trim() || undefined,
        afterSalaryData: JSON.stringify(salaryData),
        afterTotal,
        effectiveDate: adjustForm.effectiveDate,
      } as SalaryAdjustmentPayload);
      toast.success('调薪申请已创建');
      setAdjustDialogOpen(false);
      focusAdjustmentWorkspace(adjustmentId, adjustForm.employeeId);
      await loadAdjustmentList(adjustmentId, ALL_VALUE, ALL_VALUE);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '创建调薪申请失败');
    } finally {
      setActionLoading(false);
    }
  };

  const runAdjustmentAction = async (action: () => Promise<void>, successMessage: string) => {
    if (!adjustmentDetail) return;

    setActionLoading(true);
    try {
      const nextAdjustmentId = adjustmentDetail.id;
      const nextEmployeeId = adjustmentDetail.employeeId;
      await action();
      toast.success(successMessage);
      focusAdjustmentWorkspace(nextAdjustmentId, nextEmployeeId);
      await loadAdjustmentList(nextAdjustmentId, ALL_VALUE, ALL_VALUE);
      await loadEmployeeSalaryList(nextEmployeeId);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '调薪操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const openAdjustmentFromHistory = (adjustmentId: number) => {
    setAdjustmentKeyword('');
    setAdjustmentStatusFilter(ALL_VALUE);
    setAdjustmentTypeFilter(ALL_VALUE);
    setSelectedAdjustmentId(String(adjustmentId));
    setTab('adjustments');
  };

  const canSubmitAdjustment = String(adjustmentDetail?.status || '').toUpperCase() === 'DRAFT';
  const canApproveAdjustment = String(adjustmentDetail?.status || '').toUpperCase() === 'APPROVING';
  const canEffectiveAdjustment = String(adjustmentDetail?.status || '').toUpperCase() === 'APPROVED';

  return (
    <>
      <div className="space-y-6">
        <Card className="rounded-3xl border-white/80 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <ShieldCheck size={14} />
                Salary Control
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">薪酬管理中心</h1>
              <p className="mt-2 text-sm text-slate-500">
                把薪资项目、结构、职级区间、员工现薪和调薪申请放到同一页联调，先打通桌面端核心流程。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="rounded-2xl" onClick={openAssignDialog} disabled={!assignableEmployees.length || !salaryStructures.length}>
                <BadgePlus size={16} className="mr-2" />
                分配薪资
              </Button>
              <Button variant="outline" className="rounded-2xl" onClick={openAdjustDialog} disabled={!employeesWithSalary.length}>
                <FilePlus2 size={16} className="mr-2" />
                发起调薪
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => {
                  void Promise.all([loadFoundationData(), loadEmployeeSalaryList(), loadAdjustmentList()]);
                }}
              >
                <RefreshCcw size={16} className="mr-2" />
                刷新全部
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map(metric => (
            <Card key={metric.label} className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-500">{metric.label}</div>
                  <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{loading ? '--' : metric.value}</div>
                  <div className="mt-2 text-xs text-slate-400">{metric.hint}</div>
                </div>
                <div className={`rounded-2xl p-3 ${metric.tone}`}>
                  {metric.icon}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="rounded-2xl bg-white/70">
            <TabsTrigger value="employees">员工薪资</TabsTrigger>
            <TabsTrigger value="adjustments">调薪申请</TabsTrigger>
            <TabsTrigger value="foundation">基础配置</TabsTrigger>
          </TabsList>

          <TabsContent value="employees" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">在岗薪资档案</h2>
                  <p className="mt-1 text-sm text-slate-500">当前只拉生效中的员工薪资，方便直接联调调薪与现薪详情。</p>
                </div>

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

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-700">
                    当前还有 {assignableEmployees.length} 名在岗员工未分配薪资，可直接通过上方“分配薪资”真实写库联调。
                  </div>

                  {resignedEmployeeSalaries.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-700">
                      真实联调发现 {resignedEmployeeSalaries.length} 条 ACTIVE 薪资档案对应的员工已离职。
                      这些记录已从当前工作区和调薪候选中过滤，避免继续对离职员工发起调薪。
                    </div>
                  )}

                  <div className="space-y-3">
                    {filteredEmployeeSalaries.map(item => {
                      const isActive = String(item.employeeId) === selectedEmployeeId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                            isActive
                              ? 'border-emerald-200 bg-emerald-50/80 shadow-sm'
                              : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50'
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
                            <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              {item.statusDesc || item.status}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                            <span>{formatCurrency(item.totalSalary)}</span>
                            <span>生效 {toDateInputValue(item.effectiveDate) || '-'}</span>
                          </div>
                        </button>
                      );
                    })}

                    {!filteredEmployeeSalaries.length && !employeeSalaryListLoading && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-12 text-center text-sm text-slate-500">
                        还没有生效中的员工薪资记录。
                      </div>
                    )}

                    {(loading || employeeSalaryListLoading) && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-12 text-center text-sm text-slate-500">
                        正在加载员工薪资...
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">员工薪资详情</h2>
                      <p className="mt-1 text-sm text-slate-500">详情接口会展开薪资项目明细，适合验证结构绑定和金额写库是否正确。</p>
                    </div>
                    {currentEmployeeRecord && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          void refreshCurrentEmployeeWorkspace(currentEmployeeRecord);
                        }}
                      >
                        <RefreshCcw size={14} className="mr-2" />
                        刷新当前员工
                      </Button>
                    )}
                  </div>

                  {!currentEmployeeRecord && !employeeSalaryDetailLoading && (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
                      先分配一条员工薪资，或从左侧选择一条现有记录。
                    </div>
                  )}

                  {currentEmployeeRecord && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">员工</div>
                          <div className="mt-2 font-semibold text-slate-900">{employeeSalaryDetail?.employeeName || currentEmployeeRecord.employeeName || '-'}</div>
                          <div className="mt-1 text-sm text-slate-500">{employeeSalaryDetail?.employeeNo || currentEmployeeRecord.employeeNo || '-'}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">薪资结构</div>
                          <div className="mt-2 font-semibold text-slate-900">{employeeSalaryDetail?.structureName || currentEmployeeRecord.structureName || '-'}</div>
                          <div className="mt-1 text-sm text-slate-500">{employeeSalaryDetail?.structureCode || currentEmployeeRecord.structureCode || '-'}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">总薪资</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(employeeSalaryDetail?.totalSalary || currentEmployeeRecord.totalSalary)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">生效日期</div>
                          <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(employeeSalaryDetail?.effectiveDate || currentEmployeeRecord.effectiveDate) || '-'}</div>
                          <div className="mt-1 text-sm text-slate-500">{employeeSalaryDetail?.statusDesc || currentEmployeeRecord.statusDesc || currentEmployeeRecord.status}</div>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80">
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
                            {(employeeSalaryDetail?.items || []).map(item => (
                              <TableRow key={item.itemId}>
                                <TableCell className="font-medium text-slate-900">{item.itemName || `项目 ${item.itemId}`}</TableCell>
                                <TableCell>{item.itemCode || '-'}</TableCell>
                                <TableCell>{itemCategoryLabel(item.category)}</TableCell>
                                <TableCell>{formatCurrency(item.amount)}</TableCell>
                              </TableRow>
                            ))}
                            {!employeeSalaryDetail?.items?.length && !employeeSalaryDetailLoading && (
                              <TableRow>
                                <TableCell colSpan={4} className="py-10 text-center text-slate-400">
                                  当前员工薪资没有可展示的项目明细。
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {employeeSalaryDetailLoading && (
                    <div className="mt-4 text-sm text-slate-400">正在加载员工薪资详情...</div>
                  )}
                </Card>

                <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">薪资档案历史</h2>
                      <p className="mt-1 text-sm text-slate-500">读取员工全部薪资档案，直接对比 ACTIVE 与 EXPIRED 记录是否按预期切换。</p>
                    </div>
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

                      {currentEmployeeRecord && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            void loadEmployeeSalaryHistory(currentEmployeeRecord.employeeId);
                          }}
                        >
                          <RefreshCcw size={14} className="mr-2" />
                          刷新历史
                        </Button>
                      )}
                    </div>
                  </div>

                  {!currentEmployeeRecord && !employeeSalaryHistoryLoading && (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
                      先从左侧选择一名员工，再查看薪资档案历史。
                    </div>
                  )}

                  {currentEmployeeRecord && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">档案总数</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-900">{salaryHistoryMetrics.total}</div>
                          <div className="mt-1 text-sm text-slate-500">当前员工所有薪资档案</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">生效中</div>
                          <div className="mt-2 text-2xl font-semibold text-emerald-600">{salaryHistoryMetrics.active}</div>
                          <div className="mt-1 text-sm text-slate-500">正常应只保留 1 条 ACTIVE</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">已失效</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-900">{salaryHistoryMetrics.expired}</div>
                          <div className="mt-1 text-sm text-slate-500">调薪或重新分配后自动沉淀</div>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80">
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
                            {sortedEmployeeSalaryHistory.map(item => (
                              <TableRow key={item.id}>
                                <TableCell>
                                  <div className="font-medium text-slate-900">{item.structureName || '-'}</div>
                                  <div className="mt-1 text-xs text-slate-400">
                                    {[item.structureCode, item.employeeNo].filter(Boolean).join(' / ') || '-'}
                                  </div>
                                </TableCell>
                                <TableCell>{formatCurrency(item.totalSalary)}</TableCell>
                                <TableCell>{toDateInputValue(item.effectiveDate) || '-'}</TableCell>
                                <TableCell>
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${salaryArchiveStatusClass(item.status)}`}>
                                    {salaryArchiveStatusLabel(item.status, item.statusDesc)}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                            {!sortedEmployeeSalaryHistory.length && !employeeSalaryHistoryLoading && (
                              <TableRow>
                                <TableCell colSpan={4} className="py-10 text-center text-slate-400">
                                  当前筛选条件下没有薪资档案记录。
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {employeeSalaryHistoryLoading && (
                    <div className="mt-4 text-sm text-slate-400">正在加载薪资档案历史...</div>
                  )}
                </Card>

                <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">到手收入测算</h2>
                      <p className="mt-1 text-sm text-slate-500">联动五险一金和专项扣除接口，估算员工到手收入与公司用工成本。</p>
                    </div>
                    {currentEmployeeRecord && (
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
                    )}
                  </div>

                  {!currentEmployeeRecord && !employeeCompensationLoading && (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
                      先从左侧选择一名员工，再查看五险一金和个税测算结果。
                    </div>
                  )}

                  {currentEmployeeRecord && (
                    <div className="space-y-4">
                      {!hasInsuranceProfile && !employeeCompensationLoading && (
                        <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-700">
                          当前员工还没有可用的社保公积金方案。页面不会报错或反复提示，但个人社保、公司成本会缺失。
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {[
                          {
                            label: '税前总薪资',
                            value: formatCurrency(currentGrossSalary),
                            hint: '当前员工现薪总额',
                          },
                          {
                            label: '个人社保公积金',
                            value: hasInsuranceProfile ? formatCurrency(currentPersonalInsurance) : '-',
                            hint: '从五险一金测算结果读取',
                          },
                          {
                            label: '应税收入',
                            value: formatCurrency(currentTaxableIncome),
                            hint: '税前减个人社保后的收入',
                          },
                          {
                            label: '个税',
                            value: employeeTaxCalculation ? formatCurrency(currentTaxAmount) : '-',
                            hint: `${taxReferencePeriod} 个税测算`,
                          },
                          {
                            label: '预估到手',
                            value: employeeTaxCalculation ? formatCurrency(currentNetIncome) : '-',
                            hint: '税前减个人社保与个税',
                          },
                          {
                            label: '公司额外缴纳',
                            value: hasInsuranceProfile ? formatCurrency(currentCompanyInsurance) : '-',
                            hint: '公司承担的社保公积金',
                          },
                          {
                            label: '用工总成本',
                            value: hasInsuranceProfile ? formatCurrency(currentEmployerCost) : formatCurrency(currentGrossSalary),
                            hint: '税前薪资 + 公司承担',
                          },
                          {
                            label: '专项扣除合计',
                            value: (employeeTaxCalculation || sortedEmployeeTaxDeductions.length)
                              ? formatCurrency(currentTaxDeductionTotal)
                              : '-',
                            hint: '住房租金、继续教育等',
                          },
                        ].map(metric => (
                          <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                            <div className="text-xs text-slate-400">{metric.label}</div>
                            <div className="mt-2 text-2xl font-semibold text-slate-900">{metric.value}</div>
                            <div className="mt-1 text-sm text-slate-500">{metric.hint}</div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">五险一金拆分</div>
                              <div className="mt-1 text-sm text-slate-500">
                                {employeeInsuranceDetail?.schemeName || '未分配方案'}
                                {employeeInsuranceDetail?.city ? ` / ${employeeInsuranceDetail.city}` : ''}
                              </div>
                            </div>
                            <div className="text-right text-xs text-slate-400">
                              <div>缴费基数 {formatCurrency(employeeInsuranceCalculation?.base ?? employeeInsuranceDetail?.base)}</div>
                              <div className="mt-1">生效 {toDateInputValue(employeeInsuranceDetail?.effectiveDate) || '-'}</div>
                            </div>
                          </div>

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
                                {insuranceBreakdownRows.map(row => {
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
                                  <TableRow>
                                    <TableCell colSpan={4} className="py-10 text-center text-slate-400">
                                      当前没有可展示的社保公积金拆分数据。
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                            <div className="font-semibold text-slate-900">个税测算摘要</div>
                            <div className="mt-1 text-sm text-slate-500">按 {taxReferencePeriod} 的专项扣除配置进行估算。</div>
                            <div className="mt-4 grid grid-cols-1 gap-3">
                              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                                <div className="text-xs text-slate-400">起征点</div>
                                <div className="mt-1 font-semibold text-slate-900">
                                  {employeeTaxCalculation ? formatCurrency(employeeTaxCalculation.threshold) : '-'}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                                <div className="text-xs text-slate-400">专项扣除合计</div>
                                <div className="mt-1 font-semibold text-slate-900">
                                  {(employeeTaxCalculation || sortedEmployeeTaxDeductions.length)
                                    ? formatCurrency(currentTaxDeductionTotal)
                                    : '-'}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                                <div className="text-xs text-slate-400">应纳税所得额</div>
                                <div className="mt-1 font-semibold text-slate-900">
                                  {employeeTaxCalculation ? formatCurrency(currentTaxableAmount) : '-'}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                            <div className="mb-4 flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-900">专项扣除明细</div>
                                <div className="mt-1 text-sm text-slate-500">当前员工处于 ACTIVE 状态的专项扣除项。</div>
                              </div>
                              <div className="text-xs text-slate-400">{taxReferencePeriod}</div>
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-slate-200">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>扣除项</TableHead>
                                    <TableHead>金额</TableHead>
                                    <TableHead>生效区间</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {sortedEmployeeTaxDeductions.map(item => (
                                    <TableRow key={item.id}>
                                      <TableCell>
                                        <div className="font-medium text-slate-900">
                                          {item.deductionTypeName || item.deductionType}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-400">{item.remark || '无备注'}</div>
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
                                    <TableRow>
                                      <TableCell colSpan={3} className="py-10 text-center text-slate-400">
                                        当前员工没有 ACTIVE 状态的专项扣除数据。
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {employeeCompensationLoading && (
                    <div className="mt-4 text-sm text-slate-400">正在加载五险一金与个税测算...</div>
                  )}
                </Card>

                <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">联调提示</h2>
                    <p className="mt-1 text-sm text-slate-500">建议先给一名正式员工分配标准薪资结构，再发起调薪，可以最快看清整条链路。</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
                      如果左侧为空，优先点击“分配薪资”，后端会把旧记录自动置为 EXPIRED，并新建 ACTIVE 档案。
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
                      薪资详情里的项目金额来自员工薪资 JSON 展开，不是前端本地计算出来的临时值。
                    </div>
                  </div>
                </Card>

                <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">调薪履历</h2>
                      <p className="mt-1 text-sm text-slate-500">直接读取员工调薪历史，点任意一条可切到“调薪申请”继续查看单据详情。</p>
                    </div>
                    {currentEmployeeRecord && (
                      <Button variant="outline" onClick={() => void loadEmployeeAdjustmentHistory(currentEmployeeRecord.employeeId)}>
                        <RefreshCcw size={14} className="mr-2" />
                        刷新履历
                      </Button>
                    )}
                  </div>

                  {!currentEmployeeRecord && !employeeAdjustmentHistoryLoading && (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
                      先从左侧选择一名员工，再查看调薪历史。
                    </div>
                  )}

                  {currentEmployeeRecord && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">累计调薪次数</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-900">{sortedEmployeeAdjustmentHistory.length}</div>
                          <div className="mt-1 text-sm text-slate-500">仅统计当前员工的历史调薪单据</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">最近生效日期</div>
                          <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(latestEmployeeAdjustment?.effectiveDate) || '-'}</div>
                          <div className="mt-1 text-sm text-slate-500">{latestEmployeeAdjustment?.applicationNo || '暂无调薪记录'}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">最近状态</div>
                          {latestEmployeeAdjustment ? (
                            <>
                              <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${adjustmentStatusClass(latestEmployeeAdjustment.status)}`}>
                                {adjustmentStatusLabel(latestEmployeeAdjustment.status)}
                              </div>
                              <div className="mt-2 text-sm text-slate-500">{adjustmentTypeLabel(latestEmployeeAdjustment.adjustmentType)}</div>
                            </>
                          ) : (
                            <div className="mt-2 text-sm text-slate-500">暂无调薪记录</div>
                          )}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>申请编号</TableHead>
                              <TableHead>类型</TableHead>
                              <TableHead>调薪变化</TableHead>
                              <TableHead>生效日期</TableHead>
                              <TableHead>状态</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedEmployeeAdjustmentHistory.map(item => {
                              const amount = Number(item.adjustmentAmount || 0);

                              return (
                                <TableRow
                                  key={item.id}
                                  className="cursor-pointer hover:bg-slate-50"
                                  onClick={() => openAdjustmentFromHistory(item.id)}
                                >
                                  <TableCell>
                                    <div className="font-medium text-slate-900">{item.applicationNo}</div>
                                    <div className="mt-1 text-xs text-slate-400">
                                      {item.adjustmentReason || '未填写调薪原因'}
                                    </div>
                                  </TableCell>
                                  <TableCell>{adjustmentTypeLabel(item.adjustmentType)}</TableCell>
                                  <TableCell>
                                    <div className="font-medium text-slate-900">
                                      {formatCurrency(item.beforeTotal)} → {formatCurrency(item.afterTotal)}
                                    </div>
                                    <div className={`mt-1 text-xs ${amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
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
                                </TableRow>
                              );
                            })}
                            {!sortedEmployeeAdjustmentHistory.length && !employeeAdjustmentHistoryLoading && (
                              <TableRow>
                                <TableCell colSpan={5} className="py-10 text-center text-slate-400">
                                  当前员工还没有调薪记录。
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {employeeAdjustmentHistoryLoading && (
                    <div className="mt-4 text-sm text-slate-400">正在加载调薪履历...</div>
                  )}
                </Card>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="adjustments" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
              <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">调薪申请列表</h2>
                  <p className="mt-1 text-sm text-slate-500">状态和类型先走服务端过滤，关键词再做前端补筛，适合开发联调场景。</p>
                </div>

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

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                        {adjustmentTypeOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-700">
                    当前服务端返回 {adjustmentPage?.total || 0} 条调薪记录，审批通过后如果生效日不晚于今天，后端会直接生效。
                  </div>

                  <div className="space-y-3">
                    {filteredAdjustments.map(item => {
                      const isActive = String(item.id) === selectedAdjustmentId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                            isActive
                              ? 'border-amber-200 bg-amber-50/80 shadow-sm'
                              : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50'
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
                        </button>
                      );
                    })}

                    {!filteredAdjustments.length && !adjustmentListLoading && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-12 text-center text-sm text-slate-500">
                        当前筛选条件下没有调薪记录。
                      </div>
                    )}

                    {(adjustmentListLoading || loading) && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-12 text-center text-sm text-slate-500">
                        正在加载调薪申请...
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">调薪详情</h2>
                      <p className="mt-1 text-sm text-slate-500">这里直接展示前后薪资 JSON 的差异，并允许推进真实状态流转。</p>
                    </div>
                    {adjustmentDetail && (
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          disabled={!canSubmitAdjustment || actionLoading}
                          onClick={() => void runAdjustmentAction(() => submitSalaryAdjustment(adjustmentDetail.id), '调薪申请已提交审批')}
                        >
                          提交审批
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!canApproveAdjustment || actionLoading}
                          onClick={() => void runAdjustmentAction(() => approveSalaryAdjustment(adjustmentDetail.id), '调薪申请已审批通过')}
                        >
                          审批通过
                        </Button>
                        <Button
                          disabled={!canEffectiveAdjustment || actionLoading}
                          onClick={() => void runAdjustmentAction(() => effectiveSalaryAdjustment(adjustmentDetail.id), '调薪已生效')}
                        >
                          执行生效
                        </Button>
                      </div>
                    )}
                  </div>

                  {!adjustmentDetail && !adjustmentDetailLoading && (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
                      从左侧选择一条调薪申请，或先发起新的调薪。
                    </div>
                  )}

                  {adjustmentDetail && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">申请编号</div>
                          <div className="mt-2 font-semibold text-slate-900">{adjustmentDetail.applicationNo}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">员工</div>
                          <div className="mt-2 font-semibold text-slate-900">{adjustmentDetail.employeeName || '-'}</div>
                          <div className="mt-1 text-sm text-slate-500">{adjustmentDetail.employeeNo || '-'}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">类型 / 状态</div>
                          <div className="mt-2 font-semibold text-slate-900">{adjustmentTypeLabel(adjustmentDetail.adjustmentType)}</div>
                          <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${adjustmentStatusClass(adjustmentDetail.status)}`}>
                            {adjustmentStatusLabel(adjustmentDetail.status)}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">生效日期</div>
                          <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(adjustmentDetail.effectiveDate) || '-'}</div>
                          <div className="mt-1 text-sm text-slate-500">流程实例：{adjustmentDetail.processInstanceId || '-'}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">调薪前总额</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(adjustmentDetail.beforeTotal)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">调薪后总额</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(adjustmentDetail.afterTotal)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">调薪金额</div>
                          <div className={`mt-2 text-2xl font-semibold ${Number(adjustmentDetail.adjustmentAmount || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatCurrency(adjustmentDetail.adjustmentAmount)}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                          <div className="text-xs text-slate-400">调薪比例</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-900">
                            {Number.isFinite(Number(adjustmentDetail.adjustmentRate))
                              ? `${Number(adjustmentDetail.adjustmentRate).toFixed(2)}%`
                              : '-'}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                        <div className="text-xs text-slate-400">调薪原因</div>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {adjustmentDetail.adjustmentReason || '未填写调薪原因。'}
                        </div>
                      </div>

                      <SalaryDiffTable rows={adjustmentDiffRows} />
                    </div>
                  )}

                  {adjustmentDetailLoading && (
                    <div className="mt-4 text-sm text-slate-400">正在加载调薪详情...</div>
                  )}
                </Card>

                <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">联调提示</h2>
                    <p className="mt-1 text-sm text-slate-500">推荐使用今天或更早的生效日，这样审批通过后更容易观察是否自动生效。</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
                      调薪后明细的金额之和必须等于 `afterTotal`，页面会按明细自动求和，避免手工算错。
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
                      调薪生效后，会生成新的员工薪资记录并把旧的 ACTIVE 记录置为 EXPIRED。
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="foundation" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_minmax(0,1fr)]">
              <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">薪资项目</h2>
                    <p className="mt-1 text-sm text-slate-500">项目列表直接来自真实库，后续结构配置和员工分配都会依赖这里的数据。</p>
                  </div>
                  <Button variant="outline" onClick={openItemDialog}>
                    <FilePlus2 size={14} className="mr-2" />
                    新建项目
                  </Button>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>项目名称</TableHead>
                        <TableHead>编码</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>分类</TableHead>
                        <TableHead>计税</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salaryItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{item.itemName}</div>
                            <div className="text-xs text-slate-400">排序 {item.sortOrder ?? '-'}</div>
                          </TableCell>
                          <TableCell>{item.itemCode}</TableCell>
                          <TableCell>{item.itemTypeDesc || itemTypeLabel(item.itemType)}</TableCell>
                          <TableCell>{item.categoryDesc || itemCategoryLabel(item.category)}</TableCell>
                          <TableCell>{item.isTaxable ? '计税' : '不计税'}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openItemEditDialog(item)}>
                                编辑
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={actionLoading}
                                onClick={() => void handleDeleteItem(item)}
                              >
                                删除
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!salaryItems.length && !foundationLoading && (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-slate-400">
                            当前没有薪资项目数据。
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>

              <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">薪资结构</h2>
                    <p className="mt-1 text-sm text-slate-500">结构详情会展开关联项目，适合核对结构与员工薪资明细是否对齐。</p>
                  </div>
                  <Button variant="outline" onClick={openStructureDialog}>
                    <FilePlus2 size={14} className="mr-2" />
                    新建结构
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    {salaryStructures.map(item => {
                      const isActive = String(item.id) === selectedStructureId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                            isActive
                              ? 'border-sky-200 bg-sky-50/80 shadow-sm'
                              : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                          onClick={() => setSelectedStructureId(String(item.id))}
                        >
                          <div className="font-semibold text-slate-900">{item.structureName}</div>
                          <div className="mt-1 text-xs text-slate-400">{item.structureCode}</div>
                          <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${structureStatusClass(item.status)}`}>
                            {item.statusDesc || (item.status === 1 ? '启用' : '禁用')}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
                    {!structureDetail && !structureDetailLoading && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-12 text-center text-sm text-slate-500">
                        从左侧选择一个薪资结构查看详情。
                      </div>
                    )}

                    {structureDetail && (
                      <div className="space-y-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-xs text-slate-400">结构名称</div>
                            <div className="mt-2 text-xl font-semibold text-slate-900">{structureDetail.structureName}</div>
                            <div className="mt-1 text-sm text-slate-500">{structureDetail.structureCode}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => void openStructureEditDialog(structureDetail.id)}>
                              编辑结构
                            </Button>
                            <Button
                              variant="outline"
                              disabled={actionLoading}
                              onClick={() => void handleDeleteStructure(structureDetail)}
                            >
                              删除结构
                            </Button>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          {structureDetail.description || '当前结构未填写描述。'}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {structureDetail.items?.map(item => (
                            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                              <div className="font-medium text-slate-900">{item.itemName}</div>
                              <div className="mt-1 text-xs text-slate-400">{item.itemCode}</div>
                              <div className="mt-2 text-xs text-slate-500">
                                {item.categoryDesc || itemCategoryLabel(item.category)} / {item.itemTypeDesc || itemTypeLabel(item.itemType)}
                              </div>
                            </div>
                          ))}
                        </div>
                        {!structureDetail.items?.length && (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center text-sm text-slate-500">
                            当前结构还没有关联薪资项目。
                          </div>
                        )}
                      </div>
                    )}

                    {structureDetailLoading && (
                      <div className="text-sm text-slate-400">正在加载薪资结构详情...</div>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">薪资等级</h2>
                  <p className="mt-1 text-sm text-slate-500">薪级区间基于职级维护，目前后端已经支持按职级直接设置或覆盖。</p>
                </div>
                <Button variant="outline" onClick={openGradeDialog}>
                  <Landmark size={14} className="mr-2" />
                  设置薪级
                </Button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>职级</TableHead>
                      <TableHead>最低薪资</TableHead>
                      <TableHead>中位薪资</TableHead>
                      <TableHead>最高薪资</TableHead>
                      <TableHead>币种</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salaryGrades.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{item.levelName || '-'}</div>
                          <div className="text-xs text-slate-400">{item.levelCode || '-'}</div>
                        </TableCell>
                        <TableCell>{formatCurrency(item.minSalary)}</TableCell>
                        <TableCell>{formatCurrency(item.midSalary)}</TableCell>
                        <TableCell>{formatCurrency(item.maxSalary)}</TableCell>
                        <TableCell>{item.currencyDesc || item.currency || '-'}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openGradeEditDialog(item)}>
                              编辑
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionLoading}
                              onClick={() => void handleDeleteGrade(item)}
                            >
                              删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!salaryGrades.length && !foundationLoading && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-slate-400">
                          当前还没有薪资等级数据，可以直接设置一条用于联调。
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {itemDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{editingItemId ? '编辑薪资项目' : '新建薪资项目'}</h2>
                <p className="mt-1 text-sm text-slate-500">先补项目，再配置结构和员工薪资。</p>
              </div>
              <Button variant="ghost" onClick={closeItemDialog}>关闭</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>项目编码</Label>
                <Input value={itemForm.itemCode} onChange={event => setItemForm(prev => ({ ...prev, itemCode: event.target.value }))} />
              </div>
              <div>
                <Label>项目名称</Label>
                <Input value={itemForm.itemName} onChange={event => setItemForm(prev => ({ ...prev, itemName: event.target.value }))} />
              </div>
              <div>
                <Label>项目类型</Label>
                <Select value={itemForm.itemType} onValueChange={value => setItemForm(prev => ({ ...prev, itemType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {itemTypeOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>项目分类</Label>
                <Select value={itemForm.category} onValueChange={value => setItemForm(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {itemCategoryOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>是否计税</Label>
                <Select value={String(itemForm.isTaxable)} onValueChange={value => setItemForm(prev => ({ ...prev, isTaxable: value === 'true' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">计税</SelectItem>
                    <SelectItem value="false">不计税</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>排序号</Label>
                <Input
                  type="number"
                  min={0}
                  value={itemForm.sortOrder ?? 0}
                  onChange={event => setItemForm(prev => ({ ...prev, sortOrder: Number(event.target.value || 0) }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label>计算公式</Label>
                <Textarea
                  rows={4}
                  value={itemForm.formula || ''}
                  onChange={event => setItemForm(prev => ({ ...prev, formula: event.target.value }))}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={closeItemDialog}>取消</Button>
              <Button disabled={actionLoading} onClick={() => void handleSaveItem()}>
                {editingItemId ? '保存修改' : '创建项目'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {structureDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{editingStructureId ? '编辑薪资结构' : '新建薪资结构'}</h2>
                <p className="mt-1 text-sm text-slate-500">至少勾选一个薪资项目，后续员工分配会按结构中的项目录入金额。</p>
              </div>
              <Button variant="ghost" onClick={closeStructureDialog}>关闭</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>结构编码</Label>
                <Input value={structureForm.structureCode} onChange={event => setStructureForm(prev => ({ ...prev, structureCode: event.target.value }))} />
              </div>
              <div>
                <Label>结构名称</Label>
                <Input value={structureForm.structureName} onChange={event => setStructureForm(prev => ({ ...prev, structureName: event.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Label>结构描述</Label>
                <Textarea
                  rows={4}
                  value={structureForm.description || ''}
                  onChange={event => setStructureForm(prev => ({ ...prev, description: event.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label>关联项目</Label>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {salaryItems.map(item => {
                    const selected = structureForm.itemIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          selected
                            ? 'border-sky-200 bg-sky-50 text-sky-700'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                        }`}
                        onClick={() => setStructureForm(prev => ({
                          ...prev,
                          itemIds: prev.itemIds.includes(item.id)
                            ? prev.itemIds.filter(itemId => itemId !== item.id)
                            : [...prev.itemIds, item.id],
                        }))}
                      >
                        <div className="font-medium">{item.itemName}</div>
                        <div className="mt-1 text-xs opacity-80">{item.itemCode}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={closeStructureDialog}>取消</Button>
              <Button disabled={actionLoading} onClick={() => void handleSaveStructure()}>
                {editingStructureId ? '保存修改' : '创建结构'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {gradeDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{editingGradeLevelId ? '编辑薪资等级' : '设置薪资等级'}</h2>
                <p className="mt-1 text-sm text-slate-500">按职级维护薪资区间，已存在则覆盖。</p>
              </div>
              <Button variant="ghost" onClick={closeGradeDialog}>关闭</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>职级</Label>
                <Select
                  value={gradeForm.levelId ? String(gradeForm.levelId) : EMPTY_VALUE}
                  onValueChange={value => setGradeForm(prev => ({ ...prev, levelId: value === EMPTY_VALUE ? 0 : Number(value) }))}
                >
                  <SelectTrigger><SelectValue placeholder="请选择职级" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
                    {jobLevels.map(level => (
                      <SelectItem key={level.id} value={String(level.id)}>
                        {[level.levelCode, level.levelName].filter(Boolean).join(' / ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>最低薪资</Label>
                <Input type="number" min={0} value={gradeForm.minSalary} onChange={event => setGradeForm(prev => ({ ...prev, minSalary: Number(event.target.value || 0) }))} />
              </div>
              <div>
                <Label>中位薪资</Label>
                <Input type="number" min={0} value={gradeForm.midSalary} onChange={event => setGradeForm(prev => ({ ...prev, midSalary: Number(event.target.value || 0) }))} />
              </div>
              <div>
                <Label>最高薪资</Label>
                <Input type="number" min={0} value={gradeForm.maxSalary} onChange={event => setGradeForm(prev => ({ ...prev, maxSalary: Number(event.target.value || 0) }))} />
              </div>
              <div>
                <Label>币种</Label>
                <Select value={gradeForm.currency || 'CNY'} onValueChange={value => setGradeForm(prev => ({ ...prev, currency: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CNY">人民币</SelectItem>
                    <SelectItem value="USD">美元</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={closeGradeDialog}>取消</Button>
              <Button disabled={actionLoading} onClick={() => void handleSetGrade()}>
                {editingGradeLevelId ? '保存修改' : '保存薪级'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {assignDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">分配员工薪资</h2>
                <p className="mt-1 text-sm text-slate-500">分配成功后会直接生成生效中的员工薪资档案。</p>
              </div>
              <Button variant="ghost" onClick={() => setAssignDialogOpen(false)}>关闭</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label>员工</Label>
                <Select
                  value={assignForm.employeeId ? String(assignForm.employeeId) : EMPTY_VALUE}
                  onValueChange={value => setAssignForm(prev => ({ ...prev, employeeId: value === EMPTY_VALUE ? 0 : Number(value) }))}
                >
                  <SelectTrigger><SelectValue placeholder="请选择员工" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
                    {assignableEmployees.map(employee => (
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
                  onValueChange={value => setAssignForm(prev => ({ ...prev, structureId: value === EMPTY_VALUE ? 0 : Number(value) }))}
                >
                  <SelectTrigger><SelectValue placeholder="请选择结构" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
                    {salaryStructures.map(item => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {[item.structureName, item.structureCode].filter(Boolean).join(' / ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>生效日期</Label>
                <Input
                  type="date"
                  value={assignForm.effectiveDate}
                  onChange={event => setAssignForm(prev => ({ ...prev, effectiveDate: event.target.value }))}
                />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">薪资明细</h3>
                  <p className="text-sm text-slate-500">金额总计会随输入实时变化。</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                  合计 {formatCurrency(assignTotal)}
                </div>
              </div>

              <SalaryAmountEditor
                fields={structurePreviewFields}
                valueMap={assignForm.salaryData}
                onValueChange={(fieldKey, value) => setAssignForm(prev => ({
                  ...prev,
                  salaryData: {
                    ...prev.salaryData,
                    [fieldKey]: value,
                  },
                }))}
                emptyText="先选择薪资结构，结构中的项目会自动展开到这里。"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>取消</Button>
              <Button disabled={actionLoading} onClick={() => void handleAssignSalary()}>确认分配</Button>
            </div>
          </div>
        </div>
      )}

      {adjustDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">发起调薪</h2>
                <p className="mt-1 text-sm text-slate-500">先读取员工现薪，再按项目修改调薪后金额。</p>
              </div>
              <Button variant="ghost" onClick={() => setAdjustDialogOpen(false)}>关闭</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <Label>员工</Label>
                <Select
                  value={adjustForm.employeeId ? String(adjustForm.employeeId) : EMPTY_VALUE}
                  onValueChange={value => setAdjustForm(prev => ({ ...prev, employeeId: value === EMPTY_VALUE ? 0 : Number(value) }))}
                >
                  <SelectTrigger><SelectValue placeholder="请选择员工" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
                    {employeesWithSalary.map(employee => (
                      <SelectItem key={employee.id} value={String(employee.id)}>
                        {buildEmployeeLabel(employee)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>调薪类型</Label>
                <Select value={adjustForm.adjustmentType} onValueChange={value => setAdjustForm(prev => ({ ...prev, adjustmentType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {adjustmentTypeOptions.map(option => (
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
                  onChange={event => setAdjustForm(prev => ({ ...prev, effectiveDate: event.target.value }))}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-4">
                <Label>调薪原因</Label>
                <Textarea
                  rows={4}
                  value={adjustForm.adjustmentReason}
                  onChange={event => setAdjustForm(prev => ({ ...prev, adjustmentReason: event.target.value }))}
                />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-400">调薪前总额</div>
                <div className="mt-2 text-xl font-semibold text-slate-900">{formatCurrency(adjustmentBaseline?.totalSalary)}</div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <div className="text-xs text-emerald-600">调薪后总额</div>
                <div className="mt-2 text-xl font-semibold text-emerald-700">{formatCurrency(adjustmentAfterTotal)}</div>
              </div>
              <div className={`rounded-2xl border px-4 py-3 ${adjustmentAfterTotal >= Number(adjustmentBaseline?.totalSalary || 0) ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'}`}>
                <div className={`text-xs ${adjustmentAfterTotal >= Number(adjustmentBaseline?.totalSalary || 0) ? 'text-emerald-600' : 'text-rose-600'}`}>调薪差额</div>
                <div className={`mt-2 text-xl font-semibold ${adjustmentAfterTotal >= Number(adjustmentBaseline?.totalSalary || 0) ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatCurrency(adjustmentAfterTotal - Number(adjustmentBaseline?.totalSalary || 0))}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-slate-900">调薪后明细</h3>
                <p className="text-sm text-slate-500">默认回填现薪金额，直接改成目标金额即可。</p>
              </div>

              <SalaryAmountEditor
                fields={adjustmentEditorFields}
                valueMap={adjustForm.afterSalaryData}
                onValueChange={(fieldKey, value) => setAdjustForm(prev => ({
                  ...prev,
                  afterSalaryData: {
                    ...prev.afterSalaryData,
                    [fieldKey]: value,
                  },
                }))}
                emptyText="先选择一名已有现薪的员工，页面会自动带出当前薪资明细。"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>取消</Button>
              <Button disabled={actionLoading} onClick={() => void handleCreateAdjustment()}>创建调薪申请</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HrSalaryPage;
