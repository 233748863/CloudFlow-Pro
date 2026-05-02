import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layers3, RefreshCcw, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, type BaseDialogWidth } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
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
} from '@/components/common';
import { cn } from '@/utils/cn';
import {
  EmployeeInsurance,
  EmployeeSalary,
  EmployeeSalaryAssignPayload,
  EmployeeSalaryDetail,
  EmployeeInsuranceDetail,
  EmployeeInsuranceAssignPayload,
  EmployeeTaxDeduction,
  EmployeeTaxDeductionPayload,
  EmployeeTaxDeductionUpdatePayload,
  HrEmployee,
  HrPagedResult,
  InsuranceScheme,
  InsuranceSchemePayload,
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
  TaxConfig,
  TaxConfigPayload,
  addTaxDeduction,
  approveSalaryAdjustment,
  assignSalaryStructure,
  assignInsuranceScheme,
  calculateEmployeeInsurance,
  calculateTax,
  createInsuranceScheme,
  createTaxConfig,
  createSalaryAdjustment,
  createSalaryItem,
  createSalaryStructure,
  deleteTaxDeduction,
  deleteSalaryGrade,
  deleteSalaryItem,
  deleteSalaryStructure,
  effectiveSalaryAdjustment,
  getEmployeeInsurance,
  getEmployeeSalary,
  getCurrentTaxConfig,
  getSalaryAdjustment,
  getSalaryAdjustmentHistory,
  getSalaryStructure,
  listEmployees,
  listActiveTaxDeductions,
  listEmployeeInsurances,
  listEmployeeSalaries,
  listInsuranceSchemes,
  listJobLevels,
  listSalaryAdjustments,
  listSalaryGrades,
  listSalaryItems,
  listSalaryStructures,
  listTaxDeductions,
  setSalaryGrade,
  submitSalaryAdjustment,
  updateInsuranceScheme,
  updateTaxDeduction,
  updateTaxConfig,
  updateSalaryItem,
  updateSalaryStructure,
} from '@/services/api/hr';
import { buildEmployeeLabel, toDateInputValue } from './hrShared';
import {
  SalaryGradesSection,
  SalaryInsuranceSection,
  SalaryItemsSection,
  SalaryStructuresSection,
} from './salary/SalaryFoundationSections';
import {
  SalaryAdjustmentsSection,
  SalaryEmployeesSection,
} from './salary/SalaryPrimarySections';
import {
  AssignSalaryDialog,
  CreateAdjustmentDialog,
  InsuranceAssignDialog,
} from './salary/SalaryFormDialogs';
import {
  InsuranceSchemeDialog,
  SalaryGradeDialog,
  SalaryItemDialog,
  SalaryStructureDialog,
} from './salary/SalaryFoundationDialogs';
import {
  TaxConfigDialog,
  TaxDeductionDialog,
} from './salary/SalaryTaxDialogs';

const EMPTY_VALUE = '__empty__';
const ALL_VALUE = '__all__';
const FOUNDATION_SECTIONS = ['items', 'structures', 'grades', 'insurance'] as const;
type FoundationSection = (typeof FOUNDATION_SECTIONS)[number];
type SalarySection = 'employees' | 'adjustments' | FoundationSection;
const SALARY_SECTION_NAV_ITEMS: Array<{ value: SalarySection; label: string }> = [
  { value: 'employees', label: '员工薪资' },
  { value: 'adjustments', label: '调薪申请' },
  { value: 'items', label: '薪资项目' },
  { value: 'structures', label: '薪资结构' },
  { value: 'grades', label: '薪资等级' },
  { value: 'insurance', label: '社保方案' },
];

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

const statusOptions = [
  { value: '1', label: '启用' },
  { value: '0', label: '禁用' },
];

const deductionTypeOptions = [
  { value: 'CHILD_EDU', label: '子女教育' },
  { value: 'CONTINUING_EDU', label: '继续教育' },
  { value: 'MEDICAL', label: '大病医疗' },
  { value: 'HOUSING_LOAN', label: '住房贷款利息' },
  { value: 'HOUSING_RENT', label: '住房租金' },
  { value: 'ELDERLY_CARE', label: '赡养老人' },
];

const taxDeductionStatusOptions = [
  { value: 'ACTIVE', label: '生效中' },
  { value: 'EXPIRED', label: '已失效' },
];

const taxDeductionScopeOptions = [
  { value: 'IN_SCOPE', label: '参与当月测算' },
  { value: 'OUT_OF_SCOPE', label: '未参与当月测算' },
];

const insuranceLedgerStatusOptions = [
  { value: ALL_VALUE, label: '全部台账' },
  { value: 'ACTIVE', label: '生效中' },
  { value: 'EXPIRED', label: '已失效' },
];

const INSURANCE_LEDGER_PAGE_SIZE = 5;
const INSURANCE_SCHEME_CATALOG_PAGE_SIZE = 500;
const EMPLOYEE_INSURANCE_LEDGER_CATALOG_PAGE_SIZE = 200;

const isInsuranceProfileMissingError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message.includes('员工未分配五险一金方案');
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message?: unknown }).message || '').includes('员工未分配五险一金方案');
  }
  return false;
};

type TaxDeductionFormState = {
  employeeId: number;
  deductionType: string;
  amount: number;
  startDate: string;
  endDate: string;
  status: string;
  remark: string;
};

type TaxConfigFormState = {
  id: number | null;
  threshold: string;
  effectiveDate: string;
  deductionItems: Record<string, string>;
  taxBracketsJson: string;
};

type InsuranceSchemeFormState = InsuranceSchemePayload;

type ConfirmDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  onConfirm: null | (() => void | Promise<void>);
};

const createDefaultConfirmDialogState = (): ConfirmDialogState => ({
  open: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  onConfirm: null,
});

const defaultTaxBracketRows = [
  { min: 0, max: 36000, rate: 0.03, deduction: 0 },
  { min: 36000, max: 144000, rate: 0.10, deduction: 2520 },
  { min: 144000, max: 300000, rate: 0.20, deduction: 16920 },
  { min: 300000, max: 420000, rate: 0.25, deduction: 31920 },
  { min: 420000, max: 660000, rate: 0.30, deduction: 52920 },
  { min: 660000, max: 960000, rate: 0.35, deduction: 85920 },
  { min: 960000, rate: 0.45, deduction: 181920 },
];

const defaultTaxBracketJson = JSON.stringify(defaultTaxBracketRows, null, 2);

const defaultTaxDeductionItemPreset: Record<string, string> = {
  CHILD_EDU: '1000',
  CONTINUING_EDU: '400',
  MEDICAL: '0',
  HOUSING_LOAN: '1000',
  HOUSING_RENT: '0',
  ELDERLY_CARE: '2000',
};

const createDefaultTaxDeductionItemValues = () => ({ ...defaultTaxDeductionItemPreset });

const createDefaultItemForm = (): SalaryItemPayload => ({
  itemCode: '',
  itemName: '',
  itemType: 'FIXED',
  category: 'BASIC',
  isTaxable: true,
  formula: '',
  sortOrder: 10,
  status: 1,
});

const createDefaultStructureForm = (): SalaryStructurePayload => ({
  structureCode: '',
  structureName: '',
  description: '',
  itemIds: [],
  status: 1,
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

// 专项扣除接口按“月份”判断是否生效，默认回填到当月 1 号可以直接参与本月测算。
function getMonthStartValue(value?: string | null) {
  const { year, month } = getYearMonthFromDate(value);
  return `${year}-${String(month).padStart(2, '0')}-01`;
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

const createDefaultInsuranceForm = (): EmployeeInsuranceAssignPayload => ({
  employeeId: 0,
  schemeId: 0,
  base: 0,
  effectiveDate: getTodayValue(),
});

const createDefaultTaxDeductionForm = (): TaxDeductionFormState => ({
  employeeId: 0,
  deductionType: deductionTypeOptions[0].value,
  amount: 0,
  startDate: getMonthStartValue(),
  endDate: '',
  status: 'ACTIVE',
  remark: '',
});

const createDefaultTaxConfigForm = (): TaxConfigFormState => ({
  id: null,
  threshold: '5000',
  effectiveDate: getTodayValue(),
  deductionItems: createDefaultTaxDeductionItemValues(),
  taxBracketsJson: defaultTaxBracketJson,
});

const createDefaultInsuranceSchemeForm = (): InsuranceSchemeFormState => ({
  schemeName: '',
  city: '',
  pensionCompanyRate: 16,
  pensionPersonalRate: 8,
  medicalCompanyRate: 9.8,
  medicalPersonalRate: 2,
  unemploymentCompanyRate: 0.5,
  unemploymentPersonalRate: 0.5,
  injuryCompanyRate: 0.4,
  maternityCompanyRate: 0.8,
  housingFundCompanyRate: 12,
  housingFundPersonalRate: 12,
  baseMin: 0,
  baseMax: 0,
  baseRule: '按上年度月平均工资计算',
  effectiveDate: getTodayValue(),
  status: 1,
});

const isFutureDate = (value?: string | null) =>
  Boolean(value) && String(value) > getTodayValue();

const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const formatCurrency = (value?: number | string | null) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `¥${currencyFormatter.format(amount)}`;
};

const formatPercent = (value?: number | string | null) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `${currencyFormatter.format(amount)}%`;
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
  return 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300';
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
  return 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300';
};

const structureStatusClass = (status?: number | null) =>
  'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300';

const deductionTypeLabel = (value?: string | null) =>
  deductionTypeOptions.find(option => option.value === value)?.label || value || '-';

const taxDeductionStatusLabel = (status?: string | null) => {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return '生效中';
    case 'EXPIRED':
      return '已失效';
    default:
      return status || '-';
  }
};

const taxDeductionStatusClass = (status?: string | null) => {
  return 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300';
};

const compactTaxDeductionRemark = (remark?: string | null) => {
  const text = String(remark || '').trim();
  if (!text) return '-';
  if (/(联调|样本|桌面端薪酬|回放|测试)/i.test(text)) return '-';
  return text.length > 18 ? `${text.slice(0, 18)}...` : text;
};

const parseTaxDeductionItemValues = (value?: string | null) => {
  const result = createDefaultTaxDeductionItemValues();
  if (!value) {
    return result;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    deductionTypeOptions.forEach(item => {
      const rawValue = parsed?.[item.value];
      if (rawValue != null && rawValue !== '') {
        result[item.value] = String(rawValue);
      }
    });
  } catch (error) {
    console.error(error);
  }

  return result;
};

const formatTaxBracketsJson = (value?: string | null) => {
  if (!value) {
    return defaultTaxBracketJson;
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch (error) {
    console.error(error);
    return value;
  }
};

const buildTaxConfigForm = (config?: TaxConfig | null): TaxConfigFormState => {
  if (!config) {
    return createDefaultTaxConfigForm();
  }

  return {
    id: config.id,
    threshold: String(config.threshold ?? ''),
    effectiveDate: toDateInputValue(config.effectiveDate) || getTodayValue(),
    deductionItems: parseTaxDeductionItemValues(config.deductionItems),
    taxBracketsJson: formatTaxBracketsJson(config.taxBrackets),
  };
};

const buildInsuranceSchemeForm = (scheme?: InsuranceScheme | null): InsuranceSchemeFormState => {
  if (!scheme) {
    return createDefaultInsuranceSchemeForm();
  }

  return {
    schemeName: scheme.schemeName || '',
    city: scheme.city || '',
    pensionCompanyRate: Number(scheme.pensionCompanyRate ?? 0),
    pensionPersonalRate: Number(scheme.pensionPersonalRate ?? 0),
    medicalCompanyRate: Number(scheme.medicalCompanyRate ?? 0),
    medicalPersonalRate: Number(scheme.medicalPersonalRate ?? 0),
    unemploymentCompanyRate: Number(scheme.unemploymentCompanyRate ?? 0),
    unemploymentPersonalRate: Number(scheme.unemploymentPersonalRate ?? 0),
    injuryCompanyRate: Number(scheme.injuryCompanyRate ?? 0),
    maternityCompanyRate: Number(scheme.maternityCompanyRate ?? 0),
    housingFundCompanyRate: Number(scheme.housingFundCompanyRate ?? 0),
    housingFundPersonalRate: Number(scheme.housingFundPersonalRate ?? 0),
    baseMin: Number(scheme.baseMin ?? 0),
    baseMax: Number(scheme.baseMax ?? 0),
    baseRule: scheme.baseRule || '',
    effectiveDate: toDateInputValue(scheme.effectiveDate) || getTodayValue(),
    status: scheme.status ?? 1,
  };
};

const normalizeTaxBracketJson = (value: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    console.error(error);
    throw new Error('税率档 JSON 格式不正确');
  }

  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('至少保留一条税率档');
  }

  let previousMax: number | null = null;
  const normalized = parsed.map((item, index) => {
    const row = item as Record<string, unknown>;
    const min = Number(row.min);
    const max = row.max == null || row.max === '' ? null : Number(row.max);
    const rate = Number(row.rate);
    const deduction = Number(row.deduction);

    if (!Number.isFinite(min) || min < 0) {
      throw new Error(`第 ${index + 1} 档的起点必须是大于等于 0 的数字`);
    }
    if (max != null && (!Number.isFinite(max) || max <= min)) {
      throw new Error(`第 ${index + 1} 档的终点必须大于起点`);
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new Error(`第 ${index + 1} 档的税率必须在 0 到 1 之间`);
    }
    if (!Number.isFinite(deduction) || deduction < 0) {
      throw new Error(`第 ${index + 1} 档的速算扣除数必须是大于等于 0 的数字`);
    }
    if (previousMax != null && min < previousMax) {
      throw new Error(`第 ${index + 1} 档的起点必须大于等于上一档终点`);
    }

    previousMax = max;
    if (max == null) {
      return { min, rate, deduction };
    }

    return { min, max, rate, deduction };
  });

  return JSON.stringify(normalized);
};

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

const normalizeAmount = (value?: number | string | null) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
};

const getMedianValue = (values: number[]) => {
  if (!values.length) return 0;

  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return normalizeAmount((sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2);
  }

  return normalizeAmount(sortedValues[middleIndex]);
};

const buildSalaryItemAmountMap = (items?: EmployeeSalaryDetail['items'] | null) => {
  const result: Record<string, number> = {};

  (items || []).forEach(item => {
    result[String(item.itemId)] = normalizeAmount(item.amount);
  });

  return result;
};

const salaryDataEquals = (left: Record<string, number>, right: Record<string, number>) => {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)]));
  return keys.every(key => normalizeAmount(left[key]) === normalizeAmount(right[key]));
};

const isSalaryLandingMatched = (
  record?: { effectiveDate?: string | null; totalSalary?: number | string | null } | null,
  effectiveDate?: string | null,
  totalSalary?: number | string | null,
) =>
  Boolean(record)
  && (toDateInputValue(record?.effectiveDate) || '') === (toDateInputValue(effectiveDate) || '')
  && normalizeAmount(record?.totalSalary) === normalizeAmount(totalSalary);

const sortInsuranceLedgerRecords = (records: EmployeeInsurance[]) =>
  [...records].sort((left, right) => {
    const rightEffectiveTime = new Date(right.effectiveDate || right.updateTime || right.createTime || 0).getTime();
    const leftEffectiveTime = new Date(left.effectiveDate || left.updateTime || left.createTime || 0).getTime();
    if (rightEffectiveTime !== leftEffectiveTime) {
      return rightEffectiveTime - leftEffectiveTime;
    }

    if (left.status !== right.status) {
      return left.status === 'ACTIVE' ? -1 : 1;
    }

    const rightUpdateTime = new Date(right.updateTime || right.createTime || 0).getTime();
    const leftUpdateTime = new Date(left.updateTime || left.createTime || 0).getTime();
    return rightUpdateTime - leftUpdateTime || right.id - left.id;
  });

const isInsuranceDetailMatchedWithLedger = (
  detail?: EmployeeInsuranceDetail | null,
  record?: EmployeeInsurance | null,
) =>
  Boolean(detail && record)
  && Number(detail?.schemeId ?? 0) === Number(record?.schemeId ?? 0)
  && normalizeAmount(detail?.base) === normalizeAmount(record?.base)
  && (toDateInputValue(detail?.effectiveDate) || '') === (toDateInputValue(record?.effectiveDate) || '');

const getDateOffsetFromToday = (value?: string | null) => {
  if (!value) return null;

  const target = new Date(`${value}T00:00:00`);
  const today = new Date(`${getTodayValue()}T00:00:00`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(today.getTime())) {
    return null;
  }

  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

const getNormalizedDateValue = (value?: string | null) =>
  toDateInputValue(value) || '';

const getDeductionRangeEndValue = (value?: string | null) =>
  getNormalizedDateValue(value) || '9999-12-31';

const isDeductionRangeOverlapping = (
  leftStart?: string | null,
  leftEnd?: string | null,
  rightStart?: string | null,
  rightEnd?: string | null,
) => {
  const normalizedLeftStart = getNormalizedDateValue(leftStart);
  const normalizedRightStart = getNormalizedDateValue(rightStart);
  if (!normalizedLeftStart || !normalizedRightStart) {
    return false;
  }

  const normalizedLeftEnd = getDeductionRangeEndValue(leftEnd);
  const normalizedRightEnd = getDeductionRangeEndValue(rightEnd);
  return normalizedLeftStart <= normalizedRightEnd && normalizedRightStart <= normalizedLeftEnd;
};

const getYearMonthValue = (value?: string | null) => {
  const normalizedValue = toDateInputValue(value);
  return normalizedValue ? normalizedValue.slice(0, 7) : '';
};

// 专项扣除按月份参与个税测算，这里统一按 YYYY-MM 判断当前表单会不会命中本月。
const isTaxDeductionInReferencePeriod = (
  startDate?: string | null,
  endDate?: string | null,
  referencePeriod?: string | null,
) => {
  if (!referencePeriod) {
    return false;
  }

  const startMonth = getYearMonthValue(startDate);
  if (!startMonth) {
    return false;
  }

  const endMonth = getYearMonthValue(endDate);
  return startMonth <= referencePeriod && (!endMonth || endMonth >= referencePeriod);
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
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {fields.map(field => (
        <div key={field.key} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="font-medium text-slate-900">{field.label}</div>
          <Input
            className="mt-4"
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
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-400">
        当前没有可展示的薪资明细差异。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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

const WorkspaceInlineState: React.FC<{
  title: string;
  description?: string;
  type?: 'loading' | 'default';
  className?: string;
}> = ({ title, type = 'default', className }) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center px-4 py-8 text-center',
      className,
    )}
  >
    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {type === 'loading' ? (
        <RefreshCcw className="h-4 w-4 animate-spin" />
      ) : (
        <Layers3 className="h-4 w-4" />
      )}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const WorkspaceTableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  type?: 'loading' | 'default';
}> = ({ colSpan, title, type = 'default' }) => (
  <TableRow className="hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-14">
      <WorkspaceInlineState
        title={title}
        type={type}
        className={type === 'loading' ? 'py-6' : 'py-4'}
      />
    </TableCell>
  </TableRow>
);

const WorkspaceSectionCard: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  headerAside?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, headerAside, className, children }) => (
  <section
    className={cn(
      'overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88',
      className,
    )}
  >
    <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      </div>
      {headerAside ? <div className="flex flex-wrap items-center gap-2">{headerAside}</div> : null}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

type WorkspaceMetricStripTone = 'default' | 'emerald' | 'amber' | 'sky' | 'rose';

type WorkspaceMetricStripItem = {
  key: string;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: WorkspaceMetricStripTone;
  valueClassName?: string;
};

const workspaceMetricToneClassMap: Record<WorkspaceMetricStripTone, {
  label: string;
  value: string;
  hint: string;
}> = {
  default: {
    label: 'text-slate-400 dark:text-slate-500',
    value: 'text-slate-900 dark:text-slate-100',
    hint: 'text-slate-500 dark:text-slate-400',
  },
  emerald: {
    label: 'text-slate-400 dark:text-slate-500',
    value: 'text-slate-900 dark:text-slate-100',
    hint: 'text-slate-500 dark:text-slate-400',
  },
  amber: {
    label: 'text-slate-400 dark:text-slate-500',
    value: 'text-slate-900 dark:text-slate-100',
    hint: 'text-slate-500 dark:text-slate-400',
  },
  sky: {
    label: 'text-slate-400 dark:text-slate-500',
    value: 'text-slate-900 dark:text-slate-100',
    hint: 'text-slate-500 dark:text-slate-400',
  },
  rose: {
    label: 'text-slate-400 dark:text-slate-500',
    value: 'text-slate-900 dark:text-slate-100',
    hint: 'text-slate-500 dark:text-slate-400',
  },
};

type WorkspaceSummaryTone = 'default' | 'success' | 'warning' | 'danger';

const resolveWorkspaceSummaryTone = (className?: string): WorkspaceSummaryTone => {
  const normalized = String(className || '');
  if (normalized.includes('rose')) return 'danger';
  if (normalized.includes('amber')) return 'warning';
  if (normalized.includes('emerald') || normalized.includes('sky') || normalized.includes('teal')) return 'success';
  return 'default';
};

const workspaceSummaryDotClassMap: Record<WorkspaceSummaryTone, string> = {
  default: 'bg-slate-400 dark:bg-slate-500',
  success: 'bg-teal-500 dark:bg-teal-400',
  warning: 'bg-amber-500 dark:bg-amber-400',
  danger: 'bg-rose-500 dark:bg-rose-400',
};

const WorkspaceMetricStrip: React.FC<{
  items: WorkspaceMetricStripItem[];
  className?: string;
  gridClassName?: string;
}> = ({ items, className, gridClassName = 'md:grid-cols-2 xl:grid-cols-4' }) => (
  <div
    className={cn(
      'overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88',
      className,
    )}
  >
    <div className={cn('grid grid-cols-1 divide-y divide-slate-200/80 dark:divide-slate-800 md:divide-y-0 md:divide-x', gridClassName)}>
      {items.map(item => {
        const tone = workspaceMetricToneClassMap[item.tone || 'default'];
        return (
          <div key={item.key} className="px-3.5 py-2.5">
            <div className={cn('text-[10px] font-medium uppercase tracking-[0.12em]', tone.label)}>
              {item.label}
            </div>
            <div className={cn('mt-1.5 text-sm font-semibold', tone.value, item.valueClassName)}>
              {item.value}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const WorkspaceDiagnosticSummary: React.FC<{
  summary: {
    label: string;
    hint: string;
    className: string;
  };
  items: Array<{
    key: string;
    title: string;
    detail: string;
    severity?: 'warning' | 'danger';
  }>;
  emptyText?: React.ReactNode;
  className?: string;
}> = ({ summary, items, emptyText, className }) => (
  <div
    className={cn(
      'overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88',
      className,
    )}
  >
    <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {items.length ? '校验' : '状态'}
        </div>
      </div>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            workspaceSummaryDotClassMap[resolveWorkspaceSummaryTone(summary.className)],
          )}
        />
        {summary.label}
      </span>
    </div>
    {items.length ? (
      <div className="border-t border-slate-100 dark:border-slate-800">
        {items.map(item => (
          <div
            key={item.key}
            className="border-t border-slate-100 px-4 py-3 first:border-t-0 dark:border-slate-800"
          >
            <div
              className={cn(
                'text-sm font-medium',
                item.severity === 'danger'
                  ? 'text-rose-700 dark:text-rose-300'
                  : 'text-slate-900 dark:text-slate-100',
              )}
            >
              {item.title}
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.detail}</div>
          </div>
        ))}
      </div>
    ) : emptyText ? (
      <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {emptyText}
      </div>
    ) : null}
  </div>
);

const WorkspaceInlineRiskList: React.FC<{
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
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/88"
        >
          <span
            className={cn(
              'mt-1 inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full',
              item.severity === 'danger'
                ? 'bg-rose-500 dark:bg-rose-400'
                : 'bg-amber-500 dark:bg-amber-400',
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

const DetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}> = ({ label, value, valueClassName }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-3.5 py-2.5 last:border-b-0 dark:border-slate-800">
    <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
      {label}
    </div>
    <div className={cn('text-right text-sm font-medium text-slate-900 dark:text-slate-100', valueClassName)}>
      {value}
    </div>
  </div>
);

const WorkspaceDialogShell: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  width?: BaseDialogWidth;
  maxWidthClassName?: string;
  headerAside?: React.ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
}> = ({
  title,
  onClose,
  children,
  width = 'wide',
  maxWidthClassName,
  headerAside,
  panelClassName,
  bodyClassName,
}) => (
  <BaseDialog
    open
    title={title}
    onClose={onClose}
    width={width}
    maxWidthClassName={maxWidthClassName}
    headerAside={headerAside}
    panelClassName={panelClassName}
    bodyClassName={bodyClassName}
  >
    {children}
  </BaseDialog>
);

export const HrSalaryPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [salaryItems, setSalaryItems] = useState<SalaryItem[]>([]);
  const [salaryStructures, setSalaryStructures] = useState<SalaryStructure[]>([]);
  const [salaryStructureDetailMap, setSalaryStructureDetailMap] = useState<Record<number, SalaryStructureDetail>>({});
  const [salaryGrades, setSalaryGrades] = useState<SalaryGrade[]>([]);
  const [insuranceSchemes, setInsuranceSchemes] = useState<InsuranceScheme[]>([]);
  const [jobLevels, setJobLevels] = useState<JobLevelOption[]>([]);
  const [employeeSalaries, setEmployeeSalaries] = useState<EmployeeSalary[]>([]);
  const [salaryAdjustments, setSalaryAdjustments] = useState<SalaryAdjustment[]>([]);
  const [employeeAdjustmentHistory, setEmployeeAdjustmentHistory] = useState<SalaryAdjustmentHistory[]>([]);
  const [employeeSalaryHistory, setEmployeeSalaryHistory] = useState<EmployeeSalary[]>([]);
  const [employeeInsuranceDetail, setEmployeeInsuranceDetail] = useState<EmployeeInsuranceDetail | null>(null);
  const [employeeInsuranceLedgerPage, setEmployeeInsuranceLedgerPage] = useState<HrPagedResult<EmployeeInsurance> | null>(null);
  const [employeeInsuranceLedgerCatalog, setEmployeeInsuranceLedgerCatalog] = useState<EmployeeInsurance[]>([]);
  const [insuranceLedgerCatalog, setInsuranceLedgerCatalog] = useState<EmployeeInsurance[]>([]);
  const [employeeInsuranceCalculation, setEmployeeInsuranceCalculation] = useState<InsuranceCalculation | null>(null);
  const [employeeTaxDeductions, setEmployeeTaxDeductions] = useState<EmployeeTaxDeduction[]>([]);
  const [employeeAllTaxDeductions, setEmployeeAllTaxDeductions] = useState<EmployeeTaxDeduction[]>([]);
  const [employeeTaxCalculation, setEmployeeTaxCalculation] = useState<TaxCalculation | null>(null);
  const [currentTaxConfig, setCurrentTaxConfig] = useState<TaxConfig | null>(null);
  const [adjustmentPage, setAdjustmentPage] = useState<HrPagedResult<SalaryAdjustment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [foundationLoading, setFoundationLoading] = useState(false);
  const [employeeSalaryListLoading, setEmployeeSalaryListLoading] = useState(false);
  const [employeeSalaryDetailLoading, setEmployeeSalaryDetailLoading] = useState(false);
  const [employeeAdjustmentHistoryLoading, setEmployeeAdjustmentHistoryLoading] = useState(false);
  const [employeeSalaryHistoryLoading, setEmployeeSalaryHistoryLoading] = useState(false);
  const [employeeCompensationLoading, setEmployeeCompensationLoading] = useState(false);
  const [employeeInsuranceListLoading, setEmployeeInsuranceListLoading] = useState(false);
  const [taxDeductionListLoading, setTaxDeductionListLoading] = useState(false);
  const [taxConfigDialogLoading, setTaxConfigDialogLoading] = useState(false);
  const [confirmDialogState, setConfirmDialogState] = useState<ConfirmDialogState>(createDefaultConfirmDialogState);
  const [structureDetailLoading, setStructureDetailLoading] = useState(false);
  const [adjustmentListLoading, setAdjustmentListLoading] = useState(false);
  const [adjustmentDetailLoading, setAdjustmentDetailLoading] = useState(false);
  const [adjustmentEmployeeSalaryLoading, setAdjustmentEmployeeSalaryLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedAdjustmentId, setSelectedAdjustmentId] = useState('');
  const [salaryKeyword, setSalaryKeyword] = useState('');
  const [salaryDeptFilter, setSalaryDeptFilter] = useState(ALL_VALUE);
  const [salaryStructureFilter, setSalaryStructureFilter] = useState(ALL_VALUE);
  const [salaryHistoryStatusFilter, setSalaryHistoryStatusFilter] = useState(ALL_VALUE);
  const [insuranceLedgerStatusFilter, setInsuranceLedgerStatusFilter] = useState(ALL_VALUE);
  const [insuranceLedgerPageNum, setInsuranceLedgerPageNum] = useState(1);
  const [adjustmentKeyword, setAdjustmentKeyword] = useState('');
  const [adjustmentStatusFilter, setAdjustmentStatusFilter] = useState(ALL_VALUE);
  const [adjustmentTypeFilter, setAdjustmentTypeFilter] = useState(ALL_VALUE);
  const [adjustmentEmployeeFilter, setAdjustmentEmployeeFilter] = useState(ALL_VALUE);
  const [adjustmentEffectiveStart, setAdjustmentEffectiveStart] = useState('');
  const [adjustmentEffectiveEnd, setAdjustmentEffectiveEnd] = useState('');
  const [structureDetail, setStructureDetail] = useState<SalaryStructureDetail | null>(null);
  const [employeeSalaryDetail, setEmployeeSalaryDetail] = useState<EmployeeSalaryDetail | null>(null);
  const [adjustmentDetail, setAdjustmentDetail] = useState<SalaryAdjustment | null>(null);
  const [adjustmentEmployeeSalaryDetail, setAdjustmentEmployeeSalaryDetail] = useState<EmployeeSalaryDetail | null>(null);
  const [adjustmentEmployeeSalaryHistory, setAdjustmentEmployeeSalaryHistory] = useState<EmployeeSalary[]>([]);
  const [adjustmentFormHistory, setAdjustmentFormHistory] = useState<SalaryAdjustmentHistory[]>([]);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [structureDialogOpen, setStructureDialogOpen] = useState(false);
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false);
  const [insuranceDialogOpen, setInsuranceDialogOpen] = useState(false);
  const [insuranceSchemeDialogOpen, setInsuranceSchemeDialogOpen] = useState(false);
  const [taxDeductionDialogOpen, setTaxDeductionDialogOpen] = useState(false);
  const [taxConfigDialogOpen, setTaxConfigDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingStructureId, setEditingStructureId] = useState<number | null>(null);
  const [editingGradeLevelId, setEditingGradeLevelId] = useState<number | null>(null);
  const [editingInsuranceSchemeId, setEditingInsuranceSchemeId] = useState<number | null>(null);
  const [editingTaxDeductionId, setEditingTaxDeductionId] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState<SalaryItemPayload>(createDefaultItemForm);
  const [structureForm, setStructureForm] = useState<SalaryStructurePayload>(createDefaultStructureForm);
  const [gradeForm, setGradeForm] = useState<SalaryGradePayload>(createDefaultGradeForm);
  const [insuranceForm, setInsuranceForm] = useState<EmployeeInsuranceAssignPayload>(createDefaultInsuranceForm);
  const [insuranceSchemeCityFilter, setInsuranceSchemeCityFilter] = useState(ALL_VALUE);
  const [insuranceSchemeStatusFilter, setInsuranceSchemeStatusFilter] = useState(ALL_VALUE);
  const [taxDeductionTypeFilter, setTaxDeductionTypeFilter] = useState(ALL_VALUE);
  const [taxDeductionStatusFilter, setTaxDeductionStatusFilter] = useState(ALL_VALUE);
  const [taxDeductionScopeFilter, setTaxDeductionScopeFilter] = useState(ALL_VALUE);
  const [insuranceSchemeForm, setInsuranceSchemeForm] = useState<InsuranceSchemeFormState>(createDefaultInsuranceSchemeForm);
  const [taxDeductionForm, setTaxDeductionForm] = useState<TaxDeductionFormState>(createDefaultTaxDeductionForm);
  const [taxConfigForm, setTaxConfigForm] = useState<TaxConfigFormState>(createDefaultTaxConfigForm);
  const [assignForm, setAssignForm] = useState(createDefaultAssignForm);
  const [adjustForm, setAdjustForm] = useState(createDefaultAdjustmentForm);
  const [assignStructurePreview, setAssignStructurePreview] = useState<SalaryStructureDetail | null>(null);
  const [adjustmentBaseline, setAdjustmentBaseline] = useState<EmployeeSalaryDetail | null>(null);

  const currentSection = useMemo<SalarySection>(() => {
    if (location.pathname.startsWith('/hr/salary/adjustments')) return 'adjustments';
    for (const section of FOUNDATION_SECTIONS) {
      if (location.pathname.startsWith(`/hr/salary/${section}`)) {
        return section;
      }
    }
    if (location.pathname.startsWith('/hr/salary/foundation')) return 'items';
    return 'employees';
  }, [location.pathname]);

  const goSalarySection = (section: SalarySection) => {
    const targetPath = `/hr/salary/${section}`;
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  };

  useEffect(() => {
    if (location.pathname === '/hr/salary' || location.pathname === '/hr/salary/') {
      navigate('/hr/salary/employees', { replace: true });
    }
    if (location.pathname === '/hr/salary/foundation' || location.pathname === '/hr/salary/foundation/') {
      navigate('/hr/salary/items', { replace: true });
    }
  }, [location.pathname, navigate]);

  const salaryItemMap = useMemo(
    () => new Map(salaryItems.map(item => [String(item.id), item])),
    [salaryItems],
  );
  const insuranceSchemeMap = useMemo(
    () => new Map(insuranceSchemes.map(item => [item.id, item])),
    [insuranceSchemes],
  );
  const salaryStructureDetails = useMemo(
    () => Object.values(salaryStructureDetailMap),
    [salaryStructureDetailMap],
  );

  const enabledSalaryItems = useMemo(
    () => salaryItems.filter(item => item.status !== 0),
    [salaryItems],
  );

  const enabledSalaryStructures = useMemo(
    () => salaryStructures.filter(item => item.status !== 0),
    [salaryStructures],
  );

  const enabledInsuranceSchemes = useMemo(
    () => insuranceSchemes.filter(item => item.status !== 0),
    [insuranceSchemes],
  );

  const sortedInsuranceSchemes = useMemo(
    () => [...insuranceSchemes].sort((left, right) => {
      if (left.status !== right.status) {
        return Number(right.status ?? 0) - Number(left.status ?? 0);
      }

      const rightTime = new Date(right.effectiveDate || right.createTime || 0).getTime();
      const leftTime = new Date(left.effectiveDate || left.createTime || 0).getTime();
      return rightTime - leftTime || Number(right.id) - Number(left.id);
    }),
    [insuranceSchemes],
  );

  const insuranceSchemeCityOptions = useMemo(
    () => Array.from(new Set(
      insuranceSchemes
        .map(item => item.city)
        .filter((value): value is string => Boolean(value && String(value).trim())),
    ))
      .sort((left, right) => left.localeCompare(right, 'zh-CN'))
      .map(city => ({ value: city, label: city })),
    [insuranceSchemes],
  );

  const filteredInsuranceSchemes = useMemo(
    () => sortedInsuranceSchemes.filter(item => {
      const cityMatched = insuranceSchemeCityFilter === ALL_VALUE || item.city === insuranceSchemeCityFilter;
      const statusMatched = insuranceSchemeStatusFilter === ALL_VALUE || String(item.status ?? 1) === insuranceSchemeStatusFilter;
      return cityMatched && statusMatched;
    }),
    [insuranceSchemeCityFilter, insuranceSchemeStatusFilter, sortedInsuranceSchemes],
  );

  const insuranceSchemeStats = useMemo(() => ({
    total: insuranceSchemes.length,
    enabled: insuranceSchemes.filter(item => item.status !== 0).length,
    disabled: insuranceSchemes.filter(item => item.status === 0).length,
    matched: filteredInsuranceSchemes.length,
  }), [filteredInsuranceSchemes.length, insuranceSchemes]);

  const employeeMap = useMemo(
    () => new Map(employees.map(employee => [employee.id, employee])),
    [employees],
  );

  const insuranceSchemeUsageMap = useMemo(
    () => insuranceLedgerCatalog.reduce((result, record) => {
      const current = result.get(record.schemeId) || {
        recordCount: 0,
        activeRecordCount: 0,
        futureRecordCount: 0,
        expiredRecordCount: 0,
        employeeIds: new Set<number>(),
        activeEmployeeIds: new Set<number>(),
        sampleEmployeeNames: [] as string[],
      };

      current.recordCount += 1;
      current.employeeIds.add(record.employeeId);
      if (record.employeeName && !current.sampleEmployeeNames.includes(record.employeeName) && current.sampleEmployeeNames.length < 3) {
        current.sampleEmployeeNames.push(record.employeeName);
      }

      const employee = employeeMap.get(record.employeeId);
      const isWorkingEmployee = employee ? employee.employeeStatus !== 'RESIGNED' : true;
      const isActiveLedger = String(record.status || '').toUpperCase() === 'ACTIVE';

      if (isActiveLedger) {
        current.activeRecordCount += 1;
        if (isWorkingEmployee) {
          current.activeEmployeeIds.add(record.employeeId);
        }
        if (isFutureDate(record.effectiveDate)) {
          current.futureRecordCount += 1;
        }
      } else {
        current.expiredRecordCount += 1;
      }

      result.set(record.schemeId, current);
      return result;
    }, new Map<number, {
      recordCount: number;
      activeRecordCount: number;
      futureRecordCount: number;
      expiredRecordCount: number;
      employeeIds: Set<number>;
      activeEmployeeIds: Set<number>;
      sampleEmployeeNames: string[];
    }>()),
    [employeeMap, insuranceLedgerCatalog],
  );

  const activeLinkedInsuranceSchemes = useMemo(
    () => insuranceSchemes.filter(item => Boolean(insuranceSchemeUsageMap.get(item.id)?.activeRecordCount)),
    [insuranceSchemeUsageMap, insuranceSchemes],
  );

  const unusedInsuranceSchemes = useMemo(
    () => insuranceSchemes.filter(item => !insuranceSchemeUsageMap.get(item.id)?.recordCount),
    [insuranceSchemeUsageMap, insuranceSchemes],
  );

  const expiredOnlyInsuranceSchemes = useMemo(
    () => insuranceSchemes.filter(item => {
      const usage = insuranceSchemeUsageMap.get(item.id);
      return Boolean(usage?.recordCount) && !usage?.activeRecordCount;
    }),
    [insuranceSchemeUsageMap, insuranceSchemes],
  );

  const disabledLinkedInsuranceSchemes = useMemo(
    () => insuranceSchemes.filter(item => Number(item.status ?? 1) === 0 && Boolean(insuranceSchemeUsageMap.get(item.id)?.recordCount)),
    [insuranceSchemeUsageMap, insuranceSchemes],
  );

  const invalidBaseInsuranceSchemes = useMemo(
    () => insuranceSchemes.filter(item => Number(item.baseMin ?? 0) > Number(item.baseMax ?? 0)),
    [insuranceSchemes],
  );

  const insuranceSchemeRiskItems = useMemo(() => {
    const items: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];

    if (invalidBaseInsuranceSchemes.length > 0) {
      items.push({
        key: 'invalid-base-range',
        title: '存在基数区间异常',
        detail: `当前有 ${invalidBaseInsuranceSchemes.length} 个社保方案的基数下限高于上限，联调前需要先修正。`,
        severity: 'danger',
      });
    }

    if (disabledLinkedInsuranceSchemes.length > 0) {
      items.push({
        key: 'disabled-linked-schemes',
        title: '禁用方案仍有历史台账',
        detail: `当前有 ${disabledLinkedInsuranceSchemes.length} 个禁用方案仍被台账引用，核对历史数据时要注意不要误判为当前有效方案。`,
        severity: 'danger',
      });
    }

    if (expiredOnlyInsuranceSchemes.length > 0) {
      items.push({
        key: 'expired-only-schemes',
        title: '存在仅保留历史台账的方案',
        detail: `${expiredOnlyInsuranceSchemes.map(item => item.schemeName).join('、')} 当前都没有 ACTIVE 台账，只能作为历史样本参考。`,
        severity: 'warning',
      });
    }

    if (unusedInsuranceSchemes.length > 0) {
      items.push({
        key: 'unused-schemes',
        title: '存在未命中员工的方案',
        detail: `${unusedInsuranceSchemes.map(item => item.schemeName).join('、')} 未命中员工样本。`,
        severity: 'warning',
      });
    }

    return items;
  }, [
    disabledLinkedInsuranceSchemes,
    expiredOnlyInsuranceSchemes,
    invalidBaseInsuranceSchemes.length,
    unusedInsuranceSchemes,
  ]);

  const insuranceSchemeRiskSummary = useMemo(() => {
    const score = insuranceSchemeRiskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    if (!score) {
      return {
        label: '可分配',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '方案状态与样本已对齐。',
      };
    }

    if (score <= 2) {
      return {
        label: '待核对',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        hint: `${insuranceSchemeRiskItems.length} 条待处理。`,
      };
    }

    return {
      label: '待补样本',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      hint: `${insuranceSchemeRiskItems.length} 条待处理。`,
    };
  }, [insuranceSchemeRiskItems]);

  const insuranceSchemeFormDiagnostics = useMemo(() => {
    const trimmedName = insuranceSchemeForm.schemeName.trim();
    const trimmedCity = insuranceSchemeForm.city.trim();
    const trimmedBaseRule = (insuranceSchemeForm.baseRule || '').trim();
    const selectedEffectiveDate = insuranceSchemeForm.effectiveDate || '';
    const editingScheme = editingInsuranceSchemeId
      ? insuranceSchemes.find(item => item.id === editingInsuranceSchemeId) || null
      : null;
    const usage = editingInsuranceSchemeId
      ? insuranceSchemeUsageMap.get(editingInsuranceSchemeId) || null
      : null;
    const companyTotalRate = normalizeAmount(
      Number(insuranceSchemeForm.pensionCompanyRate || 0)
      + Number(insuranceSchemeForm.medicalCompanyRate || 0)
      + Number(insuranceSchemeForm.unemploymentCompanyRate || 0)
      + Number(insuranceSchemeForm.injuryCompanyRate || 0)
      + Number(insuranceSchemeForm.maternityCompanyRate || 0)
      + Number(insuranceSchemeForm.housingFundCompanyRate || 0),
    );
    const personalTotalRate = normalizeAmount(
      Number(insuranceSchemeForm.pensionPersonalRate || 0)
      + Number(insuranceSchemeForm.medicalPersonalRate || 0)
      + Number(insuranceSchemeForm.unemploymentPersonalRate || 0)
      + Number(insuranceSchemeForm.housingFundPersonalRate || 0),
    );
    const totalRate = normalizeAmount(companyTotalRate + personalTotalRate);
    const duplicateIdentityTarget = trimmedName && trimmedCity && selectedEffectiveDate
      ? insuranceSchemes.find(item =>
        item.id !== editingInsuranceSchemeId
        && String(item.schemeName || '').trim() === trimmedName
        && String(item.city || '').trim() === trimmedCity
        && (toDateInputValue(item.effectiveDate) || '') === selectedEffectiveDate,
      ) || null
      : null;
    const sameCityEffectiveTargets = trimmedCity && selectedEffectiveDate
      ? insuranceSchemes.filter(item =>
        item.id !== editingInsuranceSchemeId
        && String(item.city || '').trim() === trimmedCity
        && (toDateInputValue(item.effectiveDate) || '') === selectedEffectiveDate
        && Number(item.status ?? 1) === 1
      )
      : [];
    const emptyBaseRange = Number(insuranceSchemeForm.baseMin || 0) === 0 && Number(insuranceSchemeForm.baseMax || 0) === 0;
    const allRatesZero = companyTotalRate <= 0 && personalTotalRate <= 0;
    const extremeRate = companyTotalRate > 100 || personalTotalRate > 100 || totalRate > 150;
    const noChanges = Boolean(editingScheme)
      && trimmedName === String(editingScheme?.schemeName || '').trim()
      && trimmedCity === String(editingScheme?.city || '').trim()
      && selectedEffectiveDate === (toDateInputValue(editingScheme?.effectiveDate) || '')
      && trimmedBaseRule === String(editingScheme?.baseRule || '').trim()
      && Number(insuranceSchemeForm.status ?? 1) === Number(editingScheme?.status ?? 1)
      && normalizeAmount(insuranceSchemeForm.baseMin) === normalizeAmount(editingScheme?.baseMin)
      && normalizeAmount(insuranceSchemeForm.baseMax) === normalizeAmount(editingScheme?.baseMax)
      && normalizeAmount(insuranceSchemeForm.pensionCompanyRate) === normalizeAmount(editingScheme?.pensionCompanyRate)
      && normalizeAmount(insuranceSchemeForm.pensionPersonalRate) === normalizeAmount(editingScheme?.pensionPersonalRate)
      && normalizeAmount(insuranceSchemeForm.medicalCompanyRate) === normalizeAmount(editingScheme?.medicalCompanyRate)
      && normalizeAmount(insuranceSchemeForm.medicalPersonalRate) === normalizeAmount(editingScheme?.medicalPersonalRate)
      && normalizeAmount(insuranceSchemeForm.unemploymentCompanyRate) === normalizeAmount(editingScheme?.unemploymentCompanyRate)
      && normalizeAmount(insuranceSchemeForm.unemploymentPersonalRate) === normalizeAmount(editingScheme?.unemploymentPersonalRate)
      && normalizeAmount(insuranceSchemeForm.injuryCompanyRate) === normalizeAmount(editingScheme?.injuryCompanyRate)
      && normalizeAmount(insuranceSchemeForm.maternityCompanyRate) === normalizeAmount(editingScheme?.maternityCompanyRate)
      && normalizeAmount(insuranceSchemeForm.housingFundCompanyRate) === normalizeAmount(editingScheme?.housingFundCompanyRate)
      && normalizeAmount(insuranceSchemeForm.housingFundPersonalRate) === normalizeAmount(editingScheme?.housingFundPersonalRate);
    const disablesLinkedScheme = Number(insuranceSchemeForm.status ?? 1) !== 1 && Boolean(usage?.recordCount);
    const inUseParameterChanged = Boolean(
      editingScheme
      && usage?.recordCount
      && !noChanges
      && (
        selectedEffectiveDate !== (toDateInputValue(editingScheme?.effectiveDate) || '')
        || trimmedBaseRule !== String(editingScheme?.baseRule || '').trim()
        || normalizeAmount(insuranceSchemeForm.baseMin) !== normalizeAmount(editingScheme?.baseMin)
        || normalizeAmount(insuranceSchemeForm.baseMax) !== normalizeAmount(editingScheme?.baseMax)
        || normalizeAmount(insuranceSchemeForm.pensionCompanyRate) !== normalizeAmount(editingScheme?.pensionCompanyRate)
        || normalizeAmount(insuranceSchemeForm.pensionPersonalRate) !== normalizeAmount(editingScheme?.pensionPersonalRate)
        || normalizeAmount(insuranceSchemeForm.medicalCompanyRate) !== normalizeAmount(editingScheme?.medicalCompanyRate)
        || normalizeAmount(insuranceSchemeForm.medicalPersonalRate) !== normalizeAmount(editingScheme?.medicalPersonalRate)
        || normalizeAmount(insuranceSchemeForm.unemploymentCompanyRate) !== normalizeAmount(editingScheme?.unemploymentCompanyRate)
        || normalizeAmount(insuranceSchemeForm.unemploymentPersonalRate) !== normalizeAmount(editingScheme?.unemploymentPersonalRate)
        || normalizeAmount(insuranceSchemeForm.injuryCompanyRate) !== normalizeAmount(editingScheme?.injuryCompanyRate)
        || normalizeAmount(insuranceSchemeForm.maternityCompanyRate) !== normalizeAmount(editingScheme?.maternityCompanyRate)
        || normalizeAmount(insuranceSchemeForm.housingFundCompanyRate) !== normalizeAmount(editingScheme?.housingFundCompanyRate)
        || normalizeAmount(insuranceSchemeForm.housingFundPersonalRate) !== normalizeAmount(editingScheme?.housingFundPersonalRate)
      ),
    );

    let modeLabel = '等待填写方案信息';
    let modeHint = '先把方案名称、城市和基数范围填完整，再判断这次保存会不会影响现有台账链路。';
    if (trimmedName || trimmedCity || selectedEffectiveDate || editingInsuranceSchemeId) {
      if (noChanges) {
        modeLabel = '无变化重复保存';
        modeHint = '当前输入和现有方案完全一致，继续保存通常只会重复覆盖一份相同口径。';
      } else if (!editingInsuranceSchemeId) {
        modeLabel = '新建社保方案';
        modeHint = '保存后方案会进入员工分配池，后续还需要补一条员工台账才能形成真实联调样本。';
      } else if (disablesLinkedScheme) {
        modeLabel = '禁用在用方案';
        modeHint = `当前方案仍命中 ${usage?.recordCount || 0} 条台账，禁用后只会阻止后续新分配，不会自动迁移历史台账。`;
      } else if (inUseParameterChanged) {
        modeLabel = '调整在用方案口径';
        modeHint = '当前方案已经进入真实台账链路，修改比例、基数或生效日后要重点核对受影响员工。';
      } else {
        modeLabel = '覆盖现有方案';
        modeHint = '保存后会直接刷新方案参数，后续员工分配和台账测算会基于新口径继续。';
      }
    }

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (trimmedName || trimmedCity || selectedEffectiveDate || editingInsuranceSchemeId) {
      if (!trimmedName) {
        riskItems.push({
          key: 'missing-name',
          title: '还没有填写方案名称',
          detail: '方案名称会直接出现在员工分配弹窗和台账明细里，建议先使用稳定命名。',
          severity: 'warning',
        });
      }
      if (!trimmedCity) {
        riskItems.push({
          key: 'missing-city',
          title: '还没有填写适用城市',
          detail: '没有城市时无法快速判断基数规则和方案适用范围。',
          severity: 'warning',
        });
      }
      if (!selectedEffectiveDate) {
        riskItems.push({
          key: 'missing-effective-date',
          title: '还没有填写方案生效日期',
          detail: '没有生效日期就无法判断这套方案会从哪一天开始进入员工社保链路。',
          severity: 'danger',
        });
      }
      if (duplicateIdentityTarget) {
        riskItems.push({
          key: 'duplicate-scheme-identity',
          title: '方案口径与现有方案重复',
          detail: `${duplicateIdentityTarget.schemeName} 已经在 ${duplicateIdentityTarget.city || '-'} / ${(toDateInputValue(duplicateIdentityTarget.effectiveDate) || '-')} 存在一套同名同城同生效日方案。`,
          severity: 'danger',
        });
      }
      if (sameCityEffectiveTargets.length > 0) {
        riskItems.push({
          key: 'same-city-effective',
          title: '同城同日已存在启用方案',
          detail: `${trimmedCity} 在 ${selectedEffectiveDate} 已有 ${sameCityEffectiveTargets.length} 套启用方案，后续员工分配时要明确选用哪一套。`,
          severity: 'warning',
        });
      }
      if (emptyBaseRange) {
        riskItems.push({
          key: 'empty-base-range',
          title: '基数范围仍是默认空值',
          detail: '当前基数上下限都还是 0，后续员工分配时很难据此判断基数是否合理。',
          severity: 'warning',
        });
      }
      if (allRatesZero) {
        riskItems.push({
          key: 'all-rates-zero',
          title: '公司和个人比例当前全部为 0',
          detail: '这会生成一套空壳方案，员工分配后社保测算结果会全部归零。',
          severity: 'danger',
        });
      }
      if (extremeRate) {
        riskItems.push({
          key: 'extreme-total-rate',
          title: '当前比例合计明显偏高',
          detail: `公司 ${formatPercent(companyTotalRate)} / 个人 ${formatPercent(personalTotalRate)} / 合计 ${formatPercent(totalRate)}，建议联调前再确认口径。`,
          severity: 'warning',
        });
      }
      if (!trimmedBaseRule) {
        riskItems.push({
          key: 'missing-base-rule',
          title: '基数规则说明为空',
          detail: '后续核对基数上下限时缺少可读说明，容易让联调样本失去参照。',
          severity: 'warning',
        });
      }
      if (disablesLinkedScheme) {
        riskItems.push({
          key: 'disable-linked-scheme',
          title: '正在禁用一个已命中台账的方案',
          detail: `当前方案已命中 ${usage?.recordCount || 0} 条台账，其中 ACTIVE ${usage?.activeRecordCount || 0} 条、命中 ${usage?.activeEmployeeIds.size || 0} 名在岗员工。`,
          severity: 'danger',
        });
      }
      if (inUseParameterChanged) {
        riskItems.push({
          key: 'change-linked-scheme',
          title: '正在调整一套已进入台账链路的方案',
          detail: `当前方案已经命中 ${usage?.recordCount || 0} 条台账、${usage?.activeEmployeeIds.size || 0} 名在岗员工，改口径后要重查受影响样本。`,
          severity: 'warning',
        });
      }
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !(trimmedName || trimmedCity || selectedEffectiveDate || editingInsuranceSchemeId)
      ? {
        label: '等待填写',
        className: 'border-slate-200 bg-slate-50 text-slate-600',
        hint: '先把方案名称、城市和生效日期填完整，再判断这次保存风险。',
      }
      : !score
        ? {
          label: '可直接保存',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          hint: '当前方案口径、台账命中和比例汇总都比较清晰，可以继续保存。',
        }
        : score <= 2
          ? {
            label: '保存需注意',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `发现 ${riskItems.length} 条需要人工确认的社保方案保存提示。`,
          }
          : {
            label: '保存存在风险',
            className: 'border-rose-200 bg-rose-50 text-rose-700',
            hint: `当前有 ${riskItems.length} 条高风险提示，建议先调整方案参数再保存。`,
          };

    return {
      usage,
      companyTotalRate,
      personalTotalRate,
      totalRate,
      modeLabel,
      modeHint,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [
    editingInsuranceSchemeId,
    insuranceSchemeForm.baseMax,
    insuranceSchemeForm.baseMin,
    insuranceSchemeForm.baseRule,
    insuranceSchemeForm.city,
    insuranceSchemeForm.effectiveDate,
    insuranceSchemeForm.housingFundCompanyRate,
    insuranceSchemeForm.housingFundPersonalRate,
    insuranceSchemeForm.injuryCompanyRate,
    insuranceSchemeForm.maternityCompanyRate,
    insuranceSchemeForm.medicalCompanyRate,
    insuranceSchemeForm.medicalPersonalRate,
    insuranceSchemeForm.pensionCompanyRate,
    insuranceSchemeForm.pensionPersonalRate,
    insuranceSchemeForm.schemeName,
    insuranceSchemeForm.status,
    insuranceSchemeForm.unemploymentCompanyRate,
    insuranceSchemeForm.unemploymentPersonalRate,
    insuranceSchemeUsageMap,
    insuranceSchemes,
  ]);

  const jobLevelMap = useMemo(
    () => new Map(jobLevels.map(level => [level.id, level])),
    [jobLevels],
  );

  const sortedJobLevels = useMemo(
    () => [...jobLevels].sort((left, right) => {
      const seriesCompare = String(left.levelSeries || '').localeCompare(String(right.levelSeries || ''), 'zh-CN');
      if (seriesCompare !== 0) return seriesCompare;
      const rankCompare = Number(left.levelRank || 0) - Number(right.levelRank || 0);
      if (rankCompare !== 0) return rankCompare;
      return String(left.levelCode || '').localeCompare(String(right.levelCode || ''), 'zh-CN');
    }),
    [jobLevels],
  );

  const salaryDeptOptions = useMemo(
    () => Array.from(
      employees.reduce((result, employee) => {
        if (employee.deptId && employee.deptName) {
          result.set(employee.deptId, employee.deptName);
        }
        return result;
      }, new Map<number, string>()),
    )
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
    [employees],
  );

  const salaryStructureOptions = useMemo(
    () => [...salaryStructures]
      .sort((left, right) => left.structureName.localeCompare(right.structureName, 'zh-CN'))
      .map(item => ({
        value: item.id,
        label: [item.structureName, item.structureCode].filter(Boolean).join(' / '),
      })),
    [salaryStructures],
  );

  const adjustmentEmployeeOptions = useMemo(
    () => [...employees]
      .sort((left, right) => {
        const nameCompare = String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN');
        if (nameCompare !== 0) return nameCompare;
        return String(left.employeeNo || '').localeCompare(String(right.employeeNo || ''), 'zh-CN');
      })
      .map(employee => ({
        value: employee.id,
        label: buildEmployeeLabel(employee) || `员工 #${employee.id}`,
      })),
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
  const activeEmployeeSalaryMap = useMemo(
    () => new Map(workingEmployeeSalaries.map(record => [record.employeeId, record])),
    [workingEmployeeSalaries],
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

  const adjustmentListDiagnostics = useMemo(() => {
    const duplicateEmployeeDateGroups = Array.from(
      salaryAdjustments.reduce((result, item) => {
        const effectiveDate = toDateInputValue(item.effectiveDate);
        if (!effectiveDate) return result;
        const key = `${item.employeeId}__${effectiveDate}`;
        const current = result.get(key) || {
          employeeId: item.employeeId,
          employeeName: item.employeeName || employeeMap.get(item.employeeId)?.name || `员工 #${item.employeeId}`,
          effectiveDate,
          count: 0,
        };
        current.count += 1;
        result.set(key, current);
        return result;
      }, new Map<string, {
        employeeId: number;
        employeeName: string;
        effectiveDate: string;
        count: number;
      }>()),
    )
      .map(([, value]) => value)
      .filter(item => item.count > 1)
      .sort((left, right) => right.count - left.count || left.effectiveDate.localeCompare(right.effectiveDate));
    const duplicateEmployeeDateMap = new Map(
      duplicateEmployeeDateGroups.map(item => [`${item.employeeId}__${item.effectiveDate}`, item]),
    );
    const rowIssueMap = new Map<number, Array<{ key: string; label: string; detail: string; severity: 'warning' | 'danger' }>>();
    let matchedCurrentCount = 0;
    let pendingPastDueCount = 0;
    let currentMismatchCount = 0;
    let statusLagCount = 0;
    let futureEffectiveCount = 0;
    let resignedPendingCount = 0;

    const pushRowIssue = (
      recordId: number,
      issue: { key: string; label: string; detail: string; severity: 'warning' | 'danger' },
    ) => {
      const current = rowIssueMap.get(recordId) || [];
      current.push(issue);
      rowIssueMap.set(recordId, current);
    };

    salaryAdjustments.forEach(item => {
      const effectiveDate = toDateInputValue(item.effectiveDate) || '';
      const duplicateGroup = duplicateEmployeeDateMap.get(`${item.employeeId}__${effectiveDate}`);
      const currentSalary = activeEmployeeSalaryMap.get(item.employeeId) || null;
      const matchedCurrent = isSalaryLandingMatched(currentSalary, item.effectiveDate, item.afterTotal);
      const currentEffectiveDate = toDateInputValue(currentSalary?.effectiveDate) || '';
      const status = String(item.status || '').toUpperCase();
      const futureEffective = isFutureDate(item.effectiveDate);
      const employee = employeeMap.get(item.employeeId);
      const isResigned = employee?.employeeStatus === 'RESIGNED';

      if (duplicateGroup) {
        pushRowIssue(item.id, {
          key: 'duplicate-employee-date',
          label: '同日多单',
          detail: `${duplicateGroup.effectiveDate} / ${duplicateGroup.count} 张`,
          severity: duplicateGroup.count > 1 ? 'warning' : 'warning',
        });
      }

      if (futureEffective) {
        futureEffectiveCount += 1;
        pushRowIssue(item.id, {
          key: 'future-effective',
          label: '未来生效',
          detail: `${effectiveDate} 生效`,
          severity: 'warning',
        });
      }

      if (matchedCurrent) {
        matchedCurrentCount += 1;
        pushRowIssue(item.id, {
          key: 'matched-current',
          label: '已落当前现薪',
          detail: '已对齐 ACTIVE 现薪',
          severity: 'warning',
        });
      }

      if (isResigned && ['DRAFT', 'APPROVING', 'APPROVED'].includes(status)) {
        resignedPendingCount += 1;
        pushRowIssue(item.id, {
          key: 'resigned-pending',
          label: '离职员工待推进',
          detail: '离职员工',
          severity: 'warning',
        });
      }

      switch (status) {
        case 'EFFECTIVE':
          if (!matchedCurrent) {
            if (currentSalary && currentEffectiveDate > effectiveDate) {
              pushRowIssue(item.id, {
                key: 'covered-by-newer-salary',
                label: '已被后续覆盖',
                detail: `${currentEffectiveDate} 现薪已覆盖`,
                severity: 'warning',
              });
            } else if (currentSalary && currentEffectiveDate < effectiveDate && !futureEffective) {
              currentMismatchCount += 1;
              pushRowIssue(item.id, {
                key: 'effective-not-current',
                label: '已生效未追平',
                detail: `${currentEffectiveDate || '-'} / ${formatCurrency(currentSalary.totalSalary)}`,
                severity: 'danger',
              });
            } else if (!currentSalary && !futureEffective) {
              currentMismatchCount += 1;
              pushRowIssue(item.id, {
                key: 'effective-no-current-salary',
                label: '已生效无现薪',
                detail: '无 ACTIVE 现薪',
                severity: 'danger',
              });
            }
          }
          break;
        case 'APPROVED':
          if (matchedCurrent) {
            statusLagCount += 1;
            pushRowIssue(item.id, {
              key: 'approved-but-current',
              label: '状态滞后',
              detail: 'APPROVED 已落当前',
              severity: 'danger',
            });
          } else if (!futureEffective) {
            pendingPastDueCount += 1;
            pushRowIssue(item.id, {
              key: 'approved-past-due',
              label: '到期未执行',
              detail: `${effectiveDate} 已到期`,
              severity: 'danger',
            });
          }
          break;
        case 'APPROVING':
          if (matchedCurrent) {
            statusLagCount += 1;
            pushRowIssue(item.id, {
              key: 'approving-but-current',
              label: '审批中已落当前',
              detail: 'APPROVING 已落当前',
              severity: 'danger',
            });
          } else if (!futureEffective) {
            pendingPastDueCount += 1;
            pushRowIssue(item.id, {
              key: 'approving-past-due',
              label: '审批滞后',
              detail: `${effectiveDate} 已到期`,
              severity: 'warning',
            });
          }
          break;
        case 'DRAFT':
          if (matchedCurrent) {
            statusLagCount += 1;
            pushRowIssue(item.id, {
              key: 'draft-but-current',
              label: '草稿已落当前',
              detail: 'DRAFT 已落当前',
              severity: 'danger',
            });
          } else if (!futureEffective) {
            pendingPastDueCount += 1;
            pushRowIssue(item.id, {
              key: 'stale-draft',
              label: '草稿过期',
              detail: `${effectiveDate} 已到期`,
              severity: 'warning',
            });
          }
          break;
        case 'REJECTED':
          if (matchedCurrent) {
            statusLagCount += 1;
            pushRowIssue(item.id, {
              key: 'rejected-but-current',
              label: '已拒绝却落当前',
              detail: 'REJECTED 已落当前',
              severity: 'danger',
            });
          }
          break;
        default:
          break;
      }
    });

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (currentMismatchCount > 0) {
      riskItems.push({
        key: 'current-mismatch',
        title: '现薪未追平',
        detail: `${currentMismatchCount} 条`,
        severity: 'danger',
      });
    }
    if (pendingPastDueCount > 0) {
      riskItems.push({
        key: 'pending-past-due',
        title: '到期未推进',
        detail: `${pendingPastDueCount} 条`,
        severity: 'danger',
      });
    }
    if (statusLagCount > 0) {
      riskItems.push({
        key: 'status-lag',
        title: '状态不同步',
        detail: `${statusLagCount} 条`,
        severity: 'danger',
      });
    }
    if (duplicateEmployeeDateGroups.length > 0) {
      const first = duplicateEmployeeDateGroups[0];
      riskItems.push({
        key: 'duplicate-employee-date',
        title: '同日多单',
        detail: `${first.employeeName} / ${first.effectiveDate} / ${first.count} 张`,
        severity: 'warning',
      });
    }
    if (futureEffectiveCount > 0) {
      riskItems.push({
        key: 'future-effective',
        title: '未来生效',
        detail: `${futureEffectiveCount} 条`,
        severity: 'warning',
      });
    }
    if (resignedPendingCount > 0) {
      riskItems.push({
        key: 'resigned-pending',
        title: '离职待推进',
        detail: `${resignedPendingCount} 条`,
        severity: 'warning',
      });
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !score
      ? {
        label: '可核对',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '申请链路已对齐。',
      }
      : score <= 2
        ? {
          label: '待核对',
          className: 'border-amber-200 bg-amber-50 text-amber-700',
          hint: `${riskItems.length} 条待处理。`,
        }
        : {
          label: '待处理',
          className: 'border-rose-200 bg-rose-50 text-rose-700',
          hint: `${riskItems.length} 条待处理。`,
        };

    return {
      matchedCurrentCount,
      pendingPastDueCount,
      currentMismatchCount,
      duplicateEmployeeDateGroups,
      futureEffectiveCount,
      riskItems,
      riskSummary,
      rowIssueMap,
    };
  }, [activeEmployeeSalaryMap, employeeMap, salaryAdjustments]);

  const sortedSalaryGrades = useMemo(
    () => [...salaryGrades].sort((left, right) => {
      const leftLevel = jobLevelMap.get(left.levelId);
      const rightLevel = jobLevelMap.get(right.levelId);

      const seriesCompare = String(leftLevel?.levelSeries || left.levelCode || '').localeCompare(
        String(rightLevel?.levelSeries || right.levelCode || ''),
        'zh-CN',
      );
      if (seriesCompare !== 0) return seriesCompare;

      const rankCompare = Number(leftLevel?.levelRank || 0) - Number(rightLevel?.levelRank || 0);
      if (rankCompare !== 0) return rankCompare;

      return String(left.levelCode || '').localeCompare(String(right.levelCode || ''), 'zh-CN');
    }),
    [jobLevelMap, salaryGrades],
  );

  const configuredGradeLevelIds = useMemo(
    () => new Set(salaryGrades.map(item => item.levelId)),
    [salaryGrades],
  );

  const activeJobLevels = useMemo(
    () => sortedJobLevels.filter(level => level.status !== 0),
    [sortedJobLevels],
  );

  const pendingGradeLevels = useMemo(
    () => activeJobLevels.filter(level => !configuredGradeLevelIds.has(level.id)),
    [activeJobLevels, configuredGradeLevelIds],
  );

  const gradeSeriesSummary = useMemo(
    () => Array.from(
      activeJobLevels.reduce((result, level) => {
        const seriesKey = level.levelSeries || '未分组';
        const current = result.get(seriesKey) || { total: 0, configured: 0 };
        current.total += 1;
        if (configuredGradeLevelIds.has(level.id)) {
          current.configured += 1;
        }
        result.set(seriesKey, current);
        return result;
      }, new Map<string, { total: number; configured: number }>()),
    ).map(([series, stats]) => ({
      series,
      total: stats.total,
      configured: stats.configured,
    })),
    [activeJobLevels, configuredGradeLevelIds],
  );

  const highestSalaryGrade = useMemo(
    () => sortedSalaryGrades.reduce<SalaryGrade | null>((result, item) => {
      if (!result) return item;
      return Number(item.maxSalary || 0) > Number(result.maxSalary || 0) ? item : result;
    }, null),
    [sortedSalaryGrades],
  );

  const gradeCoverageRate = activeJobLevels.length
    ? Number(((sortedSalaryGrades.length / activeJobLevels.length) * 100).toFixed(1))
    : 0;

  const gradeSeriesCoverage = useMemo(
    () => gradeSeriesSummary.map(item => {
      const coverage = item.total
        ? Number(((item.configured / item.total) * 100).toFixed(1))
        : 0;
      const missing = Math.max(item.total - item.configured, 0);

      if (item.configured === item.total) {
        return {
          ...item,
          coverage,
          missing,
          cardClassName: 'border-slate-200 bg-white',
          textClassName: 'text-slate-900 dark:text-slate-100',
          barClassName: 'bg-slate-400',
        };
      }

      if (item.configured === 0) {
        return {
          ...item,
          coverage,
          missing,
          cardClassName: 'border-slate-200 bg-white',
          textClassName: 'text-slate-900 dark:text-slate-100',
          barClassName: 'bg-slate-400',
        };
      }

      return {
        ...item,
        coverage,
        missing,
        cardClassName: 'border-slate-200 bg-white',
        textClassName: 'text-slate-900 dark:text-slate-100',
        barClassName: 'bg-slate-400',
      };
    }),
    [gradeSeriesSummary],
  );

  const uncoveredGradeSeries = useMemo(
    () => gradeSeriesCoverage.filter(item => item.configured < item.total),
    [gradeSeriesCoverage],
  );

  const emptyGradeSeries = useMemo(
    () => gradeSeriesCoverage.filter(item => item.configured === 0),
    [gradeSeriesCoverage],
  );

  const salaryGradeDiagnostics = useMemo(() => {
    const rowIssueMap = new Map<number, Array<{
      key: string;
      label: string;
      detail: string;
      severity: 'warning' | 'danger';
    }>>();
    const overlapPairs: Array<{
      series: string;
      left: SalaryGrade;
      right: SalaryGrade;
      overlapAmount: number;
    }> = [];
    const invalidRanges: Array<{
      grade: SalaryGrade;
      reason: string;
    }> = [];
    const overlapGradeIds = new Set<number>();
    const invalidGradeIds = new Set<number>();
    const previousBySeries = new Map<string, SalaryGrade>();

    const pushRowIssue = (
      gradeId: number,
      issue: {
        key: string;
        label: string;
        detail: string;
        severity: 'warning' | 'danger';
      },
    ) => {
      const current = rowIssueMap.get(gradeId) || [];
      if (!current.some(item => item.key === issue.key)) {
        current.push(issue);
        rowIssueMap.set(gradeId, current);
      }
    };

    // 按同一职级序列顺序比较相邻薪级，直接定位真实联调里最容易遗漏的区间重叠问题。
    sortedSalaryGrades.forEach(item => {
      const series = jobLevelMap.get(item.levelId)?.levelSeries || item.levelCode || '未分组';
      const minSalary = Number(item.minSalary || 0);
      const midSalary = Number(item.midSalary || 0);
      const maxSalary = Number(item.maxSalary || 0);

      if (minSalary > maxSalary) {
        invalidRanges.push({ grade: item, reason: '最低薪资高于最高薪资' });
        invalidGradeIds.add(item.id);
        pushRowIssue(item.id, {
          key: 'range-order',
          label: '区间顺序异常',
          detail: '最低薪资高于最高薪资，保存口径需要先修正。',
          severity: 'danger',
        });
      }

      if (midSalary < minSalary || midSalary > maxSalary) {
        invalidRanges.push({ grade: item, reason: '中位薪资不在最低和最高之间' });
        invalidGradeIds.add(item.id);
        pushRowIssue(item.id, {
          key: 'mid-out-of-range',
          label: '中位超出区间',
          detail: '中位薪资没有落在最低和最高之间，测算口径会失真。',
          severity: 'danger',
        });
      }

      const previous = previousBySeries.get(series);
      if (previous) {
        const overlapAmount = Number(previous.maxSalary || 0) - minSalary;
        if (overlapAmount > 0) {
          const previousLabel = previous.levelCode || previous.levelName || `#${previous.id}`;
          const currentLabel = item.levelCode || item.levelName || `#${item.id}`;
          overlapPairs.push({
            series,
            left: previous,
            right: item,
            overlapAmount,
          });
          overlapGradeIds.add(previous.id);
          overlapGradeIds.add(item.id);
          pushRowIssue(previous.id, {
            key: `overlap-next-${item.id}`,
            label: '区间重叠',
            detail: `与 ${currentLabel} 重叠 ${formatCurrency(overlapAmount)}。`,
            severity: 'danger',
          });
          pushRowIssue(item.id, {
            key: `overlap-prev-${previous.id}`,
            label: '区间重叠',
            detail: `与 ${previousLabel} 重叠 ${formatCurrency(overlapAmount)}。`,
            severity: 'danger',
          });
        }
      }

      previousBySeries.set(series, item);
    });

    return {
      rowIssueMap,
      overlapPairs,
      invalidRanges,
      overlapGradeIds,
      invalidGradeIds,
    };
  }, [jobLevelMap, sortedSalaryGrades]);

  const salaryGradeRiskItems = useMemo(() => {
    const items: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];

    if (salaryGradeDiagnostics.overlapPairs.length > 0) {
      const firstPair = salaryGradeDiagnostics.overlapPairs[0];
      items.push({
        key: 'range-overlap',
        title: '存在薪级区间重叠',
        detail: `当前发现 ${salaryGradeDiagnostics.overlapPairs.length} 组区间重叠，${firstPair.series} 序列的 ${firstPair.left.levelCode || firstPair.left.levelName || '-'} 与 ${firstPair.right.levelCode || firstPair.right.levelName || '-'} 重叠 ${formatCurrency(firstPair.overlapAmount)}。`,
        severity: 'danger',
      });
    }

    if (salaryGradeDiagnostics.invalidGradeIds.size > 0) {
      items.push({
        key: 'invalid-range',
        title: '存在区间顺序异常',
        detail: `当前有 ${salaryGradeDiagnostics.invalidGradeIds.size} 条薪级的最低、中位、最高顺序不一致，保存口径需要先修正。`,
        severity: 'danger',
      });
    }

    if (emptyGradeSeries.length > 0) {
      items.push({
        key: 'empty-series',
        title: '存在整条序列未配置',
        detail: emptyGradeSeries.map(item => `${item.series} ${item.configured}/${item.total}`).join('、'),
        severity: 'danger',
      });
    }

    const partialSeries = uncoveredGradeSeries.filter(item => item.configured > 0);
    if (partialSeries.length > 0) {
      items.push({
        key: 'partial-series',
        title: '序列覆盖还不完整',
        detail: partialSeries.map(item => `${item.series} ${item.configured}/${item.total}`).join('、'),
        severity: 'warning',
      });
    }

    if (pendingGradeLevels.length > 0) {
      items.push({
        key: 'pending-levels',
        title: '启用职级仍有待配置薪级',
        detail: `待配 ${pendingGradeLevels.length} 个 / 覆盖率 ${gradeCoverageRate}%`,
        severity: pendingGradeLevels.length >= 5 ? 'danger' : 'warning',
      });
    }

    return items;
  }, [
    emptyGradeSeries,
    gradeCoverageRate,
    pendingGradeLevels.length,
    salaryGradeDiagnostics.invalidGradeIds.size,
    salaryGradeDiagnostics.overlapPairs,
    uncoveredGradeSeries,
  ]);

  const salaryGradeRiskSummary = useMemo(() => {
    const score = salaryGradeRiskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    if (!score) {
      return {
        label: '可核对',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '薪级覆盖已对齐。',
      };
    }

    if (score <= 3) {
      return {
        label: '待核对',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        hint: `${salaryGradeRiskItems.length} 条待处理。`,
      };
    }

    return {
      label: '待补薪级',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      hint: `${salaryGradeRiskItems.length} 条待处理。`,
    };
  }, [salaryGradeRiskItems]);

  const gradeFormSelectedLevel = useMemo(
    () => jobLevelMap.get(gradeForm.levelId) || null,
    [gradeForm.levelId, jobLevelMap],
  );

  const gradeFormExistingGrade = useMemo(
    () => salaryGrades.find(item => item.levelId === gradeForm.levelId) || null,
    [gradeForm.levelId, salaryGrades],
  );

  const gradeFormSeriesLevels = useMemo(() => {
    if (!gradeFormSelectedLevel) return [] as JobLevelOption[];

    return activeJobLevels
      .filter(level => (level.levelSeries || '未分组') === (gradeFormSelectedLevel.levelSeries || '未分组'))
      .sort((left, right) => {
        const rankCompare = Number(left.levelRank || 0) - Number(right.levelRank || 0);
        if (rankCompare !== 0) return rankCompare;
        return String(left.levelCode || '').localeCompare(String(right.levelCode || ''), 'zh-CN');
      });
  }, [activeJobLevels, gradeFormSelectedLevel]);

  const gradeFormNeighborContext = useMemo(() => {
    if (!gradeFormSelectedLevel) {
      return {
        previousLevel: null as JobLevelOption | null,
        previousGrade: null as SalaryGrade | null,
        nextLevel: null as JobLevelOption | null,
        nextGrade: null as SalaryGrade | null,
      };
    }

    const targetIndex = gradeFormSeriesLevels.findIndex(level => level.id === gradeFormSelectedLevel.id);
    if (targetIndex < 0) {
      return {
        previousLevel: null as JobLevelOption | null,
        previousGrade: null as SalaryGrade | null,
        nextLevel: null as JobLevelOption | null,
        nextGrade: null as SalaryGrade | null,
      };
    }

    let previousLevel: JobLevelOption | null = null;
    let previousGrade: SalaryGrade | null = null;
    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      const level = gradeFormSeriesLevels[index];
      const grade = salaryGrades.find(item => item.levelId === level.id) || null;
      if (grade) {
        previousLevel = level;
        previousGrade = grade;
        break;
      }
    }

    let nextLevel: JobLevelOption | null = null;
    let nextGrade: SalaryGrade | null = null;
    for (let index = targetIndex + 1; index < gradeFormSeriesLevels.length; index += 1) {
      const level = gradeFormSeriesLevels[index];
      const grade = salaryGrades.find(item => item.levelId === level.id) || null;
      if (grade) {
        nextLevel = level;
        nextGrade = grade;
        break;
      }
    }

    return {
      previousLevel,
      previousGrade,
      nextLevel,
      nextGrade,
    };
  }, [gradeFormSelectedLevel, gradeFormSeriesLevels, salaryGrades]);

  // 薪级弹窗要在保存前就预览上下级关系，避免把区间重叠带到真实联调里。
  const gradeFormDiagnostics = useMemo(() => {
    const minSalary = normalizeAmount(gradeForm.minSalary);
    const midSalary = normalizeAmount(gradeForm.midSalary);
    const maxSalary = normalizeAmount(gradeForm.maxSalary);
    const selectedLevel = gradeFormSelectedLevel;
    const existingGrade = gradeFormExistingGrade;
    const { previousLevel, previousGrade, nextLevel, nextGrade } = gradeFormNeighborContext;
    const isSelectedLevelActive = selectedLevel ? selectedLevel.status !== 0 : false;
    const fillsPendingLevel = Boolean(selectedLevel && isSelectedLevelActive && !configuredGradeLevelIds.has(selectedLevel.id));
    const nextConfiguredCount = fillsPendingLevel ? sortedSalaryGrades.length + 1 : sortedSalaryGrades.length;
    const nextCoverageRate = activeJobLevels.length
      ? Number(((nextConfiguredCount / activeJobLevels.length) * 100).toFixed(1))
      : 0;
    const seriesConfiguredCount = gradeFormSeriesLevels.filter(level => configuredGradeLevelIds.has(level.id)).length;
    const nextSeriesConfiguredCount = fillsPendingLevel ? seriesConfiguredCount + 1 : seriesConfiguredCount;
    const nextSeriesCoverageRate = gradeFormSeriesLevels.length
      ? Number(((nextSeriesConfiguredCount / gradeFormSeriesLevels.length) * 100).toFixed(1))
      : 0;
    const noChanges = Boolean(existingGrade)
      && normalizeAmount(existingGrade.minSalary) === minSalary
      && normalizeAmount(existingGrade.midSalary) === midSalary
      && normalizeAmount(existingGrade.maxSalary) === maxSalary
      && String(existingGrade.currency || 'CNY') === String(gradeForm.currency || 'CNY');
    const placeholderRange = minSalary === 0 && midSalary === 0 && maxSalary === 0;
    const invalidRange = minSalary > maxSalary;
    const invalidMid = midSalary < minSalary || midSalary > maxSalary;
    const previousOverlapAmount = previousGrade ? normalizeAmount(Number(previousGrade.maxSalary || 0) - minSalary) : 0;
    const nextOverlapAmount = nextGrade ? normalizeAmount(maxSalary - Number(nextGrade.minSalary || 0)) : 0;
    const overlapsPrevious = Boolean(previousGrade && previousOverlapAmount > 0);
    const overlapsNext = Boolean(nextGrade && nextOverlapAmount > 0);
    const currencyMismatches = [previousGrade, nextGrade].filter((grade): grade is SalaryGrade =>
      Boolean(grade) && String(grade.currency || 'CNY') !== String(gradeForm.currency || 'CNY'),
    );

    let modeLabel = '等待选择职级';
    let modeHint = '先选择职级，再判断这次保存是补齐空档、覆盖旧配置还是会影响相邻薪级。';
    if (selectedLevel) {
      if (noChanges) {
        modeLabel = '无变化覆盖保存';
        modeHint = '当前输入和现有薪级完全一致，继续保存只会重复覆盖一份相同配置。';
      } else if (!isSelectedLevelActive) {
        modeLabel = '配置停用职级';
        modeHint = '当前职级处于停用状态，这条薪级不会计入启用职级覆盖率。';
      } else if (existingGrade) {
        modeLabel = '覆盖已有薪级';
        modeHint = `当前会把 ${selectedLevel.levelCode || selectedLevel.levelName || '目标职级'} 的现有区间替换为新的带宽。`;
      } else if (gradeFormSeriesLevels.length > 0 && nextSeriesConfiguredCount === gradeFormSeriesLevels.length) {
        modeLabel = '补齐整条序列';
        modeHint = `保存后 ${selectedLevel.levelSeries || '当前'} 序列会变成全覆盖，可以直接做带宽联调。`;
      } else {
        modeLabel = '新增薪级配置';
        modeHint = '保存后会新增一条薪级带宽，并刷新页面覆盖率与待配置清单。';
      }
    }

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (selectedLevel) {
      if (!isSelectedLevelActive) {
        riskItems.push({
          key: 'inactive-level',
          title: '当前职级已停用',
          detail: '停用职级虽然还能保存薪级，但不会纳入启用职级覆盖率，真实联调价值有限。',
          severity: 'warning',
        });
      }
      if (placeholderRange) {
        riskItems.push({
          key: 'placeholder-range',
          title: '薪级区间仍是默认值',
          detail: '当前最低、中位、最高都是 0，保存后无法作为真实薪酬带宽样本使用。',
          severity: 'warning',
        });
      }
      if (invalidRange) {
        riskItems.push({
          key: 'range-order',
          title: '最低薪资高于最高薪资',
          detail: '区间顺序已经反了，保存后会直接制造异常薪级样本。',
          severity: 'danger',
        });
      }
      if (!invalidRange && invalidMid) {
        riskItems.push({
          key: 'mid-out-of-range',
          title: '中位薪资没有落在区间内',
          detail: '中位薪资必须位于最低和最高之间，否则后续带宽展示会失真。',
          severity: 'danger',
        });
      }
      if (overlapsPrevious && previousLevel && previousGrade) {
        riskItems.push({
          key: 'overlap-previous',
          title: '与上一级薪级发生重叠',
          detail: `${previousLevel.levelCode || previousLevel.levelName || '上一级'} 当前上限是 ${formatCurrency(previousGrade.maxSalary)}，会和本次最低薪资重叠 ${formatCurrency(previousOverlapAmount)}。`,
          severity: 'danger',
        });
      }
      if (overlapsNext && nextLevel && nextGrade) {
        riskItems.push({
          key: 'overlap-next',
          title: '与下一级薪级发生重叠',
          detail: `${nextLevel.levelCode || nextLevel.levelName || '下一级'} 当前下限是 ${formatCurrency(nextGrade.minSalary)}，会被本次最高薪资压住 ${formatCurrency(nextOverlapAmount)}。`,
          severity: 'danger',
        });
      }
      if (currencyMismatches.length > 0) {
        riskItems.push({
          key: 'currency-mismatch',
          title: '币种与相邻薪级不一致',
          detail: `相邻已配置薪级使用 ${Array.from(new Set(currencyMismatches.map(item => item.currency || 'CNY'))).join(' / ')}，当前币种是 ${gradeForm.currency || 'CNY'}，联调对比时要额外换算。`,
          severity: 'warning',
        });
      }
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !selectedLevel
      ? {
        label: '等待选择',
        className: 'border-slate-200 bg-slate-50 text-slate-600',
        hint: '先选择一个职级，再预览保存后会不会补齐覆盖率或撞到邻级区间。',
      }
      : !score
        ? {
          label: '可直接保存',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          hint: '当前区间顺序、相邻关系和覆盖影响都比较清晰，可以继续保存薪级。',
        }
        : score <= 2
          ? {
            label: '保存需注意',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `发现 ${riskItems.length} 条需要人工确认的薪级保存提示。`,
          }
          : {
            label: '保存存在风险',
            className: 'border-rose-200 bg-rose-50 text-rose-700',
            hint: `当前有 ${riskItems.length} 条高风险提示，建议先调整区间再保存。`,
          };

    return {
      selectedLevel,
      existingGrade,
      previousLevel,
      previousGrade,
      nextLevel,
      nextGrade,
      currentCoverageRate: gradeCoverageRate,
      nextCoverageRate,
      seriesConfiguredCount,
      nextSeriesConfiguredCount,
      seriesTotal: gradeFormSeriesLevels.length,
      nextSeriesCoverageRate,
      modeLabel,
      modeHint,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [
    activeJobLevels.length,
    configuredGradeLevelIds,
    gradeCoverageRate,
    gradeForm.currency,
    gradeForm.maxSalary,
    gradeForm.midSalary,
    gradeForm.minSalary,
    gradeFormExistingGrade,
    gradeFormNeighborContext,
    gradeFormSelectedLevel,
    gradeFormSeriesLevels,
    jobLevelMap,
    salaryGrades,
    sortedSalaryGrades.length,
  ]);

  const structureFormExistingDetail = useMemo(() => {
    if (!editingStructureId) return null;
    if (structureDetail?.id === editingStructureId) return structureDetail;
    return salaryStructureDetailMap[editingStructureId] || null;
  }, [editingStructureId, salaryStructureDetailMap, structureDetail]);

  const structureFormSelectedItems = useMemo(
    () => structureForm.itemIds
      .map(itemId => salaryItemMap.get(String(itemId)))
      .filter((item): item is SalaryItem => Boolean(item)),
    [salaryItemMap, structureForm.itemIds],
  );

  const structureActiveSalaryStatsMap = useMemo(
    () => workingEmployeeSalaries.reduce((result, item) => {
      const current = result.get(item.structureId) || {
        archiveCount: 0,
        employeeIds: new Set<number>(),
        futureCount: 0,
      };
      current.archiveCount += 1;
      current.employeeIds.add(item.employeeId);
      if (isFutureDate(item.effectiveDate)) {
        current.futureCount += 1;
      }
      result.set(item.structureId, current);
      return result;
    }, new Map<number, { archiveCount: number; employeeIds: Set<number>; futureCount: number }>()),
    [workingEmployeeSalaries],
  );

  const structureFormDiagnostics = useMemo(() => {
    const trimmedCode = structureForm.structureCode.trim();
    const trimmedName = structureForm.structureName.trim();
    const trimmedDescription = (structureForm.description || '').trim();
    const selectedItemIds = Array.from(new Set(structureForm.itemIds)).sort((left, right) => left - right);
    const existingItemIds = structureFormExistingDetail
      ? Array.from(new Set((structureFormExistingDetail.items || []).map(item => item.id))).sort((left, right) => left - right)
      : [];
    const selectedItems = structureFormSelectedItems;
    const disabledSelectedItems = selectedItems.filter(item => Number(item.status ?? 1) !== 1);
    const taxableItems = selectedItems.filter(item => Boolean(item.isTaxable));
    const variableItems = selectedItems.filter(item => item.itemType === 'VARIABLE');
    const duplicateCodeTarget = trimmedCode
      ? salaryStructures.find(item => item.id !== editingStructureId && String(item.structureCode || '').trim().toUpperCase() === trimmedCode.toUpperCase()) || null
      : null;
    const duplicateNameTarget = trimmedName
      ? salaryStructures.find(item => item.id !== editingStructureId && String(item.structureName || '').trim() === trimmedName) || null
      : null;
    const activeUsage = editingStructureId ? structureActiveSalaryStatsMap.get(editingStructureId) || null : null;
    const removedItems = structureFormExistingDetail
      ? (structureFormExistingDetail.items || []).filter(item => !selectedItemIds.includes(item.id))
      : [];
    const noChanges = Boolean(structureFormExistingDetail)
      && trimmedCode === String(structureFormExistingDetail?.structureCode || '').trim()
      && trimmedName === String(structureFormExistingDetail?.structureName || '').trim()
      && trimmedDescription === String(structureFormExistingDetail?.description || '').trim()
      && Number(structureForm.status ?? 1) === Number(structureFormExistingDetail?.status ?? 1)
      && selectedItemIds.length === existingItemIds.length
      && selectedItemIds.every((itemId, index) => itemId === existingItemIds[index]);

    let modeLabel = '等待填写结构信息';
    let modeHint = '先填写编码、名称并勾选项目，再判断这次保存是新建结构、覆盖旧配置还是会影响现有档案。';
    if (trimmedCode || trimmedName || selectedItemIds.length > 0) {
      if (noChanges) {
        modeLabel = '无变化重复保存';
        modeHint = '当前输入和已有结构完全一致，继续保存通常不会带来新的联调价值。';
      } else if (!editingStructureId) {
        modeLabel = '新建薪资结构';
        modeHint = '保存后会新增一套结构，后续员工分配时可以直接选用这套项目组合。';
      } else if (Number(structureForm.status ?? 1) !== 1 && activeUsage?.archiveCount) {
        modeLabel = '禁用在用结构';
        modeHint = `当前结构还命中 ${activeUsage.archiveCount} 条在岗档案，禁用后只会拦住新分配，不会自动迁移历史数据。`;
      } else if (removedItems.length > 0) {
        modeLabel = '收缩结构项目';
        modeHint = `本次会移除 ${removedItems.length} 个已存在项目，后续查看结构和新分配员工时都会看到新口径。`;
      } else {
        modeLabel = '覆盖已有结构';
        modeHint = '保存后会直接替换这套结构的项目组合和状态，页面上的结构详情会同步刷新。';
      }
    }

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (trimmedCode || trimmedName || editingStructureId || selectedItemIds.length > 0) {
      if (!trimmedCode) {
        riskItems.push({
          key: 'missing-code',
          title: '还没有填写结构编码',
          detail: '结构编码会直接影响后续筛选和联调识别，建议先填一个稳定编码。',
          severity: 'warning',
        });
      }
      if (!trimmedName) {
        riskItems.push({
          key: 'missing-name',
          title: '还没有填写结构名称',
          detail: '结构名称会在员工分配和结构详情里直接展示，建议提前确定清晰命名。',
          severity: 'warning',
        });
      }
      if (selectedItemIds.length === 0) {
        riskItems.push({
          key: 'missing-items',
          title: '当前没有关联任何项目',
          detail: '空结构无法用于员工薪资分配，保存后也无法形成有效联调样本。',
          severity: 'danger',
        });
      }
      if (duplicateCodeTarget) {
        riskItems.push({
          key: 'duplicate-code',
          title: '结构编码与现有结构重复',
          detail: `当前编码已被 ${duplicateCodeTarget.structureName} (${duplicateCodeTarget.structureCode}) 使用，后续联调筛选会很容易混淆。`,
          severity: 'danger',
        });
      }
      if (duplicateNameTarget) {
        riskItems.push({
          key: 'duplicate-name',
          title: '结构名称与现有结构重复',
          detail: `当前名称已被 ${duplicateNameTarget.structureCode} 使用，建议改成更容易区分的名称。`,
          severity: 'warning',
        });
      }
      if (disabledSelectedItems.length > 0) {
        riskItems.push({
          key: 'disabled-items',
          title: '结构里仍选中了禁用项目',
          detail: `${disabledSelectedItems.map(item => item.itemName).join('、')} 当前都已停用，继续保留只会增加后续维护和分配核对成本。`,
          severity: 'warning',
        });
      }
      if (selectedItemIds.length > 0 && taxableItems.length === 0) {
        riskItems.push({
          key: 'missing-taxable-items',
          title: '当前结构没有计税项目',
          detail: '这套结构里没有任何参与计税的项目，后续个税联调只能得到 0 税基样本。',
          severity: 'warning',
        });
      }
      if (noChanges) {
        riskItems.push({
          key: 'no-changes',
          title: '本次保存不会改变结构口径',
          detail: '编码、名称、状态和项目集合都没有变化，继续保存通常只是重复覆盖。',
          severity: 'warning',
        });
      }
      if (Number(structureForm.status ?? 1) !== 1 && activeUsage?.archiveCount) {
        riskItems.push({
          key: 'disable-in-use',
          title: '正在禁用一套被在岗档案引用的结构',
          detail: `当前还有 ${activeUsage.archiveCount} 条在岗档案、${activeUsage.employeeIds.size} 名员工引用这套结构，其中 ${activeUsage.futureCount} 条还是未来生效。`,
          severity: 'danger',
        });
      }
      if (removedItems.length > 0 && activeUsage?.archiveCount) {
        riskItems.push({
          key: 'remove-items-in-use',
          title: '正在调整一套已在使用中的结构项目',
          detail: `当前移除了 ${removedItems.map(item => item.itemName).join('、')}，这会改变后续新分配和结构详情里可见的项目口径。`,
          severity: 'warning',
        });
      }
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !(trimmedCode || trimmedName || editingStructureId || selectedItemIds.length > 0)
      ? {
        label: '等待填写',
        className: 'border-slate-200 bg-slate-50 text-slate-600',
        hint: '先把结构编码、名称和项目组合填出来，再判断保存风险。',
      }
      : !score
        ? {
          label: '可直接保存',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          hint: '当前结构编码、项目组合和使用影响都比较清晰，可以继续保存。',
        }
        : score <= 2
          ? {
            label: '保存需注意',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `发现 ${riskItems.length} 条需要人工确认的结构保存提示。`,
          }
          : {
            label: '保存存在风险',
            className: 'border-rose-200 bg-rose-50 text-rose-700',
            hint: `当前有 ${riskItems.length} 条高风险提示，建议先调整结构参数再保存。`,
          };

    return {
      selectedItems,
      disabledSelectedItems,
      taxableItems,
      variableItems,
      activeUsage,
      removedItems,
      modeLabel,
      modeHint,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [
    editingStructureId,
    salaryItemMap,
    salaryStructures,
    structureActiveSalaryStatsMap,
    structureForm.description,
    structureForm.itemIds,
    structureForm.status,
    structureForm.structureCode,
    structureForm.structureName,
    structureFormExistingDetail,
    structureFormSelectedItems,
  ]);

  const salaryItemUsageMap = useMemo(
    () => salaryStructureDetails.reduce((result, detail) => {
      const structureSalaryStats = structureActiveSalaryStatsMap.get(detail.id);

      (detail.items || []).forEach(item => {
        const current = result.get(item.id) || {
          structureIds: new Set<number>(),
          enabledStructureIds: new Set<number>(),
          activeEmployeeIds: new Set<number>(),
          activeArchiveCount: 0,
          futureArchiveCount: 0,
          sampleStructureNames: [] as string[],
        };

        current.structureIds.add(detail.id);
        if (Number(detail.status ?? 1) === 1) {
          current.enabledStructureIds.add(detail.id);
        }
        if (detail.structureName && !current.sampleStructureNames.includes(detail.structureName) && current.sampleStructureNames.length < 3) {
          current.sampleStructureNames.push(detail.structureName);
        }

        if (structureSalaryStats) {
          current.activeArchiveCount += structureSalaryStats.archiveCount;
          current.futureArchiveCount += structureSalaryStats.futureCount;
          structureSalaryStats.employeeIds.forEach(employeeId => current.activeEmployeeIds.add(employeeId));
        }

        result.set(item.id, current);
      });

      return result;
    }, new Map<number, {
      structureIds: Set<number>;
      enabledStructureIds: Set<number>;
      activeEmployeeIds: Set<number>;
      activeArchiveCount: number;
      futureArchiveCount: number;
      sampleStructureNames: string[];
    }>()),
    [salaryStructureDetails, structureActiveSalaryStatsMap],
  );

  const itemFormExistingItem = useMemo(
    () => (editingItemId ? salaryItems.find(item => item.id === editingItemId) || null : null),
    [editingItemId, salaryItems],
  );

  const itemFormDiagnostics = useMemo(() => {
    const trimmedCode = itemForm.itemCode.trim();
    const trimmedName = itemForm.itemName.trim();
    const trimmedFormula = (itemForm.formula || '').trim();
    const usage = editingItemId ? salaryItemUsageMap.get(editingItemId) || null : null;
    const duplicateCodeTarget = trimmedCode
      ? salaryItems.find(item => item.id !== editingItemId && String(item.itemCode || '').trim().toUpperCase() === trimmedCode.toUpperCase()) || null
      : null;
    const duplicateNameTarget = trimmedName
      ? salaryItems.find(item => item.id !== editingItemId && String(item.itemName || '').trim() === trimmedName) || null
      : null;
    const noChanges = Boolean(itemFormExistingItem)
      && trimmedCode === String(itemFormExistingItem?.itemCode || '').trim()
      && trimmedName === String(itemFormExistingItem?.itemName || '').trim()
      && itemForm.itemType === itemFormExistingItem?.itemType
      && itemForm.category === itemFormExistingItem?.category
      && Boolean(itemForm.isTaxable) === Boolean(itemFormExistingItem?.isTaxable)
      && Number(itemForm.status ?? 1) === Number(itemFormExistingItem?.status ?? 1)
      && Number(itemForm.sortOrder ?? 0) === Number(itemFormExistingItem?.sortOrder ?? 0)
      && trimmedFormula === String(itemFormExistingItem?.formula || '').trim();
    const disablesInUseItem = Number(itemForm.status ?? 1) !== 1 && Boolean(usage?.structureIds.size);
    const taxableChangedInUse = Boolean(
      usage?.activeArchiveCount
      && itemFormExistingItem
      && Boolean(itemForm.isTaxable) !== Boolean(itemFormExistingItem.isTaxable),
    );
    const categoryChangedInUse = Boolean(
      usage?.activeArchiveCount
      && itemFormExistingItem
      && itemForm.category !== itemFormExistingItem.category,
    );
    const typeChangedInUse = Boolean(
      usage?.activeArchiveCount
      && itemFormExistingItem
      && itemForm.itemType !== itemFormExistingItem.itemType,
    );
    const isCoreTaxableCategory = ['BASIC', 'BONUS', 'TAX'].includes(itemForm.category);
    const suspiciousNonTaxable = isCoreTaxableCategory && !itemForm.isTaxable;
    const suspiciousTaxableDeduction = ['DEDUCTION', 'INSURANCE'].includes(itemForm.category) && itemForm.isTaxable;

    let modeLabel = '等待填写项目信息';
    let modeHint = '先填写编码、名称和分类，再判断这次保存是新建项目、覆盖旧口径还是会影响在用结构。';
    if (trimmedCode || trimmedName) {
      if (noChanges) {
        modeLabel = '无变化重复保存';
        modeHint = '当前输入和已有项目完全一致，继续保存通常只是重复覆盖。';
      } else if (!editingItemId) {
        modeLabel = '新建薪资项目';
        modeHint = '保存后项目会进入结构配置池，后续还需要放进结构才能真正参与员工薪资联调。';
      } else if (disablesInUseItem) {
        modeLabel = '禁用在用项目';
        modeHint = `当前项目还挂在 ${usage?.structureIds.size || 0} 套结构里，禁用后只会阻止新结构继续选它。`;
      } else if (taxableChangedInUse || categoryChangedInUse || typeChangedInUse) {
        modeLabel = '调整在用项目口径';
        modeHint = '当前项目已经进入在岗档案样本，修改计税、分类或类型后要重点核对后续结构和个税口径。';
      } else {
        modeLabel = '覆盖已有项目';
        modeHint = '保存后会直接更新项目属性，结构列表和项目体检会同步刷新。';
      }
    }

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (trimmedCode || trimmedName || editingItemId) {
      if (!trimmedCode) {
        riskItems.push({
          key: 'missing-code',
          title: '还没有填写项目编码',
          detail: '项目编码会直接用于结构维护和后续问题排查，建议先填一个稳定编码。',
          severity: 'warning',
        });
      }
      if (!trimmedName) {
        riskItems.push({
          key: 'missing-name',
          title: '还没有填写项目名称',
          detail: '项目名称会直接展示在员工薪资明细里，建议保持清晰可辨识。',
          severity: 'warning',
        });
      }
      if (duplicateCodeTarget) {
        riskItems.push({
          key: 'duplicate-code',
          title: '项目编码与现有项目重复',
          detail: `当前编码已被 ${duplicateCodeTarget.itemName} 使用，结构和员工明细联调时会很容易混淆。`,
          severity: 'danger',
        });
      }
      if (duplicateNameTarget) {
        riskItems.push({
          key: 'duplicate-name',
          title: '项目名称与现有项目重复',
          detail: `当前名称已被 ${duplicateNameTarget.itemCode} 使用，建议改成更容易区分的名字。`,
          severity: 'warning',
        });
      }
      if (disablesInUseItem) {
        riskItems.push({
          key: 'disable-in-use',
          title: '正在禁用一个已在使用中的项目',
          detail: `当前项目已命中 ${usage?.structureIds.size || 0} 套结构、${usage?.activeEmployeeIds.size || 0} 名员工、${usage?.activeArchiveCount || 0} 条在岗档案。`,
          severity: 'danger',
        });
      }
      if (taxableChangedInUse && itemFormExistingItem) {
        riskItems.push({
          key: 'taxable-changed',
          title: '正在改变在用项目的计税口径',
          detail: `当前会把“${itemFormExistingItem.itemName}”从${itemFormExistingItem.isTaxable ? '计税' : '不计税'}改成${itemForm.isTaxable ? '计税' : '不计税'}。`,
          severity: 'danger',
        });
      }
      if (categoryChangedInUse && itemFormExistingItem) {
        riskItems.push({
          key: 'category-changed',
          title: '正在改变在用项目的分类',
          detail: `当前会把项目分类从 ${itemCategoryLabel(itemFormExistingItem.category)} 改成 ${itemCategoryLabel(itemForm.category)}，结构口径要一起复核。`,
          severity: 'warning',
        });
      }
      if (typeChangedInUse && itemFormExistingItem) {
        riskItems.push({
          key: 'type-changed',
          title: '正在改变在用项目的类型',
          detail: `当前会把项目类型从 ${itemTypeLabel(itemFormExistingItem.itemType)} 改成 ${itemTypeLabel(itemForm.itemType)}，可能影响后续维护认知。`,
          severity: 'warning',
        });
      }
      if (suspiciousNonTaxable) {
        riskItems.push({
          key: 'suspicious-non-taxable',
          title: '当前分类通常应参与计税',
          detail: `${itemCategoryLabel(itemForm.category)} 类项目一般会进入税基，当前设置为不计税，建议联调前再确认。`,
          severity: 'warning',
        });
      }
      if (suspiciousTaxableDeduction) {
        riskItems.push({
          key: 'suspicious-taxable-deduction',
          title: '当前分类通常不建议再次计税',
          detail: `${itemCategoryLabel(itemForm.category)} 类项目通常作为扣减项处理，当前设置为计税要确认是否符合业务口径。`,
          severity: 'warning',
        });
      }
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !(trimmedCode || trimmedName || editingItemId)
      ? {
        label: '等待填写',
        className: 'border-slate-200 bg-slate-50 text-slate-600',
        hint: '先把编码、名称和分类填出来，再判断保存风险。',
      }
      : !score
        ? {
          label: '可直接保存',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          hint: '当前项目编码、口径和使用影响都比较清晰，可以继续保存。',
        }
        : score <= 2
          ? {
            label: '保存需注意',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `发现 ${riskItems.length} 条需要人工确认的项目保存提示。`,
          }
          : {
            label: '保存存在风险',
            className: 'border-rose-200 bg-rose-50 text-rose-700',
            hint: `当前有 ${riskItems.length} 条高风险提示，建议先调整参数再保存。`,
          };

    return {
      usage,
      modeLabel,
      modeHint,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [
    editingItemId,
    itemForm.category,
    itemForm.formula,
    itemForm.isTaxable,
    itemForm.itemCode,
    itemForm.itemName,
    itemForm.itemType,
    itemForm.sortOrder,
    itemForm.status,
    itemFormExistingItem,
    salaryItemUsageMap,
    salaryItems,
  ]);

  const buildDeleteConfirmMessage = (
    entityLabel: string,
    riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }>,
  ) => {
    if (!riskItems.length) {
      return `确认删除${entityLabel}吗？`;
    }

    const previewItems = riskItems.slice(0, 3);
    return [
      `确认删除${entityLabel}吗？`,
      '',
      '删除前联调提示：',
      ...previewItems.map((item, index) => `${index + 1}. ${item.title}：${item.detail}`),
      ...(riskItems.length > previewItems.length ? [`还有 ${riskItems.length - previewItems.length} 条提示未展开。`] : []),
      '',
      '确认后会继续调用真实删除接口。',
    ].join('\n');
  };

  const buildActionConfirmMessage = (
    actionLabel: string,
    riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }>,
    actionHint?: string,
  ) => {
    if (!riskItems.length && !actionHint) {
      return `确认执行“${actionLabel}”吗？`;
    }

    const previewItems = riskItems.slice(0, 3);
    const lines = [`确认执行“${actionLabel}”吗？`];

    if (actionHint) {
      lines.push('', '执行影响：', actionHint);
    }

    if (riskItems.length) {
      lines.push(
        '',
        '动作前联调提示：',
        ...previewItems.map((item, index) => `${index + 1}. ${item.title}：${item.detail}`),
      );
      if (riskItems.length > previewItems.length) {
        lines.push(`还有 ${riskItems.length - previewItems.length} 条提示未展开。`);
      }
    }

    lines.push('', '确认后会继续调用真实接口。');
    return lines.join('\n');
  };

  const buildSalaryItemDeleteDiagnostics = (item: SalaryItem) => {
    const usage = salaryItemUsageMap.get(item.id) || null;
    const linkedDetails = salaryStructureDetails.filter(detail =>
      (detail.items || []).some(detailItem => detailItem.id === item.id),
    );
    const linkedStructureNames = linkedDetails
      .map(detail => detail.structureName)
      .filter((value): value is string => Boolean(value))
      .slice(0, 3);
    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];

    if (usage?.activeArchiveCount) {
      riskItems.push({
        key: 'linked-active-archives',
        title: '项目仍命中在岗薪资档案',
        detail: `当前项目还挂在 ${usage.structureIds.size} 套结构、${usage.activeEmployeeIds.size} 名员工、${usage.activeArchiveCount} 条 ACTIVE 现薪档案里${usage.futureArchiveCount ? `，其中 ${usage.futureArchiveCount} 条还是未来生效` : ''}。`,
        severity: 'danger',
      });
    } else if (usage?.structureIds.size) {
      riskItems.push({
        key: 'linked-structures',
        title: '项目仍被薪资结构引用',
        detail: `${linkedStructureNames.length ? `${linkedStructureNames.join('、')} 等 ` : ''}${usage.structureIds.size} 套结构还在使用这个项目，建议先从结构里移除再删。`,
        severity: 'danger',
      });
    }

    if (!usage?.structureIds.size && Number(item.status ?? 1) === 1) {
      riskItems.push({
        key: 'enabled-unused-item',
        title: '当前删除的是启用项目',
        detail: '这个项目虽然还没进入任何结构，但仍会出现在结构配置池里，删除后这条可选样本会直接消失。',
        severity: 'warning',
      });
    }

    if (item.formula && String(item.formula).trim()) {
      riskItems.push({
        key: 'formula-item',
        title: '项目带有公式配置',
        detail: '删除后公式口径说明也会一起丢失，后续回看这条项目样本时无法直接复盘。',
        severity: 'warning',
      });
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !score
      ? {
        label: '可直接删除',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '当前项目没有命中结构和在岗档案，可以直接回放删除接口。',
      }
      : blockingRiskItems.length
        ? {
          label: '删除会阻断联调',
          className: 'border-rose-200 bg-rose-50 text-rose-700',
          hint: `当前有 ${blockingRiskItems.length} 条高风险提示，建议先把结构引用和在岗样本清掉。`,
        }
        : score <= 2
          ? {
            label: '删除需确认',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `发现 ${riskItems.length} 条删除前提示，确认影响范围后再继续。`,
          }
          : {
            label: '删除影响较大',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `当前有 ${riskItems.length} 条删除前提示，建议先确认样本是否还需要保留。`,
          };

    return {
      usage,
      linkedDetails,
      linkedStructureNames,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  };

  const salaryItemDeleteDiagnosticsMap = useMemo(
    () => new Map(salaryItems.map(item => [item.id, buildSalaryItemDeleteDiagnostics(item)])),
    [salaryItemUsageMap, salaryItems, salaryStructureDetails],
  );

  const selectedStructureDeleteDiagnostics = useMemo(() => {
    if (!structureDetail) return null;

    const activeUsage = structureActiveSalaryStatsMap.get(structureDetail.id) || null;
    const linkedItemNames = (structureDetail.items || [])
      .map(item => item.itemName)
      .filter((value): value is string => Boolean(value))
      .slice(0, 4);
    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];

    if (activeUsage?.archiveCount) {
      riskItems.push({
        key: 'linked-active-archives',
        title: '结构仍命中在岗现薪档案',
        detail: `当前还有 ${activeUsage.archiveCount} 条 ACTIVE 现薪、${activeUsage.employeeIds.size} 名员工引用这套结构${activeUsage.futureCount ? `，其中 ${activeUsage.futureCount} 条是未来生效档案` : ''}。`,
        severity: 'danger',
      });
    }

    if ((structureDetail.items || []).length > 0) {
      riskItems.push({
        key: 'linked-items',
        title: '结构下仍保留项目组合',
        detail: `${linkedItemNames.length ? `${linkedItemNames.join('、')}${structureDetail.items!.length > linkedItemNames.length ? ' 等' : ''}` : '这套结构'}共 ${structureDetail.items!.length} 个项目会随结构一起删除，后续无法再直接用这套组合做分配回放。`,
        severity: activeUsage?.archiveCount ? 'warning' : 'warning',
      });
    }

    if (Number(structureDetail.status ?? 1) === 1 && !activeUsage?.archiveCount) {
      riskItems.push({
        key: 'enabled-structure',
        title: '当前删除的是启用结构',
        detail: '这套结构现在仍会出现在薪资分配入口里，删除后可分配样本会少一套。',
        severity: 'warning',
      });
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !score
      ? {
        label: '可直接删除',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '当前结构没有命中在岗现薪，可以直接回放删除接口。',
      }
      : blockingRiskItems.length
        ? {
          label: '删除会阻断联调',
          className: 'border-rose-200 bg-rose-50 text-rose-700',
          hint: `当前有 ${blockingRiskItems.length} 条高风险提示，建议先迁移员工样本再删除。`,
        }
        : score <= 2
          ? {
            label: '删除需确认',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `发现 ${riskItems.length} 条删除前提示，确认结构样本是否还要保留。`,
          }
          : {
            label: '删除影响较大',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `当前有 ${riskItems.length} 条删除前提示，建议先确认结构用途再继续。`,
          };

    return {
      activeUsage,
      linkedItemNames,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [structureActiveSalaryStatsMap, structureDetail]);

  const buildSalaryGradeDeleteDiagnostics = (grade: SalaryGrade) => {
    const selectedLevel = jobLevelMap.get(grade.levelId) || null;
    const levelSeries = selectedLevel?.levelSeries || '未分组';
    const seriesLevels = activeJobLevels.filter(level => (level.levelSeries || '未分组') === levelSeries);
    const seriesGrades = sortedSalaryGrades.filter(item =>
      (jobLevelMap.get(item.levelId)?.levelSeries || '未分组') === levelSeries,
    );
    const currentCoverageRate = gradeCoverageRate;
    const nextCoverageRate = activeJobLevels.length
      ? Number(((Math.max(sortedSalaryGrades.length - 1, 0) / activeJobLevels.length) * 100).toFixed(1))
      : 0;
    const nextSeriesConfiguredCount = Math.max(seriesGrades.length - 1, 0);
    const nextSeriesCoverageRate = seriesLevels.length
      ? Number(((nextSeriesConfiguredCount / seriesLevels.length) * 100).toFixed(1))
      : 0;
    const targetIndex = seriesLevels.findIndex(level => level.id === grade.levelId);

    let previousConfiguredLevel: JobLevelOption | null = null;
    let previousConfiguredGrade: SalaryGrade | null = null;
    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      const level = seriesLevels[index];
      const matchedGrade = salaryGrades.find(item => item.levelId === level.id) || null;
      if (matchedGrade) {
        previousConfiguredLevel = level;
        previousConfiguredGrade = matchedGrade;
        break;
      }
    }

    let nextConfiguredLevel: JobLevelOption | null = null;
    let nextConfiguredGrade: SalaryGrade | null = null;
    for (let index = targetIndex + 1; index < seriesLevels.length; index += 1) {
      const level = seriesLevels[index];
      const matchedGrade = salaryGrades.find(item => item.levelId === level.id) || null;
      if (matchedGrade) {
        nextConfiguredLevel = level;
        nextConfiguredGrade = matchedGrade;
        break;
      }
    }

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];

    if (currentCoverageRate > nextCoverageRate) {
      riskItems.push({
        key: 'coverage-drop',
        title: '删除后整体覆盖率会下降',
        detail: `当前启用职级覆盖率会从 ${currentCoverageRate}% 降到 ${nextCoverageRate}%，待配置清单会重新出现这条职级。`,
        severity: 'warning',
      });
    }

    if (seriesGrades.length === 1) {
      riskItems.push({
        key: 'clear-series',
        title: '删除后整条序列会失去薪级样本',
        detail: `${levelSeries} 序列当前只剩这一条薪级，删除后序列覆盖率会直接回到 0%。`,
        severity: 'warning',
      });
    } else if (previousConfiguredLevel && nextConfiguredLevel && previousConfiguredGrade && nextConfiguredGrade) {
      riskItems.push({
        key: 'series-gap',
        title: '删除后序列中间会出现断档',
        detail: `删除后 ${previousConfiguredLevel.levelCode || previousConfiguredLevel.levelName || '上一级'} 与 ${nextConfiguredLevel.levelCode || nextConfiguredLevel.levelName || '下一级'} 之间会缺一档，带宽联调时需要人工补脑这段区间。`,
        severity: 'warning',
      });
    }

    if (selectedLevel && String(grade.currency || 'CNY') !== 'CNY') {
      riskItems.push({
        key: 'non-cny-grade',
        title: '当前薪级使用了非默认币种',
        detail: `删除后 ${selectedLevel.levelCode || selectedLevel.levelName || '当前职级'} 的 ${grade.currency || '未知币种'} 带宽样本会一起消失。`,
        severity: 'warning',
      });
    }

    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const riskSummary = !score
      ? {
        label: '可直接删除',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '当前删除不会影响覆盖率和序列连续性，可以直接回放删除接口。',
      }
      : score <= 2
        ? {
          label: '删除需确认',
          className: 'border-amber-200 bg-amber-50 text-amber-700',
          hint: `发现 ${riskItems.length} 条删除前提示，确认覆盖率变化后再继续。`,
        }
        : {
          label: '删除影响较大',
          className: 'border-amber-200 bg-amber-50 text-amber-700',
          hint: `当前有 ${riskItems.length} 条删除前提示，建议先确认序列带宽是否还要保留。`,
        };

    return {
      selectedLevel,
      previousConfiguredLevel,
      previousConfiguredGrade,
      nextConfiguredLevel,
      nextConfiguredGrade,
      currentCoverageRate,
      nextCoverageRate,
      nextSeriesConfiguredCount,
      nextSeriesCoverageRate,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  };

  const salaryGradeDeleteDiagnosticsMap = useMemo(
    () => new Map(sortedSalaryGrades.map(grade => [grade.levelId, buildSalaryGradeDeleteDiagnostics(grade)])),
    [activeJobLevels, gradeCoverageRate, jobLevelMap, salaryGrades, sortedSalaryGrades],
  );

  const futureEffectiveEmployeeSalaries = useMemo(
    () => workingEmployeeSalaries.filter(item => isFutureDate(item.effectiveDate)),
    [workingEmployeeSalaries],
  );

  const currentEmployeeRecord = useMemo(
    () => filteredEmployeeSalaries.find(item => String(item.employeeId) === selectedEmployeeId) || null,
    [filteredEmployeeSalaries, selectedEmployeeId],
  );

  const currentAdjustmentRecord = useMemo(
    () => filteredAdjustments.find(item => String(item.id) === selectedAdjustmentId) || null,
    [filteredAdjustments, selectedAdjustmentId],
  );
  const currentAdjustmentFilterEmployee = useMemo(
    () => adjustmentEmployeeFilter === ALL_VALUE ? null : employeeMap.get(Number(adjustmentEmployeeFilter)) || null,
    [adjustmentEmployeeFilter, employeeMap],
  );
  const currentSelectedEmployeeLabel = useMemo(() => {
    if (!currentEmployeeRecord) return '';

    const currentEmployee = employeeMap.get(currentEmployeeRecord.employeeId);
    if (currentEmployee) {
      return buildEmployeeLabel(currentEmployee);
    }

    return [currentEmployeeRecord.employeeNo, currentEmployeeRecord.employeeName].filter(Boolean).join(' / ');
  }, [currentEmployeeRecord, employeeMap]);
  const structureLinkedEmployeeRecords = useMemo(
    () => !structureDetail ? [] : workingEmployeeSalaries.filter(item => item.structureId === structureDetail.id),
    [structureDetail, workingEmployeeSalaries],
  );
  const structureLinkedEmployeeIds = useMemo(
    () => Array.from(new Set(structureLinkedEmployeeRecords.map(item => item.employeeId))),
    [structureLinkedEmployeeRecords],
  );
  const structureLinkedFutureEmployeeRecords = useMemo(
    () => structureLinkedEmployeeRecords.filter(item => isFutureDate(item.effectiveDate)),
    [structureLinkedEmployeeRecords],
  );
  const structureLinkedCurrentEmployeeRecords = useMemo(
    () => structureLinkedEmployeeRecords.filter(item => !isFutureDate(item.effectiveDate)),
    [structureLinkedEmployeeRecords],
  );
  const structureLinkedEmployeeRows = useMemo(
    () => [...structureLinkedEmployeeRecords].sort((left, right) => {
      const leftFuture = isFutureDate(left.effectiveDate) ? 1 : 0;
      const rightFuture = isFutureDate(right.effectiveDate) ? 1 : 0;
      if (leftFuture !== rightFuture) {
        return rightFuture - leftFuture;
      }

      const rightTime = new Date(right.effectiveDate || right.updateTime || right.createTime || 0).getTime();
      const leftTime = new Date(left.effectiveDate || left.updateTime || left.createTime || 0).getTime();
      return rightTime - leftTime || right.id - left.id;
    }),
    [structureLinkedEmployeeRecords],
  );
  const structureLinkedSalaryStats = useMemo(() => {
    const totals = structureLinkedEmployeeRecords
      .map(item => normalizeAmount(item.totalSalary))
      .filter(value => Number.isFinite(value) && value > 0);

    return {
      count: totals.length,
      min: totals.length ? Math.min(...totals) : 0,
      median: getMedianValue(totals),
      max: totals.length ? Math.max(...totals) : 0,
    };
  }, [structureLinkedEmployeeRecords]);
  const structureItemStats = useMemo(() => {
    const items = structureDetail?.items || [];
    return {
      total: items.length,
      fixed: items.filter(item => item.itemType === 'FIXED').length,
      variable: items.filter(item => item.itemType === 'VARIABLE').length,
      taxable: items.filter(item => Boolean(item.isTaxable)).length,
      disabled: items.filter(item => Number(item.status ?? 1) !== 1).length,
      formula: items.filter(item => Boolean(item.formula && String(item.formula).trim())).length,
    };
  }, [structureDetail]);
  // 结构风险直接汇总到详情区，方便从基础配置一路核到员工现薪，不再来回切页找异常。
  const structureRiskItems = useMemo(() => {
    if (!structureDetail) return [] as Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }>;

    const items: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];

    if (structureDetail.items?.length === 0) {
      items.push({
        key: 'empty-items',
        title: '结构还没有关联薪资项目',
        detail: '空结构无法直接用于真实分配，即使结构本身启用，也很难在员工现薪里形成可核对的薪资明细。',
        severity: 'danger',
      });
    }

    if (Number(structureDetail.status ?? 1) !== 1 && structureLinkedEmployeeRecords.length > 0) {
      items.push({
        key: 'disabled-structure-in-use',
        title: '结构已禁用但仍有现薪在用',
        detail: `当前还有 ${structureLinkedEmployeeRecords.length} 条 ACTIVE 在岗现薪引用这套结构，禁用只会阻止新分配，不会自动迁移旧档案。`,
        severity: 'danger',
      });
    }

    if (structureItemStats.disabled > 0) {
      items.push({
        key: 'disabled-items',
        title: '结构仍引用禁用薪资项目',
        detail: `当前结构包含 ${structureItemStats.disabled} 个禁用项目，历史明细仍能展示，但后续编辑和分配要注意是否继续保留这些项目。`,
        severity: 'warning',
      });
    }

    if (structureLinkedFutureEmployeeRecords.length > 0) {
      items.push({
        key: 'future-linked-salaries',
        title: '关联现薪里包含未来生效档案',
        detail: `当前有 ${structureLinkedFutureEmployeeRecords.length} 条关联现薪的生效日晚于今天，做结构联调时要区分“接口当前返回”和“今天已实际生效”的员工。`,
        severity: 'warning',
      });
    }

    if (structureLinkedEmployeeRecords.length === 0) {
      items.push({
        key: 'no-linked-employees',
        title: '当前没有在岗样本',
        detail: '还没有在岗员工使用这套结构，基础配置是完整的，但还无法直接验证员工现薪、调薪和个税测算链路。',
        severity: 'warning',
      });
    }

    return items;
  }, [
    structureDetail,
    structureItemStats.disabled,
    structureLinkedEmployeeRecords.length,
    structureLinkedFutureEmployeeRecords.length,
  ]);
  const structureRiskSummary = useMemo(() => {
    const score = structureRiskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    if (!score) {
      return {
        label: '结构可直接联调',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '当前结构、项目和现薪样本口径已经对齐，可以直接核对结构联动结果。',
      };
    }

    if (score <= 2) {
      return {
        label: '结构需注意',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        hint: `发现 ${structureRiskItems.length} 条需要人工确认的结构联调提示。`,
      };
    }

    return {
      label: '结构信息不足',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      hint: `当前有 ${structureRiskItems.length} 条高风险提示，建议先补齐结构口径再继续联调。`,
    };
  }, [structureRiskItems]);
  const orphanSalaryItems = useMemo(
    () => salaryItems.filter(item => !salaryItemUsageMap.get(item.id)?.structureIds.size),
    [salaryItemUsageMap, salaryItems],
  );
  const linkedSalaryItems = useMemo(
    () => salaryItems.filter(item => Boolean(salaryItemUsageMap.get(item.id)?.activeArchiveCount)),
    [salaryItemUsageMap, salaryItems],
  );
  const disabledReferencedSalaryItems = useMemo(
    () => salaryItems.filter(item => Number(item.status ?? 1) === 0 && Boolean(salaryItemUsageMap.get(item.id)?.structureIds.size)),
    [salaryItemUsageMap, salaryItems],
  );
  const formulaSalaryItems = useMemo(
    () => salaryItems.filter(item => Boolean(item.formula && String(item.formula).trim())),
    [salaryItems],
  );
  const salaryItemRiskItems = useMemo(() => {
    const items: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];

    if (disabledReferencedSalaryItems.length > 0) {
      items.push({
        key: 'disabled-referenced',
        title: '禁用项目仍被结构引用',
        detail: `当前有 ${disabledReferencedSalaryItems.length} 个禁用项目仍挂在薪资结构里，历史明细还能展示，但后续结构编辑和员工分配要重点核对。`,
        severity: 'danger',
      });
    }

    if (orphanSalaryItems.length > 0) {
      items.push({
        key: 'orphan-items',
        title: '存在未被任何结构引用的项目',
        detail: `当前有 ${orphanSalaryItems.length} 个项目还没被任何薪资结构使用，适合清理或继续补结构联动。`,
        severity: 'warning',
      });
    }

    if (formulaSalaryItems.length > 0) {
      items.push({
        key: 'formula-items',
        title: '存在带公式的薪资项目',
        detail: `当前有 ${formulaSalaryItems.length} 个项目带公式配置，联调时要确认这些公式只是展示属性，还是已经被后端真实使用。`,
        severity: 'warning',
      });
    }

    return items;
  }, [disabledReferencedSalaryItems.length, formulaSalaryItems.length, orphanSalaryItems.length]);
  const salaryItemRiskSummary = useMemo(() => {
    const score = salaryItemRiskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    if (!score) {
      return {
        label: '项目可直接联调',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '当前项目、结构引用和现薪命中关系比较清晰，可以直接核对项目联动。',
      };
    }

    if (score <= 2) {
      return {
        label: '项目需注意',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        hint: `发现 ${salaryItemRiskItems.length} 条需要人工确认的项目联调提示。`,
      };
    }

    return {
      label: '项目信息不足',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      hint: `当前有 ${salaryItemRiskItems.length} 条高风险提示，建议先补齐项目和结构关系。`,
    };
  }, [salaryItemRiskItems]);
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

  const sortedAdjustmentEmployeeSalaryHistory = useMemo(
    () => [...adjustmentEmployeeSalaryHistory].sort((left, right) => {
      const rightTime = new Date(right.effectiveDate || right.updateTime || right.createTime || 0).getTime();
      const leftTime = new Date(left.effectiveDate || left.updateTime || left.createTime || 0).getTime();
      return rightTime - leftTime || right.id - left.id;
    }),
    [adjustmentEmployeeSalaryHistory],
  );

  const adjustmentTargetSalaryMap = useMemo(
    () => parseJsonSalaryData(adjustmentDetail?.afterSalaryData),
    [adjustmentDetail?.afterSalaryData],
  );

  const adjustmentCurrentSalaryMap = useMemo(
    () => buildSalaryItemAmountMap(adjustmentEmployeeSalaryDetail?.items),
    [adjustmentEmployeeSalaryDetail?.items],
  );

  const adjustmentMatchedArchive = useMemo(() => {
    if (!adjustmentDetail) return null;

    const targetEffectiveDate = toDateInputValue(adjustmentDetail.effectiveDate) || '';
    const targetTotal = normalizeAmount(adjustmentDetail.afterTotal);

    return sortedAdjustmentEmployeeSalaryHistory.find(item =>
      (toDateInputValue(item.effectiveDate) || '') === targetEffectiveDate
      && normalizeAmount(item.totalSalary) === targetTotal,
    ) || null;
  }, [adjustmentDetail, sortedAdjustmentEmployeeSalaryHistory]);

  const adjustmentCurrentSalaryMatched = useMemo(() => {
    if (!adjustmentDetail || !adjustmentEmployeeSalaryDetail) return false;

    return (toDateInputValue(adjustmentEmployeeSalaryDetail.effectiveDate) || '') === (toDateInputValue(adjustmentDetail.effectiveDate) || '')
      && normalizeAmount(adjustmentEmployeeSalaryDetail.totalSalary) === normalizeAmount(adjustmentDetail.afterTotal)
      && salaryDataEquals(adjustmentTargetSalaryMap, adjustmentCurrentSalaryMap);
  }, [adjustmentCurrentSalaryMap, adjustmentDetail, adjustmentEmployeeSalaryDetail, adjustmentTargetSalaryMap]);

  const adjustmentChangedItemCount = useMemo(
    () => adjustmentDiffRows.filter(item => Math.abs(Number(item.delta || 0)) > 0.005).length,
    [adjustmentDiffRows],
  );

  const adjustmentCurrentTotalDelta = useMemo(() => {
    if (!adjustmentDetail || !adjustmentEmployeeSalaryDetail) return null;
    return Number((Number(adjustmentEmployeeSalaryDetail.totalSalary || 0) - Number(adjustmentDetail.afterTotal || 0)).toFixed(2));
  }, [adjustmentDetail, adjustmentEmployeeSalaryDetail]);

  const adjustmentEffectiveOffsetDays = useMemo(
    () => getDateOffsetFromToday(adjustmentDetail?.effectiveDate),
    [adjustmentDetail?.effectiveDate],
  );

  const adjustmentClosureInsight = useMemo(() => {
    if (!adjustmentDetail) return null;

    const status = String(adjustmentDetail.status || '').toUpperCase();
    const effectiveDateLabel = toDateInputValue(adjustmentDetail.effectiveDate) || '-';
    const effectiveHint = adjustmentEffectiveOffsetDays == null
      ? ''
      : adjustmentEffectiveOffsetDays > 0
        ? `距离今天还有 ${adjustmentEffectiveOffsetDays} 天`
        : adjustmentEffectiveOffsetDays === 0
          ? '今天生效'
          : `已在 ${Math.abs(adjustmentEffectiveOffsetDays)} 天前进入生效日`;

    switch (status) {
      case 'DRAFT':
        return {
          stageLabel: '草稿待提交',
          stageHint: '仍可继续调整调薪后明细和原因。',
          landingLabel: '尚未进入档案',
          landingHint: '草稿状态不会生成新的薪资档案。',
          landingTone: 'slate',
          nextAction: '下一步建议：确认无误后提交审批。',
        };
      case 'APPROVING':
        // 真实联调确认：已到生效日的调薪单在审批通过时会被后端直接推进到 EFFECTIVE。
        return {
          stageLabel: '审批中',
          stageHint: '流程已发起，等待审批通过。',
          landingLabel: isFutureDate(adjustmentDetail.effectiveDate) ? '等待审批结果' : '审批通过后可能直接生效',
          landingHint: isFutureDate(adjustmentDetail.effectiveDate)
            ? '审批完成前不会写入薪资档案。'
            : '对已到生效日的单据，后端在审批通过时会直接写入薪资档案并刷新当前现薪。',
          landingTone: 'amber',
          nextAction: isFutureDate(adjustmentDetail.effectiveDate)
            ? '下一步建议：审批通过后继续等待生效日。'
            : '下一步建议：审批通过后立即刷新详情，确认是否已直接切到 EFFECTIVE。',
        };
      case 'APPROVED':
        if (adjustmentMatchedArchive) {
          return {
            stageLabel: '已审批通过',
            stageHint: '流程状态已通过审批。',
            landingLabel: '已定位到目标档案',
            landingHint: `已匹配薪资档案 #${adjustmentMatchedArchive.id}，请确认是否为提前生效或已被后台写入。`,
            landingTone: 'sky',
            nextAction: '下一步建议：核对状态流转是否已经同步到 EFFECTIVE。',
          };
        }

        if (isFutureDate(adjustmentDetail.effectiveDate)) {
          return {
            stageLabel: '已审批通过',
            stageHint: '流程已通过，但尚未到生效日。',
            landingLabel: '等待生效日',
            landingHint: `${effectiveDateLabel} 生效，${effectiveHint || '暂未到生效时间'}。`,
            landingTone: 'amber',
            nextAction: '下一步建议：到达生效日后再执行生效。',
          };
        }

        return {
          stageLabel: '已审批通过',
          stageHint: '已满足流程审批条件。',
          landingLabel: '待执行生效',
          landingHint: '当前还没有在薪资档案中找到目标记录。',
          landingTone: 'amber',
          nextAction: '下一步建议：可以直接执行生效，观察是否生成新档案。',
        };
      case 'EFFECTIVE':
        if (adjustmentCurrentSalaryMatched) {
          return {
            stageLabel: '已生效',
            stageHint: '状态流转已完成。',
            landingLabel: '已落当前现薪',
            landingHint: '当前 ACTIVE 现薪与调薪后明细完全一致。',
            landingTone: 'emerald',
            nextAction: '下一步建议：可切到员工现薪继续核对五险一金和个税测算。',
          };
        }

        if (adjustmentMatchedArchive) {
          return {
            stageLabel: '已生效',
            stageHint: '状态流转已完成。',
            landingLabel: '已写入历史档案',
            landingHint: `已匹配薪资档案 #${adjustmentMatchedArchive.id}，当前现薪可能已被后续档案覆盖。`,
            landingTone: 'sky',
            nextAction: '下一步建议：结合员工薪资历史确认后续调薪链路。',
          };
        }

        return {
          stageLabel: '已生效',
          stageHint: '流程状态显示已完成。',
          landingLabel: '未定位到目标档案',
          landingHint: `暂未找到 ${effectiveDateLabel} / ${formatCurrency(adjustmentDetail.afterTotal)} 的薪资档案记录。`,
          landingTone: 'rose',
          nextAction: '下一步建议：优先核对后端生效逻辑和薪资档案落库结果。',
        };
      default:
        return {
          stageLabel: adjustmentStatusLabel(adjustmentDetail.status),
          stageHint: '当前状态未纳入专门提示。',
          landingLabel: '待核对',
          landingHint: '请结合薪资档案结果手工确认。',
          landingTone: 'slate',
          nextAction: '下一步建议：刷新调薪详情和员工现薪后继续核对。',
        };
    }
  }, [adjustmentCurrentSalaryMatched, adjustmentDetail, adjustmentEffectiveOffsetDays, adjustmentMatchedArchive]);

  const adjustmentActionDiagnostics = useMemo(() => {
    if (!adjustmentDetail) return null;

    const status = String(adjustmentDetail.status || '').toUpperCase();
    const isFutureEffective = isFutureDate(adjustmentDetail.effectiveDate);
    const effectiveDateLabel = toDateInputValue(adjustmentDetail.effectiveDate) || '-';
    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    let actionLabel = '刷新详情';
    let actionHint = '刷新后核对闭环。';
    let canRun = false;

    if (status === 'DRAFT') {
      actionLabel = '提交审批';
      actionHint = '提交后进入审批。';
      canRun = true;

      if (adjustmentChangedItemCount === 0) {
        riskItems.push({
          key: 'draft-no-diff',
          title: '调薪前后没有任何有效差异',
          detail: '当前调薪明细与调薪前几乎一致，继续提交大概率只会制造重复审批单。',
          severity: 'danger',
        });
      }
      if (adjustmentCurrentSalaryMatched) {
        riskItems.push({
          key: 'draft-already-landed',
          title: '当前现薪已经等于调薪后结果',
          detail: '在草稿阶段就已经命中调薪后现薪，继续提交前要先确认是否重复造单。',
          severity: 'danger',
        });
      } else if (adjustmentMatchedArchive) {
        riskItems.push({
          key: 'draft-archive-exists',
          title: '草稿阶段已命中目标薪资档案',
          detail: `当前已经匹配到薪资档案 #${adjustmentMatchedArchive.id}，说明这组结果可能已经被写入过。`,
          severity: 'warning',
        });
      }
      if (!String(adjustmentDetail.adjustmentReason || '').trim()) {
        riskItems.push({
          key: 'draft-missing-reason',
          title: '调薪原因仍为空',
          detail: '提交审批前建议补齐原因，否则后续回看同日多单时不容易区分这张单据。',
          severity: 'warning',
        });
      }
      if (isFutureEffective) {
        riskItems.push({
          key: 'draft-future-effective',
          title: '这是未来生效调薪',
          detail: `${effectiveDateLabel} 才会进入生效日，提交审批后今天的现薪和测算仍不会立刻切换。`,
          severity: 'warning',
        });
      }
    } else if (status === 'APPROVING') {
      actionLabel = '审批通过';
      // 真实联调确认：今天生效的单据在 approve 后会直接生效，不会停留在 APPROVED。
      actionHint = isFutureEffective
        ? '审批后待生效。'
        : '审批后直生效。';
      canRun = true;

      if (!String(adjustmentDetail.processInstanceId || '').trim()) {
        riskItems.push({
          key: 'approving-missing-process',
          title: '审批中但缺少流程实例号',
          detail: '当前状态已经是 APPROVING，但没有读取到 processInstanceId，继续推进前要先确认流程链路是否完整。',
          severity: 'danger',
        });
      }
      if (adjustmentCurrentSalaryMatched) {
        riskItems.push({
          key: 'approving-already-landed',
          title: '审批中但当前现薪已经追平',
          detail: '现薪已经等于调薪后结果，说明后端可能提前写档，继续审批前建议先核对链路。',
          severity: 'danger',
        });
      } else if (adjustmentMatchedArchive) {
        riskItems.push({
          key: 'approving-archive-exists',
          title: '审批完成前已命中目标档案',
          detail: `当前已经匹配到薪资档案 #${adjustmentMatchedArchive.id}，审批动作前建议先确认是否提前落档。`,
          severity: 'warning',
        });
      }
      if (isFutureEffective) {
        riskItems.push({
          key: 'approving-future-effective',
          title: '审批通过后仍需等待生效日',
          detail: `${effectiveDateLabel} 才到生效日，本次审批通过不会立刻把现薪切到调薪后结果。`,
          severity: 'warning',
        });
      }
    } else if (status === 'APPROVED') {
      actionLabel = '执行生效';
      actionHint = isFutureEffective
        ? `${effectiveDateLabel} 前不可执行。`
        : '执行后写入现薪。';
      canRun = !isFutureEffective;

      if (isFutureEffective) {
        riskItems.push({
          key: 'approved-future-effective',
          title: '还没到生效日',
          detail: `${effectiveDateLabel} 才会进入生效窗口，当前执行生效不符合真实业务节奏。`,
          severity: 'danger',
        });
      }
      if (adjustmentCurrentSalaryMatched) {
        riskItems.push({
          key: 'approved-already-current',
          title: '当前现薪已经命中调薪后结果',
          detail: '当前 ACTIVE 现薪已经与调薪后明细一致，重复执行生效很容易制造额外档案。',
          severity: 'danger',
        });
      } else if (adjustmentMatchedArchive) {
        riskItems.push({
          key: 'approved-archive-exists',
          title: '已匹配到目标薪资档案',
          detail: `当前已命中薪资档案 #${adjustmentMatchedArchive.id}，执行生效前建议先确认是不是后台已提前落档。`,
          severity: 'warning',
        });
      }
    } else if (status === 'EFFECTIVE') {
      actionLabel = '已完成生效';
      actionHint = adjustmentCurrentSalaryMatched
        ? '已对齐现薪。'
        : '已生效，待核对。';
      canRun = false;

      if (!adjustmentCurrentSalaryMatched && !adjustmentMatchedArchive) {
        riskItems.push({
          key: 'effective-missing-archive',
          title: '状态已生效但未定位到目标档案',
          detail: `当前还没找到 ${effectiveDateLabel} / ${formatCurrency(adjustmentDetail.afterTotal)} 的薪资档案记录。`,
          severity: 'danger',
        });
      } else if (!adjustmentCurrentSalaryMatched && adjustmentMatchedArchive) {
        riskItems.push({
          key: 'effective-covered-by-later',
          title: '状态已生效但当前现薪未命中',
          detail: `已定位到薪资档案 #${adjustmentMatchedArchive.id}，当前现薪可能已被后续档案覆盖。`,
          severity: 'warning',
        });
      }
    } else if (status === 'REJECTED') {
      actionLabel = '已拒绝';
      actionHint = '已拒绝。';
      canRun = false;
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !canRun
      ? score
        ? {
          label: '待核对',
          className: 'border-amber-200 bg-amber-50 text-amber-700',
          hint: `${riskItems.length} 条待处理。`,
        }
        : {
          label: '无动作',
          className: 'border-slate-200 bg-slate-50 text-slate-600',
          hint: actionHint,
        }
      : !score
        ? {
          label: `可${actionLabel}`,
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          hint: actionHint,
        }
        : blockingRiskItems.length
          ? {
            label: `${actionLabel}前处理`,
            className: 'border-rose-200 bg-rose-50 text-rose-700',
            hint: `${blockingRiskItems.length} 条待处理。`,
          }
          : {
            label: `${actionLabel}前核对`,
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `${riskItems.length} 条待核对。`,
          };

    return {
      status,
      actionLabel,
      actionHint,
      canRun,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [
    adjustmentChangedItemCount,
    adjustmentCurrentSalaryMatched,
    adjustmentDetail,
    adjustmentMatchedArchive,
  ]);

  const sortedEmployeeAdjustmentHistory = useMemo(
    () => [...employeeAdjustmentHistory].sort((left, right) => {
      const rightTime = new Date(right.effectiveDate || right.createTime || 0).getTime();
      const leftTime = new Date(left.effectiveDate || left.createTime || 0).getTime();
      return rightTime - leftTime || right.id - left.id;
    }),
    [employeeAdjustmentHistory],
  );

  const latestEmployeeAdjustment = sortedEmployeeAdjustmentHistory[0] || null;

  const employeeCurrentSalarySnapshot = useMemo(
    () => employeeSalaryDetail || currentEmployeeRecord,
    [currentEmployeeRecord, employeeSalaryDetail],
  );

  const employeeAdjustmentHistoryDiagnostics = useMemo(() => {
    const duplicateEffectiveDates = Array.from(
      sortedEmployeeAdjustmentHistory.reduce((result, item) => {
        const effectiveDate = toDateInputValue(item.effectiveDate);
        if (!effectiveDate) return result;
        result.set(effectiveDate, (result.get(effectiveDate) || 0) + 1);
        return result;
      }, new Map<string, number>()),
    )
      .filter(([, count]) => count > 1)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    const duplicateDateMap = new Map(duplicateEffectiveDates);
    const matchedArchiveMap = new Map<number, EmployeeSalary>();
    const rowIssueMap = new Map<number, Array<{ key: string; label: string; detail: string; severity: 'warning' | 'danger' }>>();
    let landedCurrentCount = 0;
    let landedHistoryCount = 0;
    let pendingPastDueCount = 0;
    let unmatchedEffectiveCount = 0;
    let statusLagCount = 0;
    let futureEffectiveCount = 0;

    const pushRowIssue = (
      recordId: number,
      issue: { key: string; label: string; detail: string; severity: 'warning' | 'danger' },
    ) => {
      const current = rowIssueMap.get(recordId) || [];
      current.push(issue);
      rowIssueMap.set(recordId, current);
    };

    sortedEmployeeAdjustmentHistory.forEach(item => {
      const effectiveDate = toDateInputValue(item.effectiveDate) || '';
      const duplicateCount = effectiveDate ? duplicateDateMap.get(effectiveDate) || 0 : 0;
      const matchedCurrent = isSalaryLandingMatched(employeeCurrentSalarySnapshot, item.effectiveDate, item.afterTotal);
      const matchedArchive = employeeSalaryHistory.find(record => isSalaryLandingMatched(record, item.effectiveDate, item.afterTotal)) || null;
      const status = String(item.status || '').toUpperCase();
      const futureEffective = isFutureDate(item.effectiveDate);

      if (matchedArchive) {
        matchedArchiveMap.set(item.id, matchedArchive);
      }

      if (duplicateCount > 0) {
        pushRowIssue(item.id, {
          key: 'duplicate-effective-date',
          label: '同日多次',
          detail: `${effectiveDate} ${duplicateCount} 条`,
          severity: duplicateCount > 1 ? 'warning' : 'warning',
        });
      }

      if (matchedCurrent) {
        landedCurrentCount += 1;
        pushRowIssue(item.id, {
          key: 'landed-current',
          label: '已落当前现薪',
          detail: '已命中 ACTIVE 现薪',
          severity: 'warning',
        });
      } else if (matchedArchive) {
        landedHistoryCount += 1;
        pushRowIssue(item.id, {
          key: 'landed-history',
          label: '已落历史档案',
          detail: `命中档案 #${matchedArchive.id}`,
          severity: 'warning',
        });
      }

      if (futureEffective) {
        futureEffectiveCount += 1;
        pushRowIssue(item.id, {
          key: 'future-effective',
          label: '未来生效',
          detail: `${effectiveDate} 生效`,
          severity: 'warning',
        });
      }

      switch (status) {
        case 'EFFECTIVE':
          if (!matchedCurrent && !matchedArchive) {
            unmatchedEffectiveCount += 1;
            pushRowIssue(item.id, {
              key: 'effective-unmatched',
              label: '已生效未落档',
              detail: `${effectiveDate} / ${formatCurrency(item.afterTotal)}`,
              severity: 'danger',
            });
          }
          break;
        case 'APPROVED':
          if (matchedCurrent || matchedArchive) {
            statusLagCount += 1;
            pushRowIssue(item.id, {
              key: 'approved-but-landed',
              label: '状态滞后',
              detail: 'APPROVED 已落档',
              severity: 'danger',
            });
          } else if (!futureEffective) {
            pendingPastDueCount += 1;
            pushRowIssue(item.id, {
              key: 'approved-past-due',
              label: '到期未执行',
              detail: `${effectiveDate} 已到期`,
              severity: 'danger',
            });
          }
          break;
        case 'APPROVING':
          if (matchedCurrent || matchedArchive) {
            statusLagCount += 1;
            pushRowIssue(item.id, {
              key: 'approving-but-landed',
              label: '审批中已落档',
              detail: 'APPROVING 已落档',
              severity: 'danger',
            });
          } else if (!futureEffective) {
            pendingPastDueCount += 1;
            pushRowIssue(item.id, {
              key: 'approving-past-due',
              label: '审批滞后',
              detail: `${effectiveDate} 已到期`,
              severity: 'warning',
            });
          }
          break;
        case 'DRAFT':
          if (matchedCurrent || matchedArchive) {
            statusLagCount += 1;
            pushRowIssue(item.id, {
              key: 'draft-but-landed',
              label: '草稿已落档',
              detail: 'DRAFT 已落档',
              severity: 'danger',
            });
          } else if (!futureEffective) {
            pendingPastDueCount += 1;
            pushRowIssue(item.id, {
              key: 'stale-draft',
              label: '草稿过期',
              detail: `${effectiveDate} 已到期`,
              severity: 'warning',
            });
          }
          break;
        case 'REJECTED':
          if (matchedCurrent || matchedArchive) {
            statusLagCount += 1;
            pushRowIssue(item.id, {
              key: 'rejected-but-landed',
              label: '已拒绝却落档',
              detail: 'REJECTED 已落档',
              severity: 'danger',
            });
          }
          break;
        default:
          break;
      }
    });

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (unmatchedEffectiveCount > 0) {
      riskItems.push({
        key: 'effective-unmatched',
        title: '已生效未落档',
        detail: `${unmatchedEffectiveCount} 条`,
        severity: 'danger',
      });
    }
    if (pendingPastDueCount > 0) {
      riskItems.push({
        key: 'pending-past-due',
        title: '到期未推进',
        detail: `${pendingPastDueCount} 条`,
        severity: 'danger',
      });
    }
    if (statusLagCount > 0) {
      riskItems.push({
        key: 'status-lag',
        title: '状态不同步',
        detail: `${statusLagCount} 条`,
        severity: 'danger',
      });
    }
    if (duplicateEffectiveDates.length > 0) {
      const [effectiveDate, count] = duplicateEffectiveDates[0];
      riskItems.push({
        key: 'duplicate-effective-date',
        title: '同日多次调薪',
        detail: `${effectiveDate} / ${count} 条`,
        severity: 'warning',
      });
    }
    if (futureEffectiveCount > 0) {
      riskItems.push({
        key: 'future-effective',
        title: '未来生效',
        detail: `${futureEffectiveCount} 条`,
        severity: 'warning',
      });
    }

    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !score
      ? {
        label: '可核对',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '履历已对齐。',
      }
      : score <= 2
        ? {
          label: '待核对',
          className: 'border-amber-200 bg-amber-50 text-amber-700',
          hint: `${riskItems.length} 条待处理。`,
        }
        : {
          label: '待处理',
          className: 'border-rose-200 bg-rose-50 text-rose-700',
          hint: `${riskItems.length} 条待处理。`,
        };

    return {
      duplicateEffectiveDates,
      landedCurrentCount,
      landedHistoryCount,
      pendingPastDueCount,
      unmatchedEffectiveCount,
      riskItems,
      riskSummary,
      rowIssueMap,
      matchedArchiveMap,
    };
  }, [employeeCurrentSalarySnapshot, employeeSalaryHistory, sortedEmployeeAdjustmentHistory]);

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

  const currentEmployeeEffectiveDate = useMemo(
    () => toDateInputValue(employeeSalaryDetail?.effectiveDate || currentEmployeeRecord?.effectiveDate) || '',
    [currentEmployeeRecord?.effectiveDate, employeeSalaryDetail?.effectiveDate],
  );

  const currentEmployeeFutureEffective = useMemo(
    () => Boolean(currentEmployeeEffectiveDate) && currentEmployeeEffectiveDate > getTodayValue(),
    [currentEmployeeEffectiveDate],
  );

  const currentEmployeeEffectiveOffsetDays = useMemo(
    () => getDateOffsetFromToday(employeeSalaryDetail?.effectiveDate || currentEmployeeRecord?.effectiveDate),
    [currentEmployeeRecord?.effectiveDate, employeeSalaryDetail?.effectiveDate],
  );

  const employeeSalaryDuplicateEffectiveDates = useMemo(
    () => Array.from(
      employeeSalaryHistory.reduce((result, item) => {
        const effectiveDate = toDateInputValue(item.effectiveDate);
        if (!effectiveDate) return result;
        result.set(effectiveDate, (result.get(effectiveDate) || 0) + 1);
        return result;
      }, new Map<string, number>()),
    )
      .filter(([, count]) => count > 1)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
    [employeeSalaryHistory],
  );

  const latestEmployeeAdjustmentMatchedArchive = useMemo(() => {
    if (!latestEmployeeAdjustment) return null;

    return employeeSalaryHistory.find(item =>
      (toDateInputValue(item.effectiveDate) || '') === (toDateInputValue(latestEmployeeAdjustment.effectiveDate) || '')
      && normalizeAmount(item.totalSalary) === normalizeAmount(latestEmployeeAdjustment.afterTotal),
    ) || null;
  }, [employeeSalaryHistory, latestEmployeeAdjustment]);

  const latestEmployeeAdjustmentMatchedCurrentSalary = useMemo(() => {
    if (!latestEmployeeAdjustment) return false;

    return (toDateInputValue(latestEmployeeAdjustment.effectiveDate) || '') === currentEmployeeEffectiveDate
      && normalizeAmount(latestEmployeeAdjustment.afterTotal) === normalizeAmount(employeeSalaryDetail?.totalSalary ?? currentEmployeeRecord?.totalSalary);
  }, [currentEmployeeEffectiveDate, currentEmployeeRecord?.totalSalary, employeeSalaryDetail?.totalSalary, latestEmployeeAdjustment]);

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

  const taxConfigBracketPreview = useMemo(() => {
    try {
      const rows = JSON.parse(normalizeTaxBracketJson(taxConfigForm.taxBracketsJson)) as Array<{
        min: number;
        max?: number;
        rate: number;
        deduction: number;
      }>;
      return {
        rows,
        error: '',
        maxRate: rows.reduce((result, item) => Math.max(result, Number(item.rate || 0)), 0),
      };
    } catch (error: any) {
      return {
        rows: [] as Array<{ min: number; max?: number; rate: number; deduction: number }>,
        error: error?.message || '税率档 JSON 格式不正确',
        maxRate: 0,
      };
    }
  }, [taxConfigForm.taxBracketsJson]);

  const taxConfigStandardDeductionTotal = useMemo(
    () => deductionTypeOptions.reduce((sum, item) => sum + Number(taxConfigForm.deductionItems[item.value] || 0), 0),
    [taxConfigForm.deductionItems],
  );

  const taxConfigReferenceEntries = useMemo(
    () => deductionTypeOptions
      .map(item => ({
        type: item.value,
        label: item.label,
        amount: Number(taxConfigForm.deductionItems[item.value] || 0),
      }))
      .filter(item => item.amount > 0),
    [taxConfigForm.deductionItems],
  );

  const taxReferencePeriod = useMemo(() => {
    const { year, month } = getYearMonthFromDate(
      employeeSalaryDetail?.effectiveDate || currentEmployeeRecord?.effectiveDate,
    );

    return `${year}Δκ${month}ΤΒ`;
  }, [currentEmployeeRecord?.effectiveDate, employeeSalaryDetail?.effectiveDate]);

  const taxConfigDiagnostics = useMemo(() => {
    const rows = taxConfigBracketPreview.rows;
    const gapPairs: Array<{ from: number; to: number }> = [];
    const rateDropPairs: Array<{ fromIndex: number; toIndex: number; previousRate: number; nextRate: number }> = [];
    const deductionDropPairs: Array<{ fromIndex: number; toIndex: number; previousDeduction: number; nextDeduction: number }> = [];
    const threshold = Number(taxConfigForm.threshold || 0);

    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];

      if (previous.max != null && Number(current.min) > Number(previous.max)) {
        gapPairs.push({
          from: Number(previous.max),
          to: Number(current.min),
        });
      }

      if (Number(current.rate) < Number(previous.rate)) {
        rateDropPairs.push({
          fromIndex: index,
          toIndex: index + 1,
          previousRate: Number(previous.rate),
          nextRate: Number(current.rate),
        });
      }

      if (Number(current.deduction) < Number(previous.deduction)) {
        deductionDropPairs.push({
          fromIndex: index,
          toIndex: index + 1,
          previousDeduction: Number(previous.deduction),
          nextDeduction: Number(current.deduction),
        });
      }
    }

    const hasOpenEndedLastBracket = rows.length > 0 && rows[rows.length - 1].max == null;
    const sampleTaxableIncome = Number(currentTaxableIncome || 0);
    const sampleTaxableAmount = Number(Math.max(sampleTaxableIncome - threshold - currentTaxDeductionTotal, 0).toFixed(2));
    const matchedBracketIndex = rows.findIndex(item =>
      sampleTaxableAmount >= Number(item.min)
      && (item.max == null || sampleTaxableAmount < Number(item.max)),
    );
    const matchedBracket = matchedBracketIndex >= 0 ? rows[matchedBracketIndex] : null;
    const nextBracket = matchedBracketIndex >= 0
      ? rows[matchedBracketIndex + 1] || null
      : rows.find(item => sampleTaxableAmount < Number(item.min)) || null;
    const remainingToNextBracket = nextBracket
      ? Number(Math.max(Number(nextBracket.min) - sampleTaxableAmount, 0).toFixed(2))
      : null;
    const estimatedTaxAmount = matchedBracket
      ? Number(Math.max(sampleTaxableAmount * Number(matchedBracket.rate || 0) - Number(matchedBracket.deduction || 0), 0).toFixed(2))
      : 0;
    const estimatedAfterTaxIncome = Number((currentGrossSalary - currentPersonalInsurance - estimatedTaxAmount).toFixed(2));
    const differenceFromCurrentTax = Number((estimatedTaxAmount - currentTaxAmount).toFixed(2));

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (taxConfigBracketPreview.error) {
      riskItems.push({
        key: 'json-invalid',
        title: '税率档 JSON 解析失败',
        detail: taxConfigBracketPreview.error,
        severity: 'danger',
      });
    } else {
      if (threshold <= 0) {
        riskItems.push({
          key: 'threshold-invalid',
          title: '起征点未设置为有效值',
          detail: '起征点 <= 0',
          severity: 'danger',
        });
      }

      if (gapPairs.length > 0) {
        const firstGap = gapPairs[0];
        riskItems.push({
          key: 'bracket-gap',
          title: '税率档之间存在断层',
          detail: `${formatCurrency(firstGap.from)} - ${formatCurrency(firstGap.to)} 无档`,
          severity: 'danger',
        });
      }

      if (rateDropPairs.length > 0) {
        const firstDrop = rateDropPairs[0];
        riskItems.push({
          key: 'rate-drop',
          title: '后续税率低于前一档',
          detail: `第 ${firstDrop.toIndex} 档 < 第 ${firstDrop.fromIndex} 档`,
          severity: 'danger',
        });
      }

      if (deductionDropPairs.length > 0) {
        const firstDrop = deductionDropPairs[0];
        riskItems.push({
          key: 'deduction-drop',
          title: '速算扣除数出现倒退',
          detail: `第 ${firstDrop.toIndex} 档 < 第 ${firstDrop.fromIndex} 档`,
          severity: 'warning',
        });
      }

      if (!hasOpenEndedLastBracket) {
        riskItems.push({
          key: 'last-bracket-capped',
          title: '最后一档仍设置了上限',
          detail: '最后一档需无上限',
          severity: 'warning',
        });
      }

      if (taxConfigReferenceEntries.length === 0) {
        riskItems.push({
          key: 'reference-empty',
          title: '专项附加扣除参考标准为空',
          detail: '无专项扣除参考值',
          severity: 'warning',
        });
      }

      if (currentEmployeeRecord && rows.length > 0 && matchedBracketIndex === -1) {
        riskItems.push({
          key: 'sample-outside-brackets',
          title: '当前联调样本落不到任何税档',
          detail: `${currentSelectedEmployeeLabel || '当前员工'} ${formatCurrency(sampleTaxableAmount)} 未命中税档`,
          severity: 'danger',
        });
      }

      if (currentEmployeeRecord && taxConfigReferenceEntries.length > 0 && currentTaxDeductionTotal === 0) {
        riskItems.push({
          key: 'sample-deduction-empty',
          title: '当前联调样本仍按 0 扣除项估算',
          detail: `${currentSelectedEmployeeLabel || '当前员工'} ${taxReferencePeriod} 扣除为 0`,
          severity: 'warning',
        });
      }
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !score
      ? {
        label: '可保存',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '已对齐',
      }
      : score <= 2
        ? {
          label: '需注意',
          className: 'border-amber-200 bg-amber-50 text-amber-700',
          hint: `${riskItems.length} 项`,
        }
        : {
          label: '配置异常',
          className: 'border-rose-200 bg-rose-50 text-rose-700',
          hint: `${riskItems.length} 项`,
        };

    return {
      gapPairs,
      rateDropPairs,
      deductionDropPairs,
      hasOpenEndedLastBracket,
      threshold,
      sampleTaxableIncome,
      sampleTaxableAmount,
      matchedBracketIndex,
      matchedBracket,
      nextBracket,
      remainingToNextBracket,
      estimatedTaxAmount,
      estimatedAfterTaxIncome,
      differenceFromCurrentTax,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [
    currentEmployeeRecord,
    currentGrossSalary,
    currentPersonalInsurance,
    currentSelectedEmployeeLabel,
    currentTaxAmount,
    currentTaxDeductionTotal,
    currentTaxableIncome,
    taxConfigBracketPreview.error,
    taxConfigBracketPreview.rows,
    taxConfigForm.threshold,
    taxConfigReferenceEntries.length,
    taxReferencePeriod,
  ]);

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

  const employeeInsuranceLedgerRecords = useMemo(
    () => sortInsuranceLedgerRecords(employeeInsuranceLedgerPage?.records ?? []),
    [employeeInsuranceLedgerPage?.records],
  );

  const employeeInsuranceLedgerCatalogRecords = useMemo(
    () => sortInsuranceLedgerRecords(employeeInsuranceLedgerCatalog),
    [employeeInsuranceLedgerCatalog],
  );

  const latestEmployeeInsuranceLedger = employeeInsuranceLedgerCatalogRecords[0] || employeeInsuranceLedgerRecords[0] || null;

  const employeeInsuranceLedgerDiagnostics = useMemo(() => {
    const allRecords = employeeInsuranceLedgerCatalogRecords;
    const activeRecords = allRecords.filter(item => String(item.status || '').toUpperCase() === 'ACTIVE');
    const futureRecords = allRecords.filter(item => isFutureDate(item.effectiveDate));
    const duplicateEffectiveDates = Array.from(
      allRecords.reduce((result, item) => {
        const effectiveDate = toDateInputValue(item.effectiveDate);
        if (!effectiveDate) return result;
        const current = result.get(effectiveDate) || { count: 0, activeCount: 0 };
        current.count += 1;
        if (String(item.status || '').toUpperCase() === 'ACTIVE') {
          current.activeCount += 1;
        }
        result.set(effectiveDate, current);
        return result;
      }, new Map<string, { count: number; activeCount: number }>()),
    )
      .filter(([, value]) => value.count > 1)
      .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]));
    const duplicateDateMap = new Map(duplicateEffectiveDates);
    const rowIssueMap = new Map<number, Array<{ key: string; label: string; detail: string; severity: 'warning' | 'danger' }>>();
    const outOfRangeRecords: EmployeeInsurance[] = [];
    const disabledSchemeRecords: EmployeeInsurance[] = [];
    const baseShiftCandidates: Array<{
      current: EmployeeInsurance;
      previous: EmployeeInsurance;
      delta: number;
      absoluteDelta: number;
    }> = [];

    const pushRowIssue = (
      recordId: number,
      issue: { key: string; label: string; detail: string; severity: 'warning' | 'danger' },
    ) => {
      const current = rowIssueMap.get(recordId) || [];
      current.push(issue);
      rowIssueMap.set(recordId, current);
    };

    allRecords.forEach((record, index) => {
      const effectiveDate = toDateInputValue(record.effectiveDate) || '';
      const duplicateInfo = effectiveDate ? duplicateDateMap.get(effectiveDate) : undefined;
      if (duplicateInfo) {
        pushRowIssue(record.id, {
          key: 'duplicate-effective-date',
          label: '同日重复',
          detail: `${effectiveDate} 同时存在 ${duplicateInfo.count} 条社保台账，说明当天发生过重复分配或多次覆盖。`,
          severity: duplicateInfo.activeCount > 1 ? 'danger' : 'warning',
        });
      }

      if (String(record.status || '').toUpperCase() === 'ACTIVE' && activeRecords.length > 1) {
        pushRowIssue(record.id, {
          key: 'multiple-active',
          label: 'ACTIVE 重复',
          detail: `当前员工共有 ${activeRecords.length} 条 ACTIVE 台账，联调时需要确认到底哪一条才是当前真实口径。`,
          severity: 'danger',
        });
      }

      if (isFutureDate(record.effectiveDate)) {
        pushRowIssue(record.id, {
          key: 'future-effective',
          label: '未来生效',
          detail: `${effectiveDate} 才开始生效，这条记录会影响后续月份的社保口径，不代表今天已经执行。`,
          severity: 'warning',
        });
      }

      const scheme = insuranceSchemeMap.get(record.schemeId);
      if (scheme) {
        if (Number(scheme.status ?? 1) === 0) {
          disabledSchemeRecords.push(record);
          pushRowIssue(record.id, {
            key: 'disabled-scheme',
            label: '方案已禁用',
            detail: `${scheme.schemeName || '当前方案'} 已被禁用，这条台账只适合做历史核对，不应再作为新分配口径。`,
            severity: 'warning',
          });
        }

        const base = Number(record.base ?? 0);
        const min = Number(scheme.baseMin ?? 0);
        const max = Number(scheme.baseMax ?? 0);
        const outOfRange = (min > 0 && base < min) || (max > 0 && base > max);
        if (outOfRange) {
          outOfRangeRecords.push(record);
          pushRowIssue(record.id, {
            key: 'base-out-of-range',
            label: '基数超范围',
            detail: `当前基数 ${formatCurrency(base)} 超出方案区间 ${formatCurrency(min)} - ${formatCurrency(max)}。`,
            severity: 'danger',
          });
        }
      }

      const previousRecord = allRecords[index + 1];
      if (!previousRecord) return;

      const currentEffectiveDate = toDateInputValue(record.effectiveDate) || '';
      const previousEffectiveDate = toDateInputValue(previousRecord.effectiveDate) || '';
      if (currentEffectiveDate === previousEffectiveDate) return;

      const delta = Number((Number(record.base || 0) - Number(previousRecord.base || 0)).toFixed(2));
      if (Math.abs(delta) <= 0.005) return;

      baseShiftCandidates.push({
        current: record,
        previous: previousRecord,
        delta,
        absoluteDelta: Math.abs(delta),
      });
    });

    const latestBaseShift = baseShiftCandidates[0] || null;
    const activeReferenceRecord = activeRecords[0] || null;
    const detailMatchedActiveLedger = activeReferenceRecord
      ? isInsuranceDetailMatchedWithLedger(employeeInsuranceDetail, activeReferenceRecord)
      : !employeeInsuranceDetail;

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (!allRecords.length) {
      riskItems.push({
        key: 'empty-ledger',
        title: '当前员工还没有社保台账',
        detail: '这名员工还没有沉淀任何社保分配历史，社保测算和历史切换都无法做真实联调。',
        severity: 'danger',
      });
    } else {
      if (activeRecords.length === 0) {
        riskItems.push({
          key: 'missing-active-ledger',
          title: '当前没有 ACTIVE 台账',
          detail: '这名员工只有历史社保记录，当前月份的社保口径可能已经丢失或未重新分配。',
          severity: 'danger',
        });
      }

      if (activeRecords.length > 1) {
        riskItems.push({
          key: 'multiple-active-ledgers',
          title: 'ACTIVE 台账不止一条',
          detail: `当前共有 ${activeRecords.length} 条 ACTIVE 台账，最晚一条是 ${toDateInputValue(activeRecords[0]?.effectiveDate) || '-'} / ${activeRecords[0]?.schemeName || '-'}`,
          severity: 'danger',
        });
      }

      if (duplicateEffectiveDates.length > 0) {
        const [effectiveDate, duplicateInfo] = duplicateEffectiveDates[0];
        riskItems.push({
          key: 'duplicate-effective-dates',
          title: '存在重复生效日',
          detail: `${effectiveDate} 共有 ${duplicateInfo.count} 条台账，其中 ACTIVE ${duplicateInfo.activeCount} 条，建议回查当天的分配或覆盖链路。`,
          severity: duplicateInfo.activeCount > 1 ? 'danger' : 'warning',
        });
      }

      if (futureRecords.length > 0) {
        riskItems.push({
          key: 'future-ledgers',
          title: '存在未来生效台账',
          detail: `最新一条未来记录是 ${toDateInputValue(futureRecords[0]?.effectiveDate) || '-'} / ${futureRecords[0]?.schemeName || '-'}，核对本月数据时不要误把它当成当前口径。`,
          severity: 'warning',
        });
      }

      if (outOfRangeRecords.length > 0) {
        const first = outOfRangeRecords[0];
        riskItems.push({
          key: 'out-of-range-base',
          title: '存在基数超出方案区间的台账',
          detail: `${first.schemeName || '-'} 的台账 #${first.id} 基数为 ${formatCurrency(first.base)}，已经超出方案定义范围。`,
          severity: 'danger',
        });
      }

      if (disabledSchemeRecords.length > 0) {
        const first = disabledSchemeRecords[0];
        riskItems.push({
          key: 'disabled-scheme-ledger',
          title: '历史台账命中了禁用方案',
          detail: `${first.schemeName || '-'} 已被禁用，但台账 #${first.id} 仍引用这套方案，核对历史链路时要避免误判成当前可用方案。`,
          severity: 'warning',
        });
      }

      if (employeeInsuranceDetail && activeReferenceRecord && !detailMatchedActiveLedger) {
        riskItems.push({
          key: 'detail-ledger-mismatch',
          title: '详情口径和 ACTIVE 台账未完全对齐',
          detail: `当前详情是 ${toDateInputValue(employeeInsuranceDetail.effectiveDate) || '-'} / ${employeeInsuranceDetail.schemeName || '-'} / ${formatCurrency(employeeInsuranceDetail.base)}，但最新 ACTIVE 台账是 ${toDateInputValue(activeReferenceRecord.effectiveDate) || '-'} / ${activeReferenceRecord.schemeName || '-'} / ${formatCurrency(activeReferenceRecord.base)}。`,
          severity: 'warning',
        });
      }
    }

    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !score
      ? {
        label: '台账可直接联调',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '当前员工的社保台账链路比较清晰，可以直接核对当前口径和历史切换。',
      }
      : score <= 2
        ? {
          label: '台账需注意',
          className: 'border-amber-200 bg-amber-50 text-amber-700',
          hint: `发现 ${riskItems.length} 条需要人工确认的社保台账提示。`,
        }
        : {
          label: '台账存在风险',
          className: 'border-rose-200 bg-rose-50 text-rose-700',
          hint: `当前有 ${riskItems.length} 条高风险提示，建议先核对台账链路再继续联调测算。`,
        };

    return {
      allRecords,
      activeRecords,
      futureRecords,
      duplicateEffectiveDates,
      latestBaseShift,
      activeReferenceRecord,
      detailMatchedActiveLedger,
      riskItems,
      riskSummary,
      rowIssueMap,
    };
  }, [employeeInsuranceDetail, employeeInsuranceLedgerCatalogRecords, insuranceSchemeMap]);

  const selectedInsuranceScheme = useMemo(
    () => enabledInsuranceSchemes.find(item => item.id === insuranceForm.schemeId) || null,
    [enabledInsuranceSchemes, insuranceForm.schemeId],
  );

  const insuranceAssignPreview = useMemo(() => {
    if (!selectedInsuranceScheme || Number(insuranceForm.base || 0) <= 0) {
      return null;
    }

    const base = Number(insuranceForm.base || 0);
    const rows = [
      {
        key: 'pension',
        label: '养老保险',
        personalRate: Number(selectedInsuranceScheme.pensionPersonalRate ?? 0),
        companyRate: Number(selectedInsuranceScheme.pensionCompanyRate ?? 0),
      },
      {
        key: 'medical',
        label: '医疗保险',
        personalRate: Number(selectedInsuranceScheme.medicalPersonalRate ?? 0),
        companyRate: Number(selectedInsuranceScheme.medicalCompanyRate ?? 0),
      },
      {
        key: 'unemployment',
        label: '失业保险',
        personalRate: Number(selectedInsuranceScheme.unemploymentPersonalRate ?? 0),
        companyRate: Number(selectedInsuranceScheme.unemploymentCompanyRate ?? 0),
      },
      {
        key: 'injury',
        label: '工伤保险',
        personalRate: 0,
        companyRate: Number(selectedInsuranceScheme.injuryCompanyRate ?? 0),
      },
      {
        key: 'maternity',
        label: '生育保险',
        personalRate: 0,
        companyRate: Number(selectedInsuranceScheme.maternityCompanyRate ?? 0),
      },
      {
        key: 'housingFund',
        label: '住房公积金',
        personalRate: Number(selectedInsuranceScheme.housingFundPersonalRate ?? 0),
        companyRate: Number(selectedInsuranceScheme.housingFundCompanyRate ?? 0),
      },
    ].map(item => {
      const personalAmount = normalizeAmount(base * item.personalRate / 100);
      const companyAmount = normalizeAmount(base * item.companyRate / 100);
      return {
        ...item,
        personalAmount,
        companyAmount,
        totalAmount: normalizeAmount(personalAmount + companyAmount),
      };
    });

    const personalTotal = normalizeAmount(rows.reduce((sum, item) => sum + item.personalAmount, 0));
    const companyTotal = normalizeAmount(rows.reduce((sum, item) => sum + item.companyAmount, 0));

    return {
      rows,
      personalTotal,
      companyTotal,
      totalAmount: normalizeAmount(personalTotal + companyTotal),
    };
  }, [insuranceForm.base, selectedInsuranceScheme]);

  const insuranceAssignDiagnostics = useMemo(() => {
    const currentActiveLedger = employeeInsuranceLedgerDiagnostics.activeReferenceRecord;
    const selectedEffectiveDate = insuranceForm.effectiveDate || '';
    const schemeEffectiveDate = toDateInputValue(selectedInsuranceScheme?.effectiveDate) || '';
    const sameDateRecords = selectedEffectiveDate
      ? employeeInsuranceLedgerDiagnostics.allRecords.filter(item => (toDateInputValue(item.effectiveDate) || '') === selectedEffectiveDate)
      : [];
    const sameAsCurrentActive = Boolean(
      currentActiveLedger
      && Number(currentActiveLedger.schemeId) === Number(insuranceForm.schemeId)
      && normalizeAmount(currentActiveLedger.base) === normalizeAmount(insuranceForm.base)
      && (toDateInputValue(currentActiveLedger.effectiveDate) || '') === selectedEffectiveDate,
    );
    const replaceCurrentSameDay = Boolean(
      currentActiveLedger
      && selectedEffectiveDate
      && (toDateInputValue(currentActiveLedger.effectiveDate) || '') === selectedEffectiveDate
      && !sameAsCurrentActive,
    );
    const backfillHistory = Boolean(
      currentActiveLedger
      && selectedEffectiveDate
      && (toDateInputValue(currentActiveLedger.effectiveDate) || '') > selectedEffectiveDate,
    );
    const schemeStartsLater = Boolean(schemeEffectiveDate && selectedEffectiveDate && schemeEffectiveDate > selectedEffectiveDate);
    const baseMin = Number(selectedInsuranceScheme?.baseMin ?? 0);
    const baseMax = Number(selectedInsuranceScheme?.baseMax ?? 0);
    const baseOutOfRange = Boolean(
      selectedInsuranceScheme
      && ((baseMin > 0 && Number(insuranceForm.base || 0) < baseMin) || (baseMax > 0 && Number(insuranceForm.base || 0) > baseMax)),
    );

    let modeLabel = '等待选择方案';
    let modeHint = '选择方案、基数和生效日期后，这里会显示本次分配会如何影响当前社保链路。';

    if (selectedInsuranceScheme && selectedEffectiveDate) {
      if (!currentActiveLedger) {
        modeLabel = '创建首条社保台账';
        modeHint = '当前员工还没有 ACTIVE 台账，保存后会直接生成当前可用的社保口径。';
      } else if (sameAsCurrentActive) {
        modeLabel = '重复提交当前口径';
        modeHint = '方案、基数和生效日都与当前 ACTIVE 完全一致，继续保存大概率只会制造重复台账。';
      } else if (replaceCurrentSameDay) {
        modeLabel = '同日覆盖当前 ACTIVE';
        modeHint = `当前 ACTIVE 也是 ${selectedEffectiveDate} 生效，本次分配最容易把当天链路叠成多条记录。`;
      } else if (backfillHistory) {
        modeLabel = '回补历史台账';
        modeHint = `当前 ACTIVE 生效于 ${toDateInputValue(currentActiveLedger.effectiveDate) || '-'}，这次会回补更早的历史日期 ${selectedEffectiveDate}。`;
      } else {
        modeLabel = '切换当前社保口径';
        modeHint = `当前 ACTIVE 是 ${toDateInputValue(currentActiveLedger.effectiveDate) || '-'} / ${currentActiveLedger.schemeName || '-'}，保存后会切换成新的当前口径。`;
      }
    }

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
      if (selectedInsuranceScheme) {
      if (schemeStartsLater) {
        riskItems.push({
          key: 'scheme-effective-date',
          title: '分配日期早于方案生效日',
          detail: `${schemeEffectiveDate || '-'} > ${selectedEffectiveDate || '-'}`,
          severity: 'danger',
        });
      }

      if (baseOutOfRange) {
        riskItems.push({
          key: 'base-out-of-range',
          title: '缴纳基数超出方案范围',
          detail: `${formatCurrency(insuranceForm.base)} / ${formatCurrency(baseMin)} - ${formatCurrency(baseMax)}`,
          severity: 'danger',
        });
      }

      if (sameDateRecords.length > 0) {
        const activeCount = sameDateRecords.filter(item => String(item.status || '').toUpperCase() === 'ACTIVE').length;
        riskItems.push({
          key: 'same-date-records',
          title: '目标日期已存在社保台账',
          detail: `${selectedEffectiveDate} ${sameDateRecords.length} 条 / ACTIVE ${activeCount}`,
          severity: activeCount > 0 ? 'danger' : 'warning',
        });
      }

      if (sameAsCurrentActive) {
        riskItems.push({
          key: 'same-as-current',
          title: '本次分配与当前 ACTIVE 完全一致',
          detail: '与当前 ACTIVE 一致',
          severity: 'warning',
        });
      }

      if (backfillHistory) {
        riskItems.push({
          key: 'backfill-history',
          title: '本次是在回补历史台账',
          detail: '回补历史日期',
          severity: 'warning',
        });
      }

      if (!currentActiveLedger) {
        riskItems.push({
          key: 'first-active-ledger',
          title: '当前员工还没有 ACTIVE 台账',
          detail: '将创建首条 ACTIVE 台账',
          severity: 'warning',
        });
      }
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !selectedInsuranceScheme
      ? {
        label: '等待选择',
        className: 'border-slate-200 bg-slate-50 text-slate-600',
        hint: '-',
      }
      : !score
        ? {
          label: '可直接分配',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          hint: '已对齐',
        }
      : score <= 2
        ? {
          label: '分配需注意',
          className: 'border-amber-200 bg-amber-50 text-amber-700',
          hint: `${riskItems.length} 项`,
        }
        : {
          label: '分配存在风险',
          className: 'border-rose-200 bg-rose-50 text-rose-700',
          hint: `${riskItems.length} 项`,
        };

    return {
      currentActiveLedger,
      sameDateRecords,
      modeLabel,
      modeHint,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [
    employeeInsuranceLedgerDiagnostics.activeReferenceRecord,
    employeeInsuranceLedgerDiagnostics.allRecords,
    insuranceForm.base,
    insuranceForm.effectiveDate,
    insuranceForm.schemeId,
    selectedInsuranceScheme,
  ]);

  const _taxReferencePeriodUnused = useMemo(() => {
    const { year, month } = getYearMonthFromDate(
      employeeSalaryDetail?.effectiveDate || currentEmployeeRecord?.effectiveDate,
    );

    return `${year}年${month}月`;
  }, [currentEmployeeRecord?.effectiveDate, employeeSalaryDetail?.effectiveDate]);

  const taxReferenceMonthKey = useMemo(() => {
    const { year, month } = getYearMonthFromDate(
      employeeSalaryDetail?.effectiveDate || currentEmployeeRecord?.effectiveDate,
    );

    return `${year}-${String(month).padStart(2, '0')}`;
  }, [currentEmployeeRecord?.effectiveDate, employeeSalaryDetail?.effectiveDate]);

  const insuranceReferenceEffectiveDate = useMemo(
    () => toDateInputValue(employeeInsuranceDetail?.effectiveDate || latestEmployeeInsuranceLedger?.effectiveDate) || '',
    [employeeInsuranceDetail?.effectiveDate, latestEmployeeInsuranceLedger?.effectiveDate],
  );

  const insuranceReferenceBase = useMemo(
    () => Number(employeeInsuranceDetail?.base ?? latestEmployeeInsuranceLedger?.base ?? 0),
    [employeeInsuranceDetail?.base, latestEmployeeInsuranceLedger?.base],
  );

  const insuranceCalculatedBase = useMemo(
    () => Number(employeeInsuranceCalculation?.base ?? 0),
    [employeeInsuranceCalculation?.base],
  );

  const insuranceReferenceMismatch = useMemo(
    () => Boolean(currentEmployeeEffectiveDate && insuranceReferenceEffectiveDate)
      && currentEmployeeEffectiveDate !== insuranceReferenceEffectiveDate,
    [currentEmployeeEffectiveDate, insuranceReferenceEffectiveDate],
  );

  // 真实联调里，社保台账基数不会随着调薪自动改写，页面需要把“台账口径”和“测算口径”区分开。
  const insuranceBaseMismatch = useMemo(
    () => Boolean(employeeInsuranceCalculation?.base != null)
      && (employeeInsuranceDetail?.base != null || latestEmployeeInsuranceLedger?.base != null)
      && normalizeAmount(employeeInsuranceCalculation?.base) !== normalizeAmount(employeeInsuranceDetail?.base ?? latestEmployeeInsuranceLedger?.base),
    [
      employeeInsuranceCalculation?.base,
      employeeInsuranceDetail?.base,
      latestEmployeeInsuranceLedger?.base,
    ],
  );

  const currentEmployeeEffectiveHint = useMemo(() => {
    if (!currentEmployeeEffectiveDate) return '当前没有可用的生效日期';
    if (currentEmployeeEffectiveOffsetDays == null) return `生效 ${currentEmployeeEffectiveDate}`;
    if (currentEmployeeEffectiveOffsetDays > 0) {
      return `生效 ${currentEmployeeEffectiveDate}，距今天还有 ${currentEmployeeEffectiveOffsetDays} 天`;
    }
    if (currentEmployeeEffectiveOffsetDays < 0) {
      return `生效 ${currentEmployeeEffectiveDate}，已生效 ${Math.abs(currentEmployeeEffectiveOffsetDays)} 天`;
    }
    return `生效 ${currentEmployeeEffectiveDate}，今天开始生效`;
  }, [currentEmployeeEffectiveDate, currentEmployeeEffectiveOffsetDays]);

  // 将真实联调时最容易偏差的口径提炼成提示，避免只看结果数值误判。
  const sortedEmployeeTaxDeductions = useMemo(
    () => [...employeeTaxDeductions].sort((left, right) => {
      const rightTime = new Date(right.startDate || right.createTime || 0).getTime();
      const leftTime = new Date(left.startDate || left.createTime || 0).getTime();
      return rightTime - leftTime || right.id - left.id;
    }),
    [employeeTaxDeductions],
  );

  const compensationRiskItems = useMemo(() => {
    const items: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];

    if (currentEmployeeFutureEffective) {
      items.push({
        key: 'future-effective',
        title: '当前测算基于未来生效薪资',
        detail: `参考档案生效日是 ${currentEmployeeEffectiveDate || '-'}，当前页面展示的是未来薪资口径，不代表今天已经实际发放。`,
        severity: 'warning',
      });
    }

    if (!hasInsuranceProfile) {
      items.push({
        key: 'insurance-missing',
        title: '社保公积金仍按 0 估算',
        detail: '当前没有命中员工社保方案，个人社保、公司承担和用工总成本都会偏低或偏高，需要先补分配再核对。',
        severity: 'danger',
      });
    } else if (insuranceReferenceMismatch) {
      items.push({
        key: 'insurance-date-mismatch',
        title: '社保口径和薪资生效日期不一致',
        detail: `当前薪资生效日是 ${currentEmployeeEffectiveDate || '-'}，社保方案口径生效日是 ${insuranceReferenceEffectiveDate || '-'}，核对时要注意不是同一批次。`,
        severity: 'warning',
      });
    }

    if (hasInsuranceProfile && insuranceBaseMismatch) {
      items.push({
        key: 'insurance-base-mismatch',
        title: '社保测算基数与当前台账基数不一致',
        detail: `当前社保台账基数是 ${formatCurrency(insuranceReferenceBase)}，按现薪测算的基数是 ${formatCurrency(insuranceCalculatedBase)}。五险一金拆分展示的是实时测算结果，不代表社保台账已经同步切换。`,
        severity: 'warning',
      });
    }

    if (!sortedEmployeeTaxDeductions.length) {
      items.push({
        key: 'deduction-empty',
        title: '当前月份没有命中专项扣除',
        detail: `按 ${taxReferencePeriod} 口径没有命中 ACTIVE 专项扣除，本月个税会按 0 扣除项估算。`,
        severity: hasInsuranceProfile ? 'warning' : 'danger',
      });
    }

    if (!currentTaxConfig) {
      items.push({
        key: 'tax-config-missing',
        title: '页面没有加载到个税配置',
        detail: '当前缺少前端可见的个税配置摘要，虽然接口可能返回测算值，但页面无法直接核对配置来源。',
        severity: 'danger',
      });
    }

    return items;
  }, [
    currentEmployeeEffectiveDate,
    currentEmployeeFutureEffective,
    currentTaxConfig,
    hasInsuranceProfile,
    insuranceCalculatedBase,
    insuranceBaseMismatch,
    insuranceReferenceBase,
    insuranceReferenceEffectiveDate,
    insuranceReferenceMismatch,
    sortedEmployeeTaxDeductions.length,
    taxReferencePeriod,
  ]);

  const compensationRiskSummary = useMemo(() => {
    const score = compensationRiskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    if (!score) {
      return {
        label: '可直接联调',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '当前薪资、社保和专项扣除口径基本对齐，可以直接核对测算结果。',
      };
    }

    if (score <= 2) {
      return {
        label: '需注意',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        hint: `发现 ${compensationRiskItems.length} 条需要人工确认的口径差异。`,
      };
    }

    return {
      label: '信息不足',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      hint: `当前有 ${compensationRiskItems.length} 条高风险提示，建议先补齐口径再继续联调。`,
    };
  }, [compensationRiskItems]);

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

  const currentTaxConfigReferenceMap = useMemo(
    () => {
      const itemValues = parseTaxDeductionItemValues(currentTaxConfig?.deductionItems);
      return deductionTypeOptions.reduce((result, item) => {
        result.set(item.value, Number(itemValues[item.value] || 0));
        return result;
      }, new Map<string, number>());
    },
    [currentTaxConfig?.deductionItems],
  );

  const sortedEmployeeAllTaxDeductions = useMemo(
    () => [...employeeAllTaxDeductions].sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === 'ACTIVE' ? -1 : 1;
      }

      const rightTime = new Date(right.startDate || right.createTime || 0).getTime();
      const leftTime = new Date(left.startDate || left.createTime || 0).getTime();
      return rightTime - leftTime || right.id - left.id;
    }),
    [employeeAllTaxDeductions],
  );

  const activeTaxDeductionIds = useMemo(
    () => new Set(employeeTaxDeductions.map(item => item.id)),
    [employeeTaxDeductions],
  );

  const employeeTaxDeductionDiagnostics = useMemo(() => {
    const rowIssueMap = new Map<number, Array<{
      key: string;
      label: string;
      detail: string;
      severity: 'warning' | 'danger';
    }>>();
    const summaryMap = new Map<string, {
      type: string;
      label: string;
      referenceAmount: number;
      totalCount: number;
      activeCount: number;
      inScopeCount: number;
      inScopeAmount: number;
      activeOutOfScopeCount: number;
      records: EmployeeTaxDeduction[];
      activeRecords: EmployeeTaxDeduction[];
      inScopeRecords: EmployeeTaxDeduction[];
      latestRecord: EmployeeTaxDeduction | null;
      latestInScopeRecord: EmployeeTaxDeduction | null;
      hasOverlap: boolean;
      hasDuplicateInScope: boolean;
    }>();
    const overlapTypes: Array<{ type: string; label: string; recordIds: number[] }> = [];
    const duplicateInScopeTypes: Array<{ type: string; label: string; count: number }> = [];
    const activeOutOfScopeTypes: Array<{ type: string; label: string; count: number }> = [];

    const pushRowIssue = (
      recordId: number,
      issue: {
        key: string;
        label: string;
        detail: string;
        severity: 'warning' | 'danger';
      },
    ) => {
      const current = rowIssueMap.get(recordId) || [];
      if (!current.some(item => item.key === issue.key)) {
        current.push(issue);
        rowIssueMap.set(recordId, current);
      }
    };

    deductionTypeOptions.forEach(item => {
      summaryMap.set(item.value, {
        type: item.value,
        label: item.label,
        referenceAmount: Number(currentTaxConfigReferenceMap.get(item.value) || 0),
        totalCount: 0,
        activeCount: 0,
        inScopeCount: 0,
        inScopeAmount: 0,
        activeOutOfScopeCount: 0,
        records: [],
        activeRecords: [],
        inScopeRecords: [],
        latestRecord: null,
        latestInScopeRecord: null,
        hasOverlap: false,
        hasDuplicateInScope: false,
      });
    });

    sortedEmployeeAllTaxDeductions.forEach(item => {
      const current = summaryMap.get(item.deductionType) || {
        type: item.deductionType,
        label: deductionTypeLabel(item.deductionType),
        referenceAmount: Number(currentTaxConfigReferenceMap.get(item.deductionType) || 0),
        totalCount: 0,
        activeCount: 0,
        inScopeCount: 0,
        inScopeAmount: 0,
        activeOutOfScopeCount: 0,
        records: [],
        activeRecords: [],
        inScopeRecords: [],
        latestRecord: null as EmployeeTaxDeduction | null,
        latestInScopeRecord: null as EmployeeTaxDeduction | null,
        hasOverlap: false,
        hasDuplicateInScope: false,
      };

      current.totalCount += 1;
      current.records.push(item);
      if (!current.latestRecord) {
        current.latestRecord = item;
      }

      const isActive = String(item.status || '').toUpperCase() === 'ACTIVE';
      const inScope = activeTaxDeductionIds.has(item.id);
      if (isActive) {
        current.activeCount += 1;
        current.activeRecords.push(item);
        if (!inScope) {
          current.activeOutOfScopeCount += 1;
        }
      }
      if (inScope) {
        current.inScopeCount += 1;
        current.inScopeAmount += Number(item.amount || 0);
        current.inScopeRecords.push(item);
        if (!current.latestInScopeRecord) {
          current.latestInScopeRecord = item;
        }
      }

      summaryMap.set(item.deductionType, current);
    });

    summaryMap.forEach(summary => {
      if (summary.inScopeCount > 1) {
        summary.hasDuplicateInScope = true;
        duplicateInScopeTypes.push({
          type: summary.type,
          label: summary.label,
          count: summary.inScopeCount,
        });
        summary.inScopeRecords.forEach(record => {
          pushRowIssue(record.id, {
            key: `duplicate-in-scope-${summary.type}`,
            label: '本月重复命中',
            detail: `${summary.label} 当前月份命中了 ${summary.inScopeCount} 条 ACTIVE 记录，个税口径需要人工确认。`,
            severity: 'danger',
          });
        });
      }

      if (summary.activeOutOfScopeCount > 0) {
        activeOutOfScopeTypes.push({
          type: summary.type,
          label: summary.label,
          count: summary.activeOutOfScopeCount,
        });
        summary.activeRecords
          .filter(record => !activeTaxDeductionIds.has(record.id))
          .forEach(record => {
            pushRowIssue(record.id, {
              key: `active-out-of-scope-${record.id}`,
              label: 'ACTIVE 但未参与本月',
              detail: `${summary.label} 记录仍是 ACTIVE 状态，但当前 ${taxReferencePeriod} 没有命中。`,
              severity: 'warning',
            });
          });
      }

      const sortedActiveRecords = [...summary.activeRecords].sort((left, right) => {
        const leftStart = getNormalizedDateValue(left.startDate);
        const rightStart = getNormalizedDateValue(right.startDate);
        return leftStart.localeCompare(rightStart, 'zh-CN') || left.id - right.id;
      });

      for (let index = 1; index < sortedActiveRecords.length; index += 1) {
        const previous = sortedActiveRecords[index - 1];
        const current = sortedActiveRecords[index];
        if (!isDeductionRangeOverlapping(previous.startDate, previous.endDate, current.startDate, current.endDate)) {
          continue;
        }

        summary.hasOverlap = true;
        overlapTypes.push({
          type: summary.type,
          label: summary.label,
          recordIds: [previous.id, current.id],
        });

        const previousLabel = `${toDateInputValue(previous.startDate) || '-'} ~ ${toDateInputValue(previous.endDate) || '长期有效'}`;
        const currentLabel = `${toDateInputValue(current.startDate) || '-'} ~ ${toDateInputValue(current.endDate) || '长期有效'}`;

        pushRowIssue(previous.id, {
          key: `overlap-next-${current.id}`,
          label: '生效区间重叠',
          detail: `与同类型记录 ${currentLabel} 区间重叠。`,
          severity: 'danger',
        });
        pushRowIssue(current.id, {
          key: `overlap-prev-${previous.id}`,
          label: '生效区间重叠',
          detail: `与同类型记录 ${previousLabel} 区间重叠。`,
          severity: 'danger',
        });
      }
    });

    const referenceEntries = Array.from(summaryMap.values())
      .filter(item => item.referenceAmount > 0 || item.totalCount > 0)
      .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));

    const missingReferenceEntries = referenceEntries.filter(item => item.referenceAmount > 0 && item.inScopeCount === 0);

    return {
      rowIssueMap,
      referenceEntries,
      missingReferenceEntries,
      overlapTypes,
      duplicateInScopeTypes,
      activeOutOfScopeTypes,
    };
  }, [
    activeTaxDeductionIds,
    currentTaxConfigReferenceMap,
    sortedEmployeeAllTaxDeductions,
    taxReferencePeriod,
  ]);

  const taxDeductionRiskItems = useMemo(() => {
    const items: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];

    if (employeeTaxDeductionDiagnostics.duplicateInScopeTypes.length > 0) {
      const first = employeeTaxDeductionDiagnostics.duplicateInScopeTypes[0];
      items.push({
        key: 'duplicate-in-scope',
        title: '同类专项扣除在本月重复命中',
        detail: `${first.label} 当前月份命中了 ${first.count} 条 ACTIVE 记录，同一税月可能被重复计入。`,
        severity: 'danger',
      });
    }

    if (employeeTaxDeductionDiagnostics.overlapTypes.length > 0) {
      const first = employeeTaxDeductionDiagnostics.overlapTypes[0];
      items.push({
        key: 'overlap-ranges',
        title: '存在同类扣除区间重叠',
        detail: `${first.label} 至少有 ${first.recordIds.length} 条 ACTIVE 记录生效区间重叠，建议先整理历史记录。`,
        severity: 'danger',
      });
    }

    if (employeeTaxDeductionDiagnostics.activeOutOfScopeTypes.length > 0) {
      items.push({
        key: 'active-out-of-scope',
        title: 'ACTIVE 记录未命中当前税月',
        detail: `${employeeTaxDeductionDiagnostics.activeOutOfScopeTypes.map(item => `${item.label} ${item.count} 条`).join('、')}，当前 ${taxReferencePeriod} 的个税测算不会读取这些记录。`,
        severity: 'warning',
      });
    }

    if (employeeTaxDeductionDiagnostics.missingReferenceEntries.length > 0) {
      items.push({
        key: 'missing-reference',
        title: '当前员工还没有命中参考扣除项',
        detail: `按当前全局配置，${employeeTaxDeductionDiagnostics.missingReferenceEntries.map(item => `${item.label} ${formatCurrency(item.referenceAmount)}`).join('、')} 都可作为参考模板，但本月尚未命中。`,
        severity: sortedEmployeeTaxDeductions.length === 0 ? 'danger' : 'warning',
      });
    }

    return items;
  }, [employeeTaxDeductionDiagnostics, sortedEmployeeTaxDeductions.length, taxReferencePeriod]);

  const taxDeductionRiskSummary = useMemo(() => {
    const score = taxDeductionRiskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    if (!score) {
      return {
        label: '扣除链路可直接联调',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '当前专项扣除记录、当前税月命中和个税配置参考值都比较清晰，可以直接核对个税结果。',
      };
    }

    if (score <= 2) {
      return {
        label: '扣除链路需注意',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        hint: `发现 ${taxDeductionRiskItems.length} 条需要人工确认的专项扣除联调提示。`,
      };
    }

    return {
      label: '扣除信息不足',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      hint: `当前有 ${taxDeductionRiskItems.length} 条高风险提示，建议先补齐专项扣除记录再继续联调。`,
    };
  }, [taxDeductionRiskItems]);

  const buildTaxDeductionDeleteDiagnostics = (item: EmployeeTaxDeduction) => {
    const label = item.deductionTypeName || deductionTypeLabel(item.deductionType);
    const normalizedStatus = String(item.status || 'ACTIVE').toUpperCase();
    const inScope = activeTaxDeductionIds.has(item.id);
    const amount = normalizeAmount(item.amount);
    const referenceAmount = Number(currentTaxConfigReferenceMap.get(item.deductionType) || 0);
    const sameTypeHistoryRecords = sortedEmployeeAllTaxDeductions.filter(record =>
      record.deductionType === item.deductionType && record.id !== item.id,
    );
    const sameTypeActiveRecords = sameTypeHistoryRecords.filter(
      record => String(record.status || '').toUpperCase() === 'ACTIVE',
    );
    const sameTypeInScopeRecords = sortedEmployeeTaxDeductions.filter(
      record => record.deductionType === item.deductionType && record.id !== item.id,
    );
    const nextCurrentDeductionTotal = normalizeAmount(
      inScope ? Math.max(currentTaxDeductionTotal - amount, 0) : currentTaxDeductionTotal,
    );
    const nextSameTypeInScopeAmount = normalizeAmount(
      sameTypeInScopeRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0),
    );
    const rowIssues = employeeTaxDeductionDiagnostics.rowIssueMap.get(item.id) || [];
    const startMonth = getYearMonthValue(item.startDate);
    const endMonth = getYearMonthValue(item.endDate);
    const rangeLabel = endMonth
      ? `${startMonth || '-'} 至 ${endMonth}`
      : `${startMonth || '-'} 起长期有效`;
    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];

    if (inScope) {
      riskItems.push({
        key: 'current-scope-impact',
        title: '删除后会直接改动本月个税口径',
        detail: `${label} 当前参与 ${taxReferencePeriod} 个税测算，删除后专项扣除合计会从 ${formatCurrency(currentTaxDeductionTotal)} 变成 ${formatCurrency(nextCurrentDeductionTotal)}${currentTaxAmount > 0 ? `，当前税额样本 ${formatCurrency(currentTaxAmount)} 也需要重新核对` : ''}。`,
        severity: 'danger',
      });

      if (sameTypeInScopeRecords.length === 0) {
        riskItems.push({
          key: 'clear-current-type',
          title: referenceAmount > 0 ? '删除后该类型会低于参考标准' : '删除后该类型本月将不再命中',
          detail: referenceAmount > 0
            ? `${label} 当前这条是 ${taxReferencePeriod} 唯一命中的记录，删除后会从 ${formatCurrency(amount)} 直接回到 0，和参考值 ${formatCurrency(referenceAmount)} 拉开差距。`
            : `${label} 当前这条是 ${taxReferencePeriod} 唯一命中的记录，删除后本月这类专项扣除会直接归零。`,
          severity: referenceAmount > 0 ? 'danger' : 'warning',
        });
      } else {
        riskItems.push({
          key: 'same-type-still-in-scope',
          title: '删除后本月仍有同类记录保留',
          detail: `${label} 删除后，${taxReferencePeriod} 仍有 ${sameTypeInScopeRecords.length} 条同类记录，共 ${formatCurrency(nextSameTypeInScopeAmount)}，需要确认保留的是正确版本。`,
          severity: 'warning',
        });
      }
    } else if (normalizedStatus === 'ACTIVE') {
      riskItems.push({
        key: startMonth && startMonth > taxReferenceMonthKey ? 'future-active-record' : 'active-history-record',
        title: startMonth && startMonth > taxReferenceMonthKey ? '删除的是未来月份专项扣除' : '删除的是未命中当前税月的 ACTIVE 样本',
        detail: startMonth && startMonth > taxReferenceMonthKey
          ? `这条 ${label} 会在 ${startMonth} 开始生效，删除后后续税月会少一条预埋样本。`
          : `${label} 当前不参与 ${taxReferencePeriod}，但状态仍是 ACTIVE，生效区间为 ${rangeLabel}。删除后历史或跨月联调样本会减少一条。`,
        severity: 'warning',
      });
    } else if (!sameTypeHistoryRecords.length) {
      riskItems.push({
        key: 'clear-type-history',
        title: '删除后该类型将不再保留历史记录',
        detail: `${label} 当前只剩这一条记录，删除后这个员工的 ${label} 历史样本会被清空。`,
        severity: 'warning',
      });
    }

    if (rowIssues.length > 0) {
      const issueLabels = rowIssues.slice(0, 2).map(issue => issue.label).join('、');
      riskItems.push({
        key: 'row-issues',
        title: rowIssues.some(issue => issue.severity === 'danger') ? '当前记录本身就带有联调异常' : '当前记录已有待确认提示',
        detail: `${issueLabels}。如果这次删除是为了清理异常样本，删除前先确认是否已经保留正确记录。`,
        severity: 'warning',
      });
    }

    const blockingRiskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    const score = riskItems.reduce((total, current) => total + (current.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = !score
      ? {
        label: '删除口径已对齐',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        hint: '当前删除不会打断专项扣除联调，可直接回放真实删除接口。',
      }
      : score <= 2
        ? {
          label: '删除需确认',
          className: 'border-amber-200 bg-amber-50 text-amber-700',
          hint: `发现 ${riskItems.length} 条删除前提示，确认当前税月影响后再继续。`,
        }
        : {
          label: '删除影响较大',
          className: 'border-rose-200 bg-rose-50 text-rose-700',
          hint: `当前有 ${riskItems.length} 条删除前提示，建议先核对本月税额链路再删除。`,
        };

    return {
      inScope,
      referenceAmount,
      sameTypeHistoryRecords,
      sameTypeActiveRecords,
      sameTypeInScopeRecords,
      nextCurrentDeductionTotal,
      nextSameTypeInScopeAmount,
      rowIssues,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  };

  const taxDeductionDeleteDiagnosticsMap = useMemo(
    () => new Map(sortedEmployeeAllTaxDeductions.map(item => [item.id, buildTaxDeductionDeleteDiagnostics(item)])),
    [
      activeTaxDeductionIds,
      currentTaxAmount,
      currentTaxConfigReferenceMap,
      currentTaxDeductionTotal,
      employeeTaxDeductionDiagnostics,
      sortedEmployeeAllTaxDeductions,
      sortedEmployeeTaxDeductions,
      taxReferenceMonthKey,
      taxReferencePeriod,
    ],
  );

  const taxDeductionFormExistingRecord = useMemo(
    () => (editingTaxDeductionId
      ? employeeAllTaxDeductions.find(item => item.id === editingTaxDeductionId) || null
      : null),
    [editingTaxDeductionId, employeeAllTaxDeductions],
  );

  // 专项扣除表单要在保存前预览“本月是否命中”和“会不会撞上历史记录”，否则个税联调很难定位差异来源。
  const taxDeductionFormDiagnostics = useMemo(() => {
    const deductionType = taxDeductionForm.deductionType;
    const label = deductionTypeLabel(deductionType);
    const amount = normalizeAmount(taxDeductionForm.amount);
    const trimmedRemark = taxDeductionForm.remark.trim();
    const startDate = taxDeductionForm.startDate;
    const endDate = taxDeductionForm.endDate;
    const startMonth = getYearMonthValue(startDate);
    const endMonth = getYearMonthValue(endDate);
    const normalizedStatus = String(taxDeductionForm.status || 'ACTIVE').toUpperCase();
    const proposedActive = normalizedStatus === 'ACTIVE';
    const proposedInScope = proposedActive && isTaxDeductionInReferencePeriod(startDate, endDate, taxReferenceMonthKey);
    const existingRecord = taxDeductionFormExistingRecord;
    const referenceAmount = Number(currentTaxConfigReferenceMap.get(deductionType) || 0);
    const sameTypeHistoryRecords = deductionType
      ? employeeAllTaxDeductions.filter(item => item.deductionType === deductionType)
      : [];
    const comparableSameTypeRecords = sameTypeHistoryRecords.filter(item => item.id !== editingTaxDeductionId);
    const sameTypeActiveRecords = comparableSameTypeRecords.filter(item => String(item.status || '').toUpperCase() === 'ACTIVE');
    const sameTypeInScopeRecords = employeeTaxDeductions.filter(
      item => item.deductionType === deductionType && item.id !== editingTaxDeductionId,
    );
    const predictedInScopeCount = sameTypeInScopeRecords.length + (proposedInScope ? 1 : 0);
    const predictedInScopeAmount = normalizeAmount(
      sameTypeInScopeRecords.reduce((sum, item) => sum + Number(item.amount || 0), 0) + (proposedInScope ? amount : 0),
    );
    const overlappingActiveRecords = deductionType && proposedActive && startDate
      ? sameTypeActiveRecords.filter(item => isDeductionRangeOverlapping(item.startDate, item.endDate, startDate, endDate || null))
      : [];
    const referenceDelta = referenceAmount > 0 ? normalizeAmount(amount - referenceAmount) : 0;
    const referenceDeltaRatio = referenceAmount > 0
      ? Number((Math.abs(referenceDelta) / referenceAmount).toFixed(3))
      : 0;
    const hasLargeReferenceDeviation = referenceAmount > 0
      && Math.abs(referenceDelta) >= Math.max(200, referenceAmount * 0.3);
    const hasExtremeReferenceDeviation = referenceAmount > 0
      && Math.abs(referenceDelta) >= Math.max(500, referenceAmount * 0.5);
    const basicInfoMissing = !deductionType || !startDate || amount <= 0;
    const noChanges = Boolean(existingRecord)
      && existingRecord.deductionType === deductionType
      && normalizeAmount(existingRecord.amount) === amount
      && (toDateInputValue(existingRecord.startDate) || '') === startDate
      && (toDateInputValue(existingRecord.endDate) || '') === endDate
      && String(existingRecord.status || 'ACTIVE').toUpperCase() === normalizedStatus
      && String(existingRecord.remark || '').trim() === trimmedRemark;
    const duplicateNewCurrentRecord = !editingTaxDeductionId && proposedInScope && sameTypeInScopeRecords.length > 0;
    const duplicateCurrentPeriod = !duplicateNewCurrentRecord && proposedInScope && predictedInScopeCount > 1;
    const activeButOutOfScope = proposedActive && Boolean(deductionType && startDate) && !proposedInScope;
    const needsRemark = !trimmedRemark && (
      overlappingActiveRecords.length > 0
      || duplicateNewCurrentRecord
      || duplicateCurrentPeriod
      || hasLargeReferenceDeviation
    );
    const isExistingRecordInScope = Boolean(existingRecord && activeTaxDeductionIds.has(existingRecord.id));

    let modeLabel = '新增专项扣除';
    let modeHint = `保存后会写入 ${label} 历史，并刷新 ${taxReferencePeriod} 的个税测算结果。`;
    if (!deductionType) {
      modeLabel = '等待选择扣除类型';
      modeHint = '先选定扣除类型，再判断这次保存是补录历史、命中本月，还是会撞上已有记录。';
    } else if (noChanges) {
      modeLabel = '无变化重复保存';
      modeHint = '当前金额、区间、状态和备注都没有变化，继续保存通常没有业务意义。';
    } else if (!editingTaxDeductionId && proposedInScope && sameTypeInScopeRecords.length === 0) {
      modeLabel = '新增本月生效扣除';
      modeHint = `保存后 ${label} 会立即参与 ${taxReferencePeriod} 的个税测算。`;
    } else if (!editingTaxDeductionId && activeButOutOfScope && startMonth > taxReferenceMonthKey) {
      modeLabel = '预埋未来月份扣除';
      modeHint = `这条记录会保留为 ACTIVE，但要到 ${startMonth} 才会参与个税测算。`;
    } else if (!editingTaxDeductionId && activeButOutOfScope && endMonth && endMonth < taxReferenceMonthKey) {
      modeLabel = '补录历史月份扣除';
      modeHint = `这条记录只影响 ${endMonth} 及之前月份，当前 ${taxReferencePeriod} 个税不会读取。`;
    } else if (editingTaxDeductionId && !proposedActive) {
      modeLabel = '关闭当前扣除';
      modeHint = '保存后这条记录会退出 ACTIVE 状态，不会再被当前税月测算读取。';
    } else if (editingTaxDeductionId && isExistingRecordInScope && !proposedInScope) {
      modeLabel = '把当前命中移出税月';
      modeHint = `保存后这条记录不会再参与 ${taxReferencePeriod} 个税，需要重点复核税额变化。`;
    } else if (editingTaxDeductionId) {
      modeLabel = '覆盖已有专项扣除';
      modeHint = `保存后会直接更新 ${label} 的金额或区间，并同步刷新右侧个税结果。`;
    }

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (!deductionType) {
      riskItems.push({
        key: 'missing-type',
        title: '还没有选择扣除类型',
        detail: '未选扣除类型',
        severity: 'warning',
      });
    }
    if (!startDate) {
      riskItems.push({
        key: 'missing-start-date',
        title: '还没有填写开始日期',
        detail: '未填开始日期',
        severity: 'danger',
      });
    }
    if (amount <= 0) {
      riskItems.push({
        key: 'invalid-amount',
        title: '扣除金额必须大于 0',
        detail: '金额需 > 0',
        severity: 'danger',
      });
    }
    if (endDate && startDate && endDate < startDate) {
      riskItems.push({
        key: 'invalid-range',
        title: '结束日期早于开始日期',
        detail: '结束日期 < 开始日期',
        severity: 'danger',
      });
    }
    if (duplicateNewCurrentRecord) {
      riskItems.push({
        key: 'existing-current-hit',
        title: '当前税月已存在同类型命中记录',
        detail: `${taxReferencePeriod} 已有 ${sameTypeInScopeRecords.length} 条`,
        severity: 'danger',
      });
    } else if (duplicateCurrentPeriod) {
      riskItems.push({
        key: 'duplicate-current-period',
        title: '保存后同类型会在本月重复命中',
        detail: `保存后 ${taxReferencePeriod} ${predictedInScopeCount} 条`,
        severity: 'danger',
      });
    }
    if (overlappingActiveRecords.length > 0) {
      const first = overlappingActiveRecords[0];
      riskItems.push({
        key: 'overlap-active-ranges',
        title: '与现有 ACTIVE 记录的区间重叠',
        detail: `${toDateInputValue(first.startDate) || '-'} ~ ${toDateInputValue(first.endDate) || '长期有效'} 重叠`,
        severity: 'danger',
      });
    }
    if (activeButOutOfScope) {
      riskItems.push({
        key: 'active-out-of-scope',
        title: '当前保存不会参与本月个税',
        detail: `${taxReferencePeriod} 不命中`,
        severity: 'warning',
      });
    }
    if (hasExtremeReferenceDeviation) {
      riskItems.push({
        key: 'reference-drift-large',
        title: '当前金额与参考标准偏差过大',
        detail: `${formatCurrency(amount)} / 参考 ${formatCurrency(referenceAmount)}`,
        severity: 'danger',
      });
    } else if (hasLargeReferenceDeviation) {
      riskItems.push({
        key: 'reference-drift',
        title: '当前金额与参考标准存在明显偏差',
        detail: `${formatCurrency(amount)} / 参考 ${formatCurrency(referenceAmount)}`,
        severity: 'warning',
      });
    }
    if (needsRemark) {
      riskItems.push({
        key: 'missing-remark',
        title: '建议补充备注说明差异原因',
        detail: '建议补备注',
        severity: 'warning',
      });
    }

    const blockingRiskItems = riskItems.filter(item =>
      ['existing-current-hit', 'duplicate-current-period', 'overlap-active-ranges'].includes(item.key),
    );
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = basicInfoMissing
      ? {
        label: '待补完整',
        className: 'border-slate-200 bg-slate-50 text-slate-600',
        hint: '先把扣除类型、金额和开始日期补完整，再判断是否会影响当前税月的个税口径。',
      }
      : !score
        ? {
          label: '可直接保存',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          hint: '当前扣除类型、金额、时间区间和本月命中关系都比较清晰，可以继续保存。',
        }
        : score <= 2
          ? {
            label: '保存需注意',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `发现 ${riskItems.length} 条需要人工确认的专项扣除保存提示。`,
          }
          : {
            label: '保存存在风险',
            className: 'border-rose-200 bg-rose-50 text-rose-700',
            hint: `当前有 ${riskItems.length} 条高风险提示，建议先调整金额或区间再保存。`,
          };

    return {
      label,
      amount,
      startMonth,
      endMonth,
      referenceAmount,
      referenceDelta,
      referenceDeltaRatio,
      sameTypeHistoryCount: sameTypeHistoryRecords.length,
      sameTypeActiveCount: sameTypeHistoryRecords.filter(item => String(item.status || '').toUpperCase() === 'ACTIVE').length,
      sameTypeCurrentScopeCount: sameTypeInScopeRecords.length,
      predictedInScopeCount,
      predictedInScopeAmount,
      overlappingActiveCount: overlappingActiveRecords.length,
      proposedActive,
      proposedInScope,
      noChanges,
      modeLabel,
      modeHint,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [
    activeTaxDeductionIds,
    currentTaxConfigReferenceMap,
    editingTaxDeductionId,
    employeeAllTaxDeductions,
    employeeTaxDeductions,
    taxDeductionForm.amount,
    taxDeductionForm.deductionType,
    taxDeductionForm.endDate,
    taxDeductionForm.remark,
    taxDeductionForm.startDate,
    taxDeductionForm.status,
    taxDeductionFormExistingRecord,
    taxReferenceMonthKey,
    taxReferencePeriod,
  ]);

  const taxDeductionFilterTypeOptions = useMemo(
    () => Array.from(new Set(
      employeeAllTaxDeductions
        .map(item => item.deductionType)
        .filter((value): value is string => Boolean(value && String(value).trim())),
    ))
      .map(value => ({
        value,
        label: deductionTypeOptions.find(option => option.value === value)?.label || value,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
    [employeeAllTaxDeductions],
  );

  const filteredEmployeeAllTaxDeductions = useMemo(
    () => sortedEmployeeAllTaxDeductions.filter(item => {
      const typeMatched = taxDeductionTypeFilter === ALL_VALUE || item.deductionType === taxDeductionTypeFilter;
      const statusMatched = taxDeductionStatusFilter === ALL_VALUE || item.status === taxDeductionStatusFilter;
      const inCurrentScope = activeTaxDeductionIds.has(item.id);
      const scopeMatched = taxDeductionScopeFilter === ALL_VALUE
        || (taxDeductionScopeFilter === 'IN_SCOPE' ? inCurrentScope : !inCurrentScope);
      return typeMatched && statusMatched && scopeMatched;
    }),
    [activeTaxDeductionIds, sortedEmployeeAllTaxDeductions, taxDeductionScopeFilter, taxDeductionStatusFilter, taxDeductionTypeFilter],
  );

  const employeeTaxDeductionStats = useMemo(() => ({
    total: employeeAllTaxDeductions.length,
    active: employeeAllTaxDeductions.filter(item => item.status === 'ACTIVE').length,
    inScope: employeeTaxDeductions.length,
    currentAmount: currentTaxDeductionTotal,
    matched: filteredEmployeeAllTaxDeductions.length,
  }), [currentTaxDeductionTotal, employeeAllTaxDeductions, employeeTaxDeductions.length, filteredEmployeeAllTaxDeductions.length]);

  const assignTotal = useMemo(
    () => sumInputMap(assignForm.salaryData),
    [assignForm.salaryData],
  );

  const assignFormEmployee = useMemo(
    () => employeeMap.get(assignForm.employeeId) || null,
    [assignForm.employeeId, employeeMap],
  );

  // 首次分配薪资会直接生成员工当前档案，这里先把入职时间、结构样本和金额分布预览出来，避免真实写库后才发现口径错了。
  const assignFormDiagnostics = useMemo(() => {
    const selectedItems = assignStructurePreview?.items || [];
    const selectedEmployee = assignFormEmployee;
    const selectedEffectiveDate = assignForm.effectiveDate || '';
    const selectedStructureUsage = assignForm.structureId
      ? structureActiveSalaryStatsMap.get(assignForm.structureId) || null
      : null;
    const benchmarkRecords = workingEmployeeSalaries.filter(item =>
      item.structureId === assignForm.structureId
      && String(item.status || '').toUpperCase() === 'ACTIVE'
      && employeeMap.get(item.employeeId)?.employeeStatus !== 'RESIGNED',
    );
    const benchmarkTotals = benchmarkRecords
      .map(item => normalizeAmount(item.totalSalary))
      .filter(value => Number.isFinite(value) && value > 0);
    const benchmarkStats = {
      count: benchmarkTotals.length,
      min: benchmarkTotals.length ? Math.min(...benchmarkTotals) : 0,
      median: getMedianValue(benchmarkTotals),
      max: benchmarkTotals.length ? Math.max(...benchmarkTotals) : 0,
    };
    const amountMap = selectedItems.reduce<Record<string, number>>((result, item) => {
      const itemKey = String(item.id);
      const rawValue = String(assignForm.salaryData[itemKey] ?? '').trim();
      const amount = Number(rawValue || 0);
      result[itemKey] = Number.isFinite(amount) ? normalizeAmount(amount) : 0;
      return result;
    }, {});
    const filledItems = selectedItems.filter(item => String(assignForm.salaryData[String(item.id)] ?? '').trim() !== '');
    const positiveItems = selectedItems.filter(item => amountMap[String(item.id)] > 0);
    const fixedItems = selectedItems.filter(item => item.itemType === 'FIXED');
    const variableItems = selectedItems.filter(item => item.itemType === 'VARIABLE');
    const fixedBlankItems = fixedItems.filter(item => String(assignForm.salaryData[String(item.id)] ?? '').trim() === '');
    const fixedZeroItems = fixedItems.filter(item => amountMap[String(item.id)] <= 0);
    const basicItems = selectedItems.filter(item => item.category === 'BASIC');
    const zeroBasicItems = basicItems.filter(item => amountMap[String(item.id)] <= 0);
    const positiveVariableItems = variableItems.filter(item => amountMap[String(item.id)] > 0);
    const formulaItems = selectedItems.filter(item => Boolean(String(item.formula || '').trim()));
    const hireDate = toDateInputValue(selectedEmployee?.hireDate) || '';
    const currentSalaryRecord = activeEmployeeSalaryMap.get(assignForm.employeeId) || null;
    const effectiveBeforeHire = Boolean(hireDate && selectedEffectiveDate && selectedEffectiveDate < hireDate);
    const hireDelayDays = hireDate && selectedEffectiveDate
      ? Math.round((
        new Date(`${selectedEffectiveDate}T00:00:00`).getTime()
        - new Date(`${hireDate}T00:00:00`).getTime()
      ) / (24 * 60 * 60 * 1000))
      : 0;
    const delayedInitialAssignment = Boolean(hireDate && selectedEffectiveDate && hireDelayDays > 30);
    const currentSalaryExists = Boolean(currentSalaryRecord);
    const noPositiveAmounts = selectedItems.length > 0 && assignTotal <= 0;
    const fixedItemsAllZero = fixedItems.length > 0 && fixedZeroItems.length === fixedItems.length;
    const benchmarkOutOfRange = benchmarkStats.count > 0
      && (assignTotal < benchmarkStats.min || assignTotal > benchmarkStats.max);
    const benchmarkExtremeOutlier = benchmarkStats.count > 0
      && (
        assignTotal < Number((benchmarkStats.min * 0.8).toFixed(2))
        || assignTotal > Number((benchmarkStats.max * 1.2).toFixed(2))
      );
    const benchmarkFarFromMedian = benchmarkStats.count > 0
      && !benchmarkOutOfRange
      && Math.abs(assignTotal - benchmarkStats.median) >= Math.max(1500, benchmarkStats.median * 0.15);
    const basicInfoMissing = !assignForm.employeeId || !assignForm.structureId || !selectedEffectiveDate;

    let modeLabel = '等待选择员工和结构';
    let modeHint = '选定员工、结构和生效日期后，这里会预览首薪分配是否合理。';
    if (selectedEmployee && assignForm.structureId && selectedEffectiveDate) {
      if (currentSalaryExists) {
        modeLabel = '当前员工已经存在现薪';
        modeHint = '这更像重复分配或并发写库，建议先刷新员工列表再决定是否继续。';
      } else if (selectedItems.length === 0) {
        modeLabel = '结构为空，无法分配首薪';
        modeHint = '当前结构没有任何薪资项目，保存后无法形成可用的员工薪资明细。';
      } else if (effectiveBeforeHire) {
        modeLabel = '入职前分配首薪';
        modeHint = `员工入职日是 ${hireDate}，当前生效日 ${selectedEffectiveDate} 早于入职时间。`;
      } else if (delayedInitialAssignment) {
        modeLabel = '回补历史首薪';
        modeHint = `员工 ${hireDate} 已入职，但首薪准备到 ${selectedEffectiveDate} 才生效，属于明显回补链路。`;
      } else if (positiveVariableItems.length > 0) {
        modeLabel = '首薪包含浮动项';
        modeHint = '当前首次分配已经把浮动项一起带入，后续调薪和绩效链路要重点核对。';
      } else {
        modeLabel = '创建首条员工薪资档案';
        modeHint = '保存后会直接生成当前员工的第一条薪资档案，并进入现薪联调工作区。';
      }
    }

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (!assignForm.employeeId) {
      riskItems.push({
        key: 'missing-employee',
        title: '还没有选择员工',
        detail: '未选员工',
        severity: 'warning',
      });
    }
    if (!assignForm.structureId) {
      riskItems.push({
        key: 'missing-structure',
        title: '还没有选择薪资结构',
        detail: '未选结构',
        severity: 'warning',
      });
    }
    if (!selectedEffectiveDate) {
      riskItems.push({
        key: 'missing-effective-date',
        title: '还没有填写生效日期',
        detail: '未填生效日期',
        severity: 'danger',
      });
    }
    if (currentSalaryExists && currentSalaryRecord) {
      riskItems.push({
        key: 'employee-already-has-salary',
        title: '当前员工已经存在现薪档案',
        detail: `${toDateInputValue(currentSalaryRecord.effectiveDate) || '-'} / ${formatCurrency(currentSalaryRecord.totalSalary)}`,
        severity: 'danger',
      });
    }
    if (assignForm.structureId && selectedItems.length === 0) {
      riskItems.push({
        key: 'empty-structure',
        title: '当前薪资结构没有任何项目',
        detail: '空结构',
        severity: 'danger',
      });
    }
    if (effectiveBeforeHire) {
      riskItems.push({
        key: 'effective-before-hire',
        title: '生效日期早于员工入职日',
        detail: `${selectedEffectiveDate} < ${hireDate}`,
        severity: 'danger',
      });
    }
    if (noPositiveAmounts) {
      riskItems.push({
        key: 'all-zero-amounts',
        title: '当前首薪明细全部是 0',
        detail: '总额为 0',
        severity: 'danger',
      });
    }
    if (fixedItemsAllZero) {
      riskItems.push({
        key: 'fixed-items-zero',
        title: '固定项金额全部为 0',
        detail: '固定项全为 0',
        severity: 'danger',
      });
    }
    if (zeroBasicItems.length > 0) {
      riskItems.push({
        key: 'basic-item-zero',
        title: '基本工资项当前仍为 0',
        detail: `${zeroBasicItems.map(item => item.itemName).join('、')} 为 0`,
        severity: 'danger',
      });
    }
    if (fixedBlankItems.length > 0) {
      riskItems.push({
        key: 'fixed-items-blank',
        title: '仍有固定项没有填写金额',
        detail: `${fixedBlankItems.slice(0, 3).map(item => item.itemName).join('、')}${fixedBlankItems.length > 3 ? ' 等' : ''} 为空`,
        severity: 'warning',
      });
    }
    if (positiveVariableItems.length > 0) {
      riskItems.push({
        key: 'variable-items-positive',
        title: '首次分配已经带入浮动项',
        detail: `${positiveVariableItems.map(item => item.itemName).join('、')} 有值`,
        severity: 'warning',
      });
    }
    if (formulaItems.length > 0) {
      riskItems.push({
        key: 'formula-items-exist',
        title: '当前结构包含公式项',
        detail: `${formulaItems.map(item => item.itemName).join('、')} 带公式`,
        severity: 'warning',
      });
    }
    if (benchmarkExtremeOutlier) {
      riskItems.push({
        key: 'benchmark-extreme-outlier',
        title: '当前首薪总额明显偏离结构现有样本',
        detail: `${formatCurrency(assignTotal)} / ${formatCurrency(benchmarkStats.min)} - ${formatCurrency(benchmarkStats.max)}`,
        severity: 'danger',
      });
    } else if (benchmarkOutOfRange) {
      riskItems.push({
        key: 'benchmark-out-of-range',
        title: '当前首薪总额超出结构样本区间',
        detail: `${formatCurrency(assignTotal)} / ${formatCurrency(benchmarkStats.min)} - ${formatCurrency(benchmarkStats.max)}`,
        severity: 'warning',
      });
    } else if (benchmarkFarFromMedian) {
      riskItems.push({
        key: 'benchmark-far-from-median',
        title: '当前首薪总额与结构中位样本差异较大',
        detail: `${formatCurrency(assignTotal)} / 中位 ${formatCurrency(benchmarkStats.median)}`,
        severity: 'warning',
      });
    }
    if (selectedItems.length > 0 && benchmarkStats.count === 0) {
      riskItems.push({
        key: 'no-benchmark-sample',
        title: '当前结构还没有可参考的现薪样本',
        detail: '无现薪样本',
        severity: 'warning',
      });
    }
    if (delayedInitialAssignment) {
      riskItems.push({
        key: 'delayed-initial-assignment',
        title: '首薪生效日明显晚于入职日',
        detail: `${hireDate} -> ${selectedEffectiveDate}`,
        severity: 'warning',
      });
    }

    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const riskSummary = basicInfoMissing
      ? {
        label: '待补完整',
        className: 'border-slate-200 bg-slate-50 text-slate-600',
        hint: '先把员工、结构和生效日期补完整，再判断首薪分配是否可直接写库。',
      }
      : !score
        ? {
          label: '可直接分配',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          hint: '当前员工、结构样本和首薪金额关系都比较清晰，可以继续真实联调。',
        }
        : score <= 2
          ? {
            label: '分配需注意',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `发现 ${riskItems.length} 条需要人工确认的首薪分配提示。`,
          }
          : {
            label: '分配存在风险',
            className: 'border-rose-200 bg-rose-50 text-rose-700',
            hint: `当前有 ${riskItems.length} 条高风险提示，建议先调整参数再保存。`,
          };

    return {
      selectedEmployee,
      selectedStructureUsage,
      benchmarkStats,
      selectedItemCount: selectedItems.length,
      filledItemCount: filledItems.length,
      positiveItemCount: positiveItems.length,
      fixedItemCount: fixedItems.length,
      variableItemCount: variableItems.length,
      positiveVariableItemCount: positiveVariableItems.length,
      hireDate,
      modeLabel,
      modeHint,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [
    activeEmployeeSalaryMap,
    assignForm.effectiveDate,
    assignForm.employeeId,
    assignForm.salaryData,
    assignForm.structureId,
    assignFormEmployee,
    assignStructurePreview,
    assignTotal,
    employeeMap,
    structureActiveSalaryStatsMap,
    workingEmployeeSalaries,
  ]);

  const adjustmentAfterTotal = useMemo(
    () => sumInputMap(adjustForm.afterSalaryData),
    [adjustForm.afterSalaryData],
  );

  const adjustmentFormEmployee = useMemo(
    () => employeeMap.get(adjustForm.employeeId) || null,
    [adjustForm.employeeId, employeeMap],
  );

  const adjustmentFormDiagnostics = useMemo(() => {
    const baselineAmountMap = buildSalaryItemAmountMap(adjustmentBaseline?.items);
    const nextAmountMap = Object.entries(adjustForm.afterSalaryData).reduce<Record<string, number>>((result, [key, value]) => {
      const amount = Number(value || 0);
      result[key] = Number.isFinite(amount) ? normalizeAmount(amount) : 0;
      return result;
    }, {});
    const changedItemCount = Array.from(new Set([...Object.keys(baselineAmountMap), ...Object.keys(nextAmountMap)])).filter(key =>
      normalizeAmount(baselineAmountMap[key]) !== normalizeAmount(nextAmountMap[key]),
    ).length;
    const baselineEffectiveDate = toDateInputValue(adjustmentBaseline?.effectiveDate) || '';
    const selectedEffectiveDate = adjustForm.effectiveDate || '';
    const employeeAdjustments = [...adjustmentFormHistory]
      .sort((left, right) => {
        const rightTime = new Date(right.effectiveDate || right.createTime || 0).getTime();
        const leftTime = new Date(left.effectiveDate || left.createTime || 0).getTime();
        return rightTime - leftTime || right.id - left.id;
      });
    const sameDateAdjustments = employeeAdjustments.filter(item => (toDateInputValue(item.effectiveDate) || '') === selectedEffectiveDate);
    const futureAdjustments = employeeAdjustments.filter(item => isFutureDate(item.effectiveDate));
    const currentActiveSalary = activeEmployeeSalaryMap.get(adjustForm.employeeId) || null;
    const noChanges = Boolean(adjustmentBaseline) && changedItemCount === 0;
    const isDecrease = adjustmentBaseline ? adjustmentAfterTotal < Number(adjustmentBaseline.totalSalary || 0) : false;
    const sameDayCurrent = Boolean(baselineEffectiveDate && selectedEffectiveDate && baselineEffectiveDate === selectedEffectiveDate);
    const backfillHistory = Boolean(baselineEffectiveDate && selectedEffectiveDate && selectedEffectiveDate < baselineEffectiveDate);
    const sameAsCurrentActive = isSalaryLandingMatched(currentActiveSalary, selectedEffectiveDate, adjustmentAfterTotal);
    const exactDuplicate = sameDateAdjustments.some(item => normalizeAmount(item.afterTotal) === normalizeAmount(adjustmentAfterTotal));

    let modeLabel = '等待选择员工';
    let modeHint = '选择员工后会读取当前现薪，并判断本次调薪会落到哪条链路。';
    if (adjustmentBaseline && selectedEffectiveDate) {
      if (noChanges) {
        modeLabel = '无变化重复提交';
        modeHint = '当前调薪后明细与员工现薪完全一致，继续创建大概率只会新增一张没有业务意义的单据。';
      } else if (sameDayCurrent) {
        modeLabel = '同日覆盖当前现薪';
        modeHint = `当前现薪本身就是 ${baselineEffectiveDate} 生效，本次调薪会把同一天的薪资链路叠得更复杂。`;
      } else if (backfillHistory) {
        modeLabel = '回补历史调薪';
        modeHint = `当前现薪生效日是 ${baselineEffectiveDate}，这次会回补更早的历史日期 ${selectedEffectiveDate}。`;
      } else if (isFutureDate(selectedEffectiveDate)) {
        modeLabel = '创建未来生效调薪';
        modeHint = '这条调薪会先沉淀为未来档案，今天的现薪和测算不会立刻切过去。';
      } else {
        modeLabel = '创建新调薪链路';
        modeHint = '审批通过并执行生效后，当前 ACTIVE 现薪会被新的薪资档案替换。';
      }
    }

    const riskItems: Array<{ key: string; title: string; detail: string; severity: 'warning' | 'danger' }> = [];
    if (adjustmentBaseline) {
      if (noChanges) {
        riskItems.push({
          key: 'no-changes',
          title: '调薪后明细没有变化',
          detail: '与现薪一致',
          severity: 'danger',
        });
      }
      if (sameDateAdjustments.length > 0) {
        riskItems.push({
          key: 'same-date-adjustments',
          title: '目标生效日已有调薪单',
          detail: `${selectedEffectiveDate || '-'} ${sameDateAdjustments.length} 张`,
          severity: sameDateAdjustments.some(item => String(item.status || '').toUpperCase() === 'EFFECTIVE') ? 'danger' : 'warning',
        });
      }
      if (exactDuplicate || sameAsCurrentActive) {
        riskItems.push({
          key: 'exact-duplicate',
          title: '调薪结果已经存在',
          detail: '结果已存在',
          severity: 'danger',
        });
      }
      if (backfillHistory) {
        riskItems.push({
          key: 'backfill-history',
          title: '本次是在回补历史调薪',
          detail: `${selectedEffectiveDate} < ${baselineEffectiveDate}`,
          severity: 'warning',
        });
      }
      if (isDecrease) {
        riskItems.push({
          key: 'decrease-salary',
          title: '本次调薪后的总额低于现薪',
          detail: `${formatCurrency(adjustmentBaseline.totalSalary)} -> ${formatCurrency(adjustmentAfterTotal)}`,
          severity: 'warning',
        });
      }
      if (futureAdjustments.length > 0 && isFutureDate(selectedEffectiveDate)) {
        riskItems.push({
          key: 'future-chain-exists',
          title: '当前员工已存在未来调薪链路',
          detail: `未来 ${futureAdjustments.length} 条`,
          severity: 'warning',
        });
      }
      if (!adjustForm.adjustmentReason.trim()) {
        riskItems.push({
          key: 'missing-reason',
          title: '还没有填写调薪原因',
          detail: '未填原因',
          severity: 'warning',
        });
      }
    }

    const score = riskItems.reduce((total, item) => total + (item.severity === 'danger' ? 2 : 1), 0);
    const blockingRiskItems = riskItems.filter(item => item.severity === 'danger');
    const riskSummary = !adjustmentBaseline
      ? {
        label: '等待加载',
        className: 'border-slate-200 bg-slate-50 text-slate-600',
        hint: '先读取员工现薪，再判断这条调薪会不会制造重复或异常链路。',
      }
      : !score
        ? {
          label: '可直接创建',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          hint: '当前调薪后明细、日期和历史链路看起来都合理，可以继续创建调薪申请。',
        }
        : score <= 2
          ? {
            label: '创建需注意',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            hint: `发现 ${riskItems.length} 条需要人工确认的调薪创建提示。`,
          }
          : {
            label: '创建存在风险',
            className: 'border-rose-200 bg-rose-50 text-rose-700',
            hint: `当前有 ${riskItems.length} 条高风险提示，建议先调整参数再创建调薪单。`,
          };

    return {
      changedItemCount,
      sameDateAdjustments,
      futureAdjustments,
      modeLabel,
      modeHint,
      riskItems,
      blockingRiskItems,
      riskSummary,
    };
  }, [
    activeEmployeeSalaryMap,
    adjustForm.adjustmentReason,
    adjustForm.afterSalaryData,
    adjustForm.employeeId,
    adjustForm.effectiveDate,
    adjustmentAfterTotal,
    adjustmentBaseline,
    employeeMap,
    adjustmentFormHistory,
  ]);

  const loadSalaryStructureDetailCatalog = async (structures: SalaryStructure[]) => {
    if (!structures.length) {
      setSalaryStructureDetailMap({});
      if (!selectedStructureId) {
        setStructureDetail(null);
      }
      return;
    }

    const detailResults = await Promise.allSettled(
      structures.map(item => getSalaryStructure(item.id)),
    );

    const nextDetailMap = detailResults.reduce<Record<number, SalaryStructureDetail>>((result, current, index) => {
      if (current.status === 'fulfilled') {
        result[structures[index].id] = current.value;
      } else {
        console.error(current.reason);
      }
      return result;
    }, {});

    setSalaryStructureDetailMap(nextDetailMap);

    if (!selectedStructureId) return;

    const selectedDetail = nextDetailMap[Number(selectedStructureId)];
    if (selectedDetail) {
      setStructureDetail(selectedDetail);
    } else if (!nextDetailMap[Number(selectedStructureId)]) {
      setStructureDetail(null);
    }
  };

  const loadFoundationData = async () => {
    setFoundationLoading(true);
    try {
      const [employeeRes, itemRes, structureRes, gradeRes, schemeRes, levelRes, insuranceLedgerRes, taxConfigRes] = await Promise.all([
        listEmployees(),
        listSalaryItems(),
        listSalaryStructures(),
        listSalaryGrades(),
        listInsuranceSchemes(),
        listJobLevels(),
        listEmployeeInsurances({
          pageNum: 1,
          pageSize: INSURANCE_SCHEME_CATALOG_PAGE_SIZE,
        }).catch(error => {
          console.error(error);
          return null;
        }),
        getCurrentTaxConfig().catch(error => {
          console.error(error);
          return null;
        }),
      ]);

      setEmployees(Array.isArray(employeeRes) ? employeeRes : []);
      setSalaryItems(Array.isArray(itemRes) ? itemRes : []);
      const structureRows = Array.isArray(structureRes) ? structureRes : [];
      setSalaryStructures(structureRows);
      await loadSalaryStructureDetailCatalog(structureRows);
      setSalaryGrades(Array.isArray(gradeRes) ? gradeRes : []);
      setInsuranceSchemes(Array.isArray(schemeRes) ? schemeRes : []);
      setJobLevels(Array.isArray(levelRes) ? levelRes : []);
      setInsuranceLedgerCatalog(Array.isArray(insuranceLedgerRes?.records) ? insuranceLedgerRes.records : []);
      setCurrentTaxConfig(taxConfigRes);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '薪酬基础数据加载失败'));
    } finally {
      setFoundationLoading(false);
    }
  };

  const loadEmployeeSalaryList = async (
    preservedEmployeeId?: number,
    nextDeptFilter = salaryDeptFilter,
    nextStructureFilter = salaryStructureFilter,
  ) => {
    setEmployeeSalaryListLoading(true);
    try {
      const data = await listEmployeeSalaries({
        status: 'ACTIVE',
        deptId: nextDeptFilter === ALL_VALUE ? undefined : Number(nextDeptFilter),
        structureId: nextStructureFilter === ALL_VALUE ? undefined : Number(nextStructureFilter),
      });
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
      toast.error(getErrorMessage(error, '员工薪资列表加载失败'));
    } finally {
      setEmployeeSalaryListLoading(false);
    }
  };

  const loadAdjustmentList = async (
    preservedId?: number,
    nextStatusFilter = adjustmentStatusFilter,
    nextTypeFilter = adjustmentTypeFilter,
    nextEmployeeFilter = adjustmentEmployeeFilter,
    nextEffectiveStart = adjustmentEffectiveStart,
    nextEffectiveEnd = adjustmentEffectiveEnd,
  ) => {
    setAdjustmentListLoading(true);
    try {
      const data = await listSalaryAdjustments({
        pageNum: 1,
        pageSize: 50,
        status: nextStatusFilter === ALL_VALUE ? undefined : nextStatusFilter,
        adjustmentType: nextTypeFilter === ALL_VALUE ? undefined : nextTypeFilter,
        employeeId: nextEmployeeFilter === ALL_VALUE ? undefined : Number(nextEmployeeFilter),
        effectiveDateStart: nextEffectiveStart || undefined,
        effectiveDateEnd: nextEffectiveEnd || undefined,
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
      toast.error(getErrorMessage(error, '调薪申请列表加载失败'));
    } finally {
      setAdjustmentListLoading(false);
    }
  };

  const loadStructureDetail = async (structureId: number) => {
    setStructureDetailLoading(true);
    try {
      const cachedDetail = salaryStructureDetailMap[structureId];
      if (cachedDetail) {
        setStructureDetail(cachedDetail);
        return;
      }

      const detail = await getSalaryStructure(structureId);
      setStructureDetail(detail);
      setSalaryStructureDetailMap(prev => ({ ...prev, [structureId]: detail }));
    } catch (error) {
      console.error(error);
      setStructureDetail(null);
      toast.error(getErrorMessage(error, '薪资结构详情加载失败'));
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
      toast.error(getErrorMessage(error, '员工薪资详情加载失败'));
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
      toast.error(getErrorMessage(error, '员工薪资档案历史加载失败'));
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
      toast.error(getErrorMessage(error, '调薪履历加载失败'));
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
      let hasInsuranceProfile = false;

      try {
        const insurancePage = await listEmployeeInsurances({
          employeeId,
          status: 'ACTIVE',
          pageNum: 1,
          pageSize: 1,
        });
        hasInsuranceProfile = Array.isArray(insurancePage?.records) && insurancePage.records.length > 0;
      } catch (error) {
        console.error(error);
      }

      if (hasInsuranceProfile) {
        try {
          insuranceDetail = await getEmployeeInsurance(employeeId);
        } catch (error) {
          if (!isInsuranceProfileMissingError(error)) {
            console.error(error);
          }
        }

        try {
          if (grossSalary > 0) {
            insuranceCalculation = await calculateEmployeeInsurance(employeeId, grossSalary);
          }
        } catch (error) {
          if (!isInsuranceProfileMissingError(error)) {
            console.error(error);
          }
        }
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

  const loadEmployeeInsuranceLedger = async (
    employeeId: number,
    nextStatusFilter = insuranceLedgerStatusFilter,
    nextPageNum = insuranceLedgerPageNum,
  ) => {
    setEmployeeInsuranceListLoading(true);
    try {
      const [data, catalogData] = await Promise.all([
        listEmployeeInsurances({
          employeeId,
          status: nextStatusFilter === ALL_VALUE ? undefined : nextStatusFilter,
          pageNum: nextPageNum,
          pageSize: INSURANCE_LEDGER_PAGE_SIZE,
        }),
        listEmployeeInsurances({
          employeeId,
          pageNum: 1,
          pageSize: EMPLOYEE_INSURANCE_LEDGER_CATALOG_PAGE_SIZE,
        }).catch(error => {
          console.error(error);
          return null;
        }),
      ]);

      const normalizedPage: HrPagedResult<EmployeeInsurance> = {
        records: Array.isArray(data?.records) ? data.records : [],
        total: Number(data?.total ?? 0),
        size: Number(data?.size ?? INSURANCE_LEDGER_PAGE_SIZE),
        current: Number(data?.current ?? nextPageNum),
        pages: Number(data?.pages ?? 0),
      };

      if (normalizedPage.pages > 0 && nextPageNum > normalizedPage.pages) {
        setEmployeeInsuranceLedgerCatalog(Array.isArray(catalogData?.records) ? catalogData.records : []);
        setInsuranceLedgerPageNum(normalizedPage.pages);
        return;
      }

      setEmployeeInsuranceLedgerPage(normalizedPage);
      setEmployeeInsuranceLedgerCatalog(Array.isArray(catalogData?.records) ? catalogData.records : []);
    } catch (error) {
      console.error(error);
      setEmployeeInsuranceLedgerPage(null);
      setEmployeeInsuranceLedgerCatalog([]);
      toast.error(getErrorMessage(error, '员工社保台账加载失败'));
    } finally {
      setEmployeeInsuranceListLoading(false);
    }
  };

  const loadEmployeeTaxDeductionRecords = async (employeeId: number) => {
    setTaxDeductionListLoading(true);
    try {
      const rows = await listTaxDeductions(employeeId);
      setEmployeeAllTaxDeductions(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error(error);
      setEmployeeAllTaxDeductions([]);
      toast.error(getErrorMessage(error, '专项扣除记录加载失败'));
    } finally {
      setTaxDeductionListLoading(false);
    }
  };

  const refreshCurrentTaxDeductionWorkspace = async (employeeId: number) => {
    const effectiveDate = employeeSalaryDetail?.employeeId === employeeId
      ? employeeSalaryDetail?.effectiveDate || currentEmployeeRecord?.effectiveDate
      : currentEmployeeRecord?.employeeId === employeeId
        ? currentEmployeeRecord?.effectiveDate
        : undefined;
    const grossSalary = currentEmployeeRecord?.employeeId === employeeId
      ? currentGrossSalary
      : 0;

    await Promise.all([
      loadEmployeeTaxDeductionRecords(employeeId),
      loadEmployeeCompensationProfile(employeeId, grossSalary, effectiveDate),
    ]);
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
      toast.error(getErrorMessage(error, '调薪申请详情加载失败'));
    } finally {
      setAdjustmentDetailLoading(false);
    }
  };

  const loadAdjustmentEmployeeSalaryContext = async (employeeId: number) => {
    setAdjustmentEmployeeSalaryLoading(true);
    try {
      const [currentSalary, salaryHistory] = await Promise.all([
        getEmployeeSalary(employeeId).catch(error => {
          console.error(error);
          return null;
        }),
        listEmployeeSalaries({ employeeId }).catch(error => {
          console.error(error);
          return [] as EmployeeSalary[];
        }),
      ]);

      setAdjustmentEmployeeSalaryDetail(currentSalary);
      setAdjustmentEmployeeSalaryHistory(Array.isArray(salaryHistory) ? salaryHistory : []);
    } finally {
      setAdjustmentEmployeeSalaryLoading(false);
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
  }, [adjustmentStatusFilter, adjustmentTypeFilter, adjustmentEmployeeFilter, adjustmentEffectiveStart, adjustmentEffectiveEnd, bootstrapped]);

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
      setEmployeeInsuranceLedgerPage(null);
      setEmployeeInsuranceLedgerCatalog([]);
      setEmployeeInsuranceCalculation(null);
      setEmployeeTaxDeductions([]);
      setEmployeeAllTaxDeductions([]);
      setEmployeeTaxCalculation(null);
      return;
    }

    void refreshCurrentEmployeeWorkspace(currentEmployeeRecord);
  }, [currentEmployeeRecord]);

  useEffect(() => {
    if (!currentEmployeeRecord) return;
    void loadEmployeeInsuranceLedger(currentEmployeeRecord.employeeId);
  }, [currentEmployeeRecord?.employeeId, insuranceLedgerStatusFilter, insuranceLedgerPageNum]);

  useEffect(() => {
    if (!currentAdjustmentRecord) return;
    void loadAdjustmentDetail(currentAdjustmentRecord.id);
  }, [currentAdjustmentRecord]);

  useEffect(() => {
    if (!adjustmentDetail) {
      setAdjustmentEmployeeSalaryDetail(null);
      setAdjustmentEmployeeSalaryHistory([]);
      return;
    }

    void loadAdjustmentEmployeeSalaryContext(adjustmentDetail.employeeId);
  }, [adjustmentDetail]);

  useEffect(() => {
    if (!assignDialogOpen) return;

    if (!enabledSalaryStructures.length) {
      setAssignForm(prev => ({ ...prev, structureId: 0, salaryData: {} }));
      setAssignStructurePreview(null);
      return;
    }

    if (!assignForm.structureId || !enabledSalaryStructures.some(item => item.id === assignForm.structureId)) {
      setAssignForm(prev => ({
        ...prev,
        structureId: enabledSalaryStructures[0].id,
        salaryData: {},
      }));
    }
  }, [assignDialogOpen, assignForm.structureId, enabledSalaryStructures]);

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
        toast.error(getErrorMessage(error, '分配表单加载薪资结构失败'));
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
      setAdjustmentFormHistory([]);
      return;
    }

    let cancelled = false;
    const loadBaseline = async () => {
      try {
        const [detail, historyRows] = await Promise.all([
          getEmployeeSalary(adjustForm.employeeId),
          getSalaryAdjustmentHistory(adjustForm.employeeId).catch(error => {
            console.error(error);
            return [] as SalaryAdjustmentHistory[];
          }),
        ]);
        if (cancelled) return;

        setAdjustmentBaseline(detail);
        setAdjustmentFormHistory(Array.isArray(historyRows) ? historyRows : []);
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
        setAdjustmentFormHistory([]);
        toast.error(getErrorMessage(error, '调薪表单加载员工现薪失败'));
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
      status: item.status ?? 1,
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
      itemIds: enabledSalaryItems.slice(0, 3).map(item => item.id),
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
        status: detail.status ?? 1,
      });
      setStructureDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '薪资结构编辑数据加载失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const closeStructureDialog = () => {
    setStructureDialogOpen(false);
    setEditingStructureId(null);
    setStructureForm(createDefaultStructureForm());
  };

  const openGradeDialog = (levelId?: number) => {
    setEditingGradeLevelId(null);
    setGradeForm({ ...createDefaultGradeForm(), levelId: levelId || sortedJobLevels[0]?.id || 0 });
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

  const openInsuranceSchemeDialog = () => {
    setEditingInsuranceSchemeId(null);
    setInsuranceSchemeForm(createDefaultInsuranceSchemeForm());
    setInsuranceSchemeDialogOpen(true);
  };

  const openInsuranceSchemeEditDialog = (scheme: InsuranceScheme) => {
    setEditingInsuranceSchemeId(scheme.id);
    setInsuranceSchemeForm(buildInsuranceSchemeForm(scheme));
    setInsuranceSchemeDialogOpen(true);
  };

  const closeInsuranceSchemeDialog = () => {
    setInsuranceSchemeDialogOpen(false);
    setEditingInsuranceSchemeId(null);
    setInsuranceSchemeForm(createDefaultInsuranceSchemeForm());
  };

  const resetTaxDeductionForm = (employeeId?: number) => {
    const referenceDate = employeeSalaryDetail?.employeeId === employeeId
      ? employeeSalaryDetail?.effectiveDate
      : currentEmployeeRecord?.employeeId === employeeId
        ? currentEmployeeRecord?.effectiveDate
        : currentEmployeeRecord?.effectiveDate;

    setEditingTaxDeductionId(null);
    setTaxDeductionForm({
      ...createDefaultTaxDeductionForm(),
      employeeId: employeeId || 0,
      startDate: getMonthStartValue(referenceDate),
    });
  };

  const openInsuranceDialog = () => {
    if (!currentEmployeeRecord) {
      toast.error('请先选择员工');
      return;
    }
    if (!enabledInsuranceSchemes.length) {
      toast.error('当前没有可分配的启用社保方案');
      return;
    }

    const defaultSchemeId = enabledInsuranceSchemes.some(item => item.id === employeeInsuranceDetail?.schemeId)
      ? Number(employeeInsuranceDetail?.schemeId)
      : enabledInsuranceSchemes[0]?.id || 0;
    const defaultBase = Number(employeeInsuranceDetail?.base ?? currentGrossSalary ?? 0);

    setInsuranceForm({
      ...createDefaultInsuranceForm(),
      employeeId: currentEmployeeRecord.employeeId,
      schemeId: defaultSchemeId,
      base: Number.isFinite(defaultBase) ? defaultBase : 0,
      effectiveDate: getTodayValue(),
    });
    setInsuranceDialogOpen(true);
  };

  const openInsuranceAssignDialogWithScheme = (scheme: InsuranceScheme) => {
    if (!currentEmployeeRecord) {
      toast.error('请先在员工列表选择联调员工，再从方案列表发起分配');
      return;
    }
    if (Number(scheme.status ?? 1) === 0) {
      toast.error('禁用方案不能直接用于新的员工分配');
      return;
    }

    const minBase = Number(scheme.baseMin ?? 0);
    const maxBase = Number(scheme.baseMax ?? 0);
    const rawBase = Number(employeeInsuranceDetail?.base ?? currentGrossSalary ?? minBase ?? 0);
    let suggestedBase = Number.isFinite(rawBase) ? rawBase : 0;

    // 快速分配入口优先给出可提交的建议基数，避免一打开弹窗就先撞上区间阻断。
    if (minBase > 0 && suggestedBase < minBase) {
      suggestedBase = minBase;
    }
    if (maxBase > 0 && suggestedBase > maxBase) {
      suggestedBase = maxBase;
    }

    setInsuranceForm({
      ...createDefaultInsuranceForm(),
      employeeId: currentEmployeeRecord.employeeId,
      schemeId: scheme.id,
      base: Number(suggestedBase.toFixed(2)),
      effectiveDate: getTodayValue(),
    });
    setInsuranceDialogOpen(true);
  };

  const closeInsuranceDialog = () => {
    setInsuranceDialogOpen(false);
    setInsuranceForm(createDefaultInsuranceForm());
  };

  const openTaxDeductionDialog = async () => {
    if (!currentEmployeeRecord) {
      toast.error('请先选择员工');
      return;
    }

    setTaxDeductionTypeFilter(ALL_VALUE);
    setTaxDeductionStatusFilter(ALL_VALUE);
    setTaxDeductionScopeFilter(ALL_VALUE);
    resetTaxDeductionForm(currentEmployeeRecord.employeeId);
    setTaxDeductionDialogOpen(true);
    await loadEmployeeTaxDeductionRecords(currentEmployeeRecord.employeeId);
  };

  const openTaxDeductionEditDialog = (item: EmployeeTaxDeduction) => {
    setEditingTaxDeductionId(item.id);
    setTaxDeductionForm({
      employeeId: item.employeeId,
      deductionType: item.deductionType,
      amount: Number(item.amount || 0),
      startDate: toDateInputValue(item.startDate) || getMonthStartValue(),
      endDate: toDateInputValue(item.endDate) || '',
      status: item.status || 'ACTIVE',
      remark: item.remark || '',
    });
  };

  const applyTaxDeductionReferenceTemplate = (deductionType: string, amount?: number) => {
    if (!currentEmployeeRecord) {
      toast.error('请先选择员工');
      return;
    }

    const referenceAmount = Number(amount ?? currentTaxConfigReferenceMap.get(deductionType) ?? 0);
    setEditingTaxDeductionId(null);
    setTaxDeductionForm({
      employeeId: currentEmployeeRecord.employeeId,
      deductionType,
      amount: Number.isFinite(referenceAmount) ? referenceAmount : 0,
      startDate: getMonthStartValue(employeeSalaryDetail?.effectiveDate || currentEmployeeRecord.effectiveDate),
      endDate: '',
      status: 'ACTIVE',
      remark: '',
    });
  };

  const closeTaxDeductionDialog = () => {
    setTaxDeductionDialogOpen(false);
    setEmployeeAllTaxDeductions([]);
    setTaxDeductionTypeFilter(ALL_VALUE);
    setTaxDeductionStatusFilter(ALL_VALUE);
    setTaxDeductionScopeFilter(ALL_VALUE);
    resetTaxDeductionForm();
  };

  const openTaxConfigDialog = async () => {
    setTaxConfigDialogOpen(true);
    setTaxConfigDialogLoading(true);
    try {
      const config = await getCurrentTaxConfig();
      setCurrentTaxConfig(config);
      setTaxConfigForm(buildTaxConfigForm(config));
    } catch (error: any) {
      console.error(error);
      setCurrentTaxConfig(null);
      setTaxConfigForm(createDefaultTaxConfigForm());
      toast.error(error?.message || '当前没有可用的个税配置，将按默认模板新建');
    } finally {
      setTaxConfigDialogLoading(false);
    }
  };

  const closeTaxConfigDialog = () => {
    setTaxConfigDialogOpen(false);
    setTaxConfigDialogLoading(false);
    setTaxConfigForm(buildTaxConfigForm(currentTaxConfig));
  };

  const openConfirmDialog = ({
    title,
    message,
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
    onConfirm,
  }: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
  }) => {
    setConfirmDialogState({
      open: true,
      title,
      message,
      confirmText,
      cancelText,
      danger,
      onConfirm,
    });
  };

  const closeConfirmDialog = () => {
    setConfirmDialogState(createDefaultConfirmDialogState());
  };

  const handleConfirmDialogConfirm = async () => {
    const action = confirmDialogState.onConfirm;
    closeConfirmDialog();
    if (action) {
      await action();
    }
  };

  const openAssignDialog = () => {
    if (!assignableEmployees.length) {
      toast.error('当前没有待分配薪资的在岗员工');
      return;
    }
    if (!enabledSalaryStructures.length) {
      toast.error('请先配置启用中的薪资结构');
      return;
    }

    setAssignForm({
      ...createDefaultAssignForm(),
      employeeId: defaultAssignableEmployeeId,
      structureId: Number(
        enabledSalaryStructures.some(item => String(item.id) === selectedStructureId)
          ? selectedStructureId
          : enabledSalaryStructures[0]?.id || 0,
      ),
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
    goSalarySection('employees');
  };

  const focusAdjustmentEmployeeWorkspace = async (employeeId?: number) => {
    if (!employeeId) return;

    setSalaryKeyword('');
    setSalaryDeptFilter(ALL_VALUE);
    setSalaryStructureFilter(ALL_VALUE);
    setSalaryHistoryStatusFilter(ALL_VALUE);
    setSelectedEmployeeId(String(employeeId));
    goSalarySection('employees');
    await loadEmployeeSalaryList(employeeId, ALL_VALUE, ALL_VALUE);
  };

  const focusStructureEmployees = async (structureId: number) => {
    setSalaryKeyword('');
    setSalaryDeptFilter(ALL_VALUE);
    setSalaryStructureFilter(String(structureId));
    goSalarySection('employees');
    await loadEmployeeSalaryList(undefined, ALL_VALUE, String(structureId));
  };

  const focusAdjustmentWorkspace = (adjustmentId?: number, employeeId?: number) => {
    // 真实联调时要保证刚创建或刚流转的记录不会被旧筛选条件“藏起来”。
    setAdjustmentKeyword('');
    setAdjustmentStatusFilter(ALL_VALUE);
    setAdjustmentTypeFilter(ALL_VALUE);
    setAdjustmentEmployeeFilter(ALL_VALUE);
    setAdjustmentEffectiveStart('');
    setAdjustmentEffectiveEnd('');
    if (adjustmentId) {
      setSelectedAdjustmentId(String(adjustmentId));
    }
    if (employeeId) {
      setSelectedEmployeeId(String(employeeId));
    }
    goSalarySection('adjustments');
  };

  const handleSaveItem = async () => {
    if (!itemForm.itemCode.trim() || !itemForm.itemName.trim()) {
      toast.error('请填写项目编码和项目名称');
      return;
    }
    if (itemFormDiagnostics.blockingRiskItems.length > 0) {
      const firstBlockingRisk = itemFormDiagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
      return;
    }

    setActionLoading(true);
    try {
      // 显式传空字符串，确保编辑时可以把可选公式真正清空。
      const payload = {
        ...itemForm,
        itemCode: itemForm.itemCode.trim(),
        itemName: itemForm.itemName.trim(),
        formula: (itemForm.formula ?? '').trim(),
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
    const diagnostics = salaryItemDeleteDiagnosticsMap.get(item.id) || buildSalaryItemDeleteDiagnostics(item);
    if (diagnostics.blockingRiskItems.length > 0) {
      const firstBlockingRisk = diagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
      return;
    }

    openConfirmDialog({
      title: '删除薪资项目',
      message: buildDeleteConfirmMessage(`薪资项目“${item.itemName}”`, diagnostics.riskItems),
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
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
      },
    });
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
    if (structureFormDiagnostics.blockingRiskItems.length > 0) {
      const firstBlockingRisk = structureFormDiagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
      return;
    }

    setActionLoading(true);
    try {
      // 显式传空字符串，确保编辑时可以把结构描述真正清空。
      const payload = {
        ...structureForm,
        structureCode: structureForm.structureCode.trim(),
        structureName: structureForm.structureName.trim(),
        description: (structureForm.description ?? '').trim(),
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
    const diagnostics = structureDetail?.id === structure.id
      ? selectedStructureDeleteDiagnostics
      : null;
    const activeUsage = diagnostics?.activeUsage || structureActiveSalaryStatsMap.get(structure.id) || null;
    const blockingRiskItems = diagnostics?.blockingRiskItems
      || (activeUsage?.archiveCount
        ? [{
          key: 'linked-active-archives',
          title: '结构仍命中在岗现薪档案',
          detail: `当前还有 ${activeUsage.archiveCount} 条 ACTIVE 现薪、${activeUsage.employeeIds.size} 名员工引用这套结构${activeUsage.futureCount ? `，其中 ${activeUsage.futureCount} 条是未来生效档案` : ''}。`,
          severity: 'danger' as const,
        }]
        : []);
    if (blockingRiskItems.length > 0) {
      const firstBlockingRisk = blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
      return;
    }

    const confirmRiskItems = diagnostics?.riskItems || [];
    openConfirmDialog({
      title: '删除薪资结构',
      message: buildDeleteConfirmMessage(`薪资结构“${structure.structureName}”`, confirmRiskItems),
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
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
      },
    });
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
    if (gradeFormDiagnostics.blockingRiskItems.length > 0) {
      const firstBlockingRisk = gradeFormDiagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
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
    const diagnostics = salaryGradeDeleteDiagnosticsMap.get(grade.levelId) || buildSalaryGradeDeleteDiagnostics(grade);

    openConfirmDialog({
      title: '删除薪级',
      message: buildDeleteConfirmMessage(`薪级“${gradeLabel}”`, diagnostics.riskItems),
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
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
      },
    });
  };

  const handleSaveInsuranceScheme = async () => {
    if (!insuranceSchemeForm.schemeName.trim() || !insuranceSchemeForm.city.trim()) {
      toast.error('请填写方案名称和适用城市');
      return;
    }
    if (!insuranceSchemeForm.effectiveDate) {
      toast.error('请选择方案生效日期');
      return;
    }
    if (insuranceSchemeForm.baseMin < 0 || insuranceSchemeForm.baseMax < 0) {
      toast.error('基数上下限不能小于 0');
      return;
    }
    if (insuranceSchemeForm.baseMax < insuranceSchemeForm.baseMin) {
      toast.error('缴纳基数上限不能小于下限');
      return;
    }

    const rateFields: Array<keyof InsuranceSchemeFormState> = [
      'pensionCompanyRate',
      'pensionPersonalRate',
      'medicalCompanyRate',
      'medicalPersonalRate',
      'unemploymentCompanyRate',
      'unemploymentPersonalRate',
      'injuryCompanyRate',
      'maternityCompanyRate',
      'housingFundCompanyRate',
      'housingFundPersonalRate',
    ];

    for (const field of rateFields) {
      const value = Number(insuranceSchemeForm[field]);
      if (!Number.isFinite(value) || value < 0) {
        toast.error('方案比例必须是大于等于 0 的数字');
        return;
      }
    }
    if (insuranceSchemeFormDiagnostics.blockingRiskItems.length > 0) {
      const firstBlockingRisk = insuranceSchemeFormDiagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
      return;
    }

    const payload: InsuranceSchemePayload = {
      ...insuranceSchemeForm,
      schemeName: insuranceSchemeForm.schemeName.trim(),
      city: insuranceSchemeForm.city.trim(),
      baseRule: (insuranceSchemeForm.baseRule ?? '').trim(),
      baseMin: Number(Number(insuranceSchemeForm.baseMin).toFixed(2)),
      baseMax: Number(Number(insuranceSchemeForm.baseMax).toFixed(2)),
    };

    setActionLoading(true);
    try {
      let affectedSchemeId = editingInsuranceSchemeId;

      if (editingInsuranceSchemeId) {
        await updateInsuranceScheme(editingInsuranceSchemeId, payload);
        toast.success('社保方案已更新');
      } else {
        const createdId = await createInsuranceScheme(payload);
        affectedSchemeId = createdId;
        if (payload.status === 0) {
          await updateInsuranceScheme(createdId, payload);
        }
        toast.success('社保方案已创建');
      }

      closeInsuranceSchemeDialog();
      await loadFoundationData();

      if (currentEmployeeRecord) {
        await loadEmployeeInsuranceLedger(
          currentEmployeeRecord.employeeId,
          insuranceLedgerStatusFilter,
          insuranceLedgerPageNum,
        );

        if (!affectedSchemeId || Number(employeeInsuranceDetail?.schemeId) === affectedSchemeId) {
          await loadEmployeeCompensationProfile(
            currentEmployeeRecord.employeeId,
            currentGrossSalary,
            employeeSalaryDetail?.effectiveDate || currentEmployeeRecord.effectiveDate,
          );
        }
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (editingInsuranceSchemeId ? '更新社保方案失败' : '创建社保方案失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignSalary = async () => {
    if (!assignForm.employeeId || !assignForm.structureId || !assignForm.effectiveDate) {
      toast.error('请填写员工、薪资结构和生效日期');
      return;
    }
    if (isFutureDate(assignForm.effectiveDate)) {
      toast.error('首次分配薪资的生效日期不能晚于今天');
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
    if (assignFormDiagnostics.blockingRiskItems.length > 0) {
      const firstBlockingRisk = assignFormDiagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
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

  const handleAssignInsurance = async () => {
    if (!currentEmployeeRecord) {
      toast.error('请先选择员工');
      return;
    }
    if (!insuranceForm.employeeId || !insuranceForm.schemeId || !insuranceForm.effectiveDate) {
      toast.error('请填写方案、基数和生效日期');
      return;
    }
    if (insuranceForm.base <= 0) {
      toast.error('缴纳基数必须大于 0');
      return;
    }
    if (isFutureDate(insuranceForm.effectiveDate)) {
      toast.error('五险一金生效日期不能晚于今天');
      return;
    }
    if (insuranceAssignDiagnostics.blockingRiskItems.length > 0) {
      const firstBlockingRisk = insuranceAssignDiagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
      return;
    }

    setActionLoading(true);
    try {
      await assignInsuranceScheme(insuranceForm);
      toast.success('社保公积金方案已分配');
      closeInsuranceDialog();
      await refreshCurrentEmployeeWorkspace(currentEmployeeRecord);
      setInsuranceLedgerPageNum(1);
      await loadEmployeeInsuranceLedger(currentEmployeeRecord.employeeId, insuranceLedgerStatusFilter, 1);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '分配社保公积金方案失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveTaxDeduction = async () => {
    if (!currentEmployeeRecord) {
      toast.error('请先选择员工');
      return;
    }
    if (!taxDeductionForm.deductionType) {
      toast.error('请选择扣除类型');
      return;
    }
    if (!taxDeductionForm.startDate) {
      toast.error('请选择开始日期');
      return;
    }
    if (taxDeductionForm.amount <= 0) {
      toast.error('扣除金额必须大于 0');
      return;
    }
    if (taxDeductionForm.endDate && taxDeductionForm.endDate < taxDeductionForm.startDate) {
      toast.error('结束日期不能早于开始日期');
      return;
    }
    if (taxDeductionFormDiagnostics.noChanges) {
      toast.error('当前没有实际变更，无需重复保存');
      return;
    }
    if (taxDeductionFormDiagnostics.blockingRiskItems.length > 0) {
      const firstBlockingRisk = taxDeductionFormDiagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
      return;
    }

    setActionLoading(true);
    try {
      const trimmedRemark = taxDeductionForm.remark.trim();

      if (editingTaxDeductionId) {
        const payload: EmployeeTaxDeductionUpdatePayload = {
          amount: Number(taxDeductionForm.amount),
          startDate: taxDeductionForm.startDate,
          endDate: taxDeductionForm.endDate || null,
          clearEndDate: !taxDeductionForm.endDate,
          status: taxDeductionForm.status,
          // 显式传空字符串，确保编辑时可以把备注真正清空。
          remark: trimmedRemark,
        };
        await updateTaxDeduction(editingTaxDeductionId, payload);
        toast.success('专项扣除已更新');
      } else {
        const payload: EmployeeTaxDeductionPayload = {
          employeeId: currentEmployeeRecord.employeeId,
          deductionType: taxDeductionForm.deductionType,
          amount: Number(taxDeductionForm.amount),
          startDate: taxDeductionForm.startDate,
          endDate: taxDeductionForm.endDate || null,
          remark: trimmedRemark || null,
        };
        await addTaxDeduction(payload);
        toast.success('专项扣除已新增');
      }

      await refreshCurrentTaxDeductionWorkspace(currentEmployeeRecord.employeeId);
      resetTaxDeductionForm(currentEmployeeRecord.employeeId);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (editingTaxDeductionId ? '更新专项扣除失败' : '新增专项扣除失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTaxDeduction = async (item: EmployeeTaxDeduction) => {
    const deductionLabel = item.deductionTypeName || deductionTypeLabel(item.deductionType);
    const diagnostics = taxDeductionDeleteDiagnosticsMap.get(item.id) || buildTaxDeductionDeleteDiagnostics(item);

    openConfirmDialog({
      title: '删除专项扣除',
      message: buildDeleteConfirmMessage(`专项扣除“${deductionLabel}”`, diagnostics.riskItems),
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await deleteTaxDeduction(item.id);
          toast.success('专项扣除已删除');
          await refreshCurrentTaxDeductionWorkspace(item.employeeId);
          if (editingTaxDeductionId === item.id) {
            resetTaxDeductionForm(item.employeeId);
          }
        } catch (error: any) {
          console.error(error);
          toast.error(error?.message || '删除专项扣除失败');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleSaveTaxConfig = async () => {
    const threshold = Number(taxConfigForm.threshold || 0);
    if (!Number.isFinite(threshold) || threshold < 0) {
      toast.error('起征点必须是大于等于 0 的数字');
      return;
    }
    if (!taxConfigForm.effectiveDate) {
      toast.error('请选择生效日期');
      return;
    }
    if (isFutureDate(taxConfigForm.effectiveDate)) {
      toast.error('当前页面只维护今天及以前生效的个税配置');
      return;
    }

    let taxBrackets: string;
    try {
      taxBrackets = normalizeTaxBracketJson(taxConfigForm.taxBracketsJson);
    } catch (error: any) {
      toast.error(error?.message || '税率档配置不正确');
      return;
    }

    let deductionItems: string;
    try {
      const payload = deductionTypeOptions.reduce<Record<string, number>>((result, item) => {
        const amount = Number(taxConfigForm.deductionItems[item.value] || 0);
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error(`${item.label}标准必须是大于等于 0 的数字`);
        }
        result[item.value] = Number(amount.toFixed(2));
        return result;
      }, {});
      deductionItems = JSON.stringify(payload);
    } catch (error: any) {
      toast.error(error?.message || '专项附加扣除标准配置不正确');
      return;
    }
    if (taxConfigDiagnostics.blockingRiskItems.length > 0) {
      const firstBlockingRisk = taxConfigDiagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
      return;
    }

    setActionLoading(true);
    try {
      const payload: TaxConfigPayload = {
        threshold: Number(threshold.toFixed(2)),
        effectiveDate: taxConfigForm.effectiveDate,
        deductionItems,
        taxBrackets,
      };

      if (taxConfigForm.id) {
        await updateTaxConfig(taxConfigForm.id, payload);
        toast.success('个税配置已更新');
      } else {
        const createdId = await createTaxConfig(payload);
        toast.success('个税配置已创建');
        setTaxConfigForm(prev => ({ ...prev, id: createdId }));
      }

      const latestConfig = await getCurrentTaxConfig();
      setCurrentTaxConfig(latestConfig);
      setTaxConfigForm(buildTaxConfigForm(latestConfig));
      setTaxConfigDialogOpen(false);
      setTaxConfigDialogLoading(false);

      if (currentEmployeeRecord) {
        await loadEmployeeCompensationProfile(
          currentEmployeeRecord.employeeId,
          currentGrossSalary,
          employeeSalaryDetail?.effectiveDate || currentEmployeeRecord.effectiveDate,
        );
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (taxConfigForm.id ? '更新个税配置失败' : '创建个税配置失败'));
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
    if (adjustmentFormDiagnostics.blockingRiskItems.length > 0) {
      const firstBlockingRisk = adjustmentFormDiagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
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
      await loadAdjustmentList(adjustmentId, ALL_VALUE, ALL_VALUE, ALL_VALUE, '', '');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '创建调薪申请失败');
    } finally {
      setActionLoading(false);
    }
  };

  const runAdjustmentAction = async (action: () => Promise<void>, successMessage: string, actionLabel: string) => {
    if (!adjustmentDetail) return;
    if (adjustmentActionDiagnostics?.blockingRiskItems.length) {
      const firstBlockingRisk = adjustmentActionDiagnostics.blockingRiskItems[0];
      toast.error(`${firstBlockingRisk.title}：${firstBlockingRisk.detail}`);
      return;
    }

    openConfirmDialog({
      title: actionLabel,
      message: buildActionConfirmMessage(
        actionLabel,
        adjustmentActionDiagnostics?.riskItems || [],
        adjustmentActionDiagnostics?.actionHint,
      ),
      confirmText: actionLabel,
      danger: false,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const nextAdjustmentId = adjustmentDetail.id;
          const nextEmployeeId = adjustmentDetail.employeeId;
          await action();
          toast.success(successMessage);
          focusAdjustmentWorkspace(nextAdjustmentId, nextEmployeeId);
          await Promise.all([
            loadAdjustmentList(nextAdjustmentId, ALL_VALUE, ALL_VALUE, ALL_VALUE, '', ''),
            loadAdjustmentDetail(nextAdjustmentId),
            loadAdjustmentEmployeeSalaryContext(nextEmployeeId),
            loadEmployeeSalaryList(nextEmployeeId),
            loadEmployeeAdjustmentHistory(nextEmployeeId),
          ]);
          if (currentEmployeeRecord?.employeeId === nextEmployeeId) {
            await refreshCurrentEmployeeWorkspace(currentEmployeeRecord);
          }
        } catch (error: any) {
          console.error(error);
          toast.error(error?.message || '调薪操作失败');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const openAdjustmentFromHistory = (adjustmentId: number) => {
    setAdjustmentKeyword('');
    setAdjustmentStatusFilter(ALL_VALUE);
    setAdjustmentTypeFilter(ALL_VALUE);
    setAdjustmentEmployeeFilter(ALL_VALUE);
    setAdjustmentEffectiveStart('');
    setAdjustmentEffectiveEnd('');
    setSelectedAdjustmentId(String(adjustmentId));
    goSalarySection('adjustments');
  };

  const canSubmitAdjustment = String(adjustmentDetail?.status || '').toUpperCase() === 'DRAFT';
  const canApproveAdjustment = String(adjustmentDetail?.status || '').toUpperCase() === 'APPROVING';
  const canEffectiveAdjustment =
    String(adjustmentDetail?.status || '').toUpperCase() === 'APPROVED'
    && !isFutureDate(adjustmentDetail?.effectiveDate);

  const foundationSectionComponents = {
    WorkspaceSectionCard,
    WorkspaceMetricStrip,
    WorkspaceDiagnosticSummary,
    WorkspaceTableStateRow,
    WorkspaceInlineState,
    DetailRow,
  };

  const primarySectionComponents = {
    ...foundationSectionComponents,
    WorkspaceInlineRiskList,
    SalaryDiffTable,
  };

  const dialogSectionComponents = {
    WorkspaceDialogShell,
    WorkspaceMetricStrip,
    WorkspaceInlineRiskList,
    DetailRow,
    SalaryAmountEditor,
  };

  const foundationDialogComponents = {
    WorkspaceDialogShell,
    WorkspaceInlineRiskList,
    DetailRow,
  };

  const taxDialogComponents = {
    WorkspaceDialogShell,
    WorkspaceInlineState,
    WorkspaceMetricStrip,
    WorkspaceDiagnosticSummary,
    WorkspaceInlineRiskList,
    WorkspaceTableStateRow,
    DetailRow,
  };

  const employeesSectionViewModel = {
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
    currentTaxAmount,
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
    insuranceReferenceEffectiveDate,
  };

  const adjustmentsSectionViewModel = {
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
    adjustmentTypeOptions,
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
    handleSubmitAdjustment: () => adjustmentDetail
      ? runAdjustmentAction(() => submitSalaryAdjustment(adjustmentDetail.id), '调薪申请已提交审批', '提交审批')
      : Promise.resolve(),
    canApproveAdjustment,
    handleApproveAdjustment: () => adjustmentDetail
      ? runAdjustmentAction(() => approveSalaryAdjustment(adjustmentDetail.id), '调薪申请已审批通过', '审批通过')
      : Promise.resolve(),
    canEffectiveAdjustment,
    handleEffectiveAdjustment: () => adjustmentDetail
      ? runAdjustmentAction(() => effectiveSalaryAdjustment(adjustmentDetail.id), '调薪已生效', '执行生效')
      : Promise.resolve(),
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
  };

  const assignDialogViewModel = {
    open: assignDialogOpen,
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
    close: () => setAssignDialogOpen(false),
    submit: handleAssignSalary,
  };

  const adjustDialogViewModel = {
    open: adjustDialogOpen,
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
    close: () => setAdjustDialogOpen(false),
    submit: handleCreateAdjustment,
  };

  const insuranceAssignDialogViewModel = {
    open: insuranceDialogOpen,
    close: closeInsuranceDialog,
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
    submit: handleAssignInsurance,
  };

  const itemDialogViewModel = {
    open: itemDialogOpen,
    editingItemId,
    close: closeItemDialog,
    itemForm,
    setItemForm,
    itemTypeOptions,
    itemCategoryOptions,
    statusOptions,
    itemFormDiagnostics,
    itemCategoryLabel,
    itemTypeLabel,
    actionLoading,
    submit: handleSaveItem,
  };

  const structureDialogViewModel = {
    open: structureDialogOpen,
    editingStructureId,
    close: closeStructureDialog,
    structureForm,
    setStructureForm,
    statusOptions,
    salaryItems,
    itemCategoryLabel,
    itemTypeLabel,
    structureFormDiagnostics,
    actionLoading,
    submit: handleSaveStructure,
  };

  const gradeDialogViewModel = {
    open: gradeDialogOpen,
    editingGradeLevelId,
    close: closeGradeDialog,
    EMPTY_VALUE,
    gradeForm,
    setGradeForm,
    sortedJobLevels,
    gradeFormDiagnostics,
    formatCurrency,
    actionLoading,
    submit: handleSetGrade,
  };

  const insuranceSchemeDialogViewModel = {
    open: insuranceSchemeDialogOpen,
    editingInsuranceSchemeId,
    close: closeInsuranceSchemeDialog,
    insuranceSchemeForm,
    setInsuranceSchemeForm,
    statusOptions,
    formatPercent,
    insuranceSchemeFormDiagnostics,
    actionLoading,
    submit: handleSaveInsuranceScheme,
  };

  const taxConfigDialogViewModel = {
    open: taxConfigDialogOpen,
    close: closeTaxConfigDialog,
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
    submit: handleSaveTaxConfig,
  };

  const taxDeductionDialogViewModel = {
    open: taxDeductionDialogOpen,
    close: closeTaxDeductionDialog,
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
    submit: handleSaveTaxDeduction,
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
    taxDeductionStatusClass,
    taxDeductionStatusLabel,
    activeTaxDeductionIds,
    openTaxDeductionEditDialog,
    handleDeleteTaxDeduction,
  };

  const renderFoundationSection = () => {
    switch (currentSection) {
      case 'items':
        return (
          <SalaryItemsSection
            components={foundationSectionComponents}
            enabledSalaryItems={enabledSalaryItems}
            salaryItems={salaryItems}
            linkedSalaryItems={linkedSalaryItems}
            orphanSalaryItems={orphanSalaryItems}
            formulaSalaryItems={formulaSalaryItems}
            salaryItemUsageMap={salaryItemUsageMap}
            itemTypeLabel={itemTypeLabel}
            itemCategoryLabel={itemCategoryLabel}
            openItemDialog={openItemDialog}
            openItemEditDialog={openItemEditDialog}
            handleDeleteItem={handleDeleteItem}
            actionLoading={actionLoading}
            foundationLoading={foundationLoading}
          />
        );
      case 'structures':
        return (
          <SalaryStructuresSection
            components={foundationSectionComponents}
            salaryStructures={salaryStructures}
            selectedStructureId={selectedStructureId}
            setSelectedStructureId={setSelectedStructureId}
            structureStatusClass={structureStatusClass}
            structureDetail={structureDetail}
            structureDetailLoading={structureDetailLoading}
            openStructureDialog={openStructureDialog}
            openStructureEditDialog={openStructureEditDialog}
            handleDeleteStructure={handleDeleteStructure}
            actionLoading={actionLoading}
            structureLinkedEmployeeIds={structureLinkedEmployeeIds}
            structureLinkedSalaryStats={structureLinkedSalaryStats}
            structureItemStats={structureItemStats}
            selectedStructureDeleteDiagnostics={selectedStructureDeleteDiagnostics}
            structureLinkedEmployeeRecords={structureLinkedEmployeeRecords}
            focusStructureEmployees={focusStructureEmployees}
            structureLinkedEmployeeRows={structureLinkedEmployeeRows}
            employeeMap={employeeMap}
            formatCurrency={formatCurrency}
            isFutureDate={isFutureDate}
            focusEmployeeWorkspace={focusEmployeeWorkspace}
            itemCategoryLabel={itemCategoryLabel}
            itemTypeLabel={itemTypeLabel}
          />
        );
      case 'grades':
        return (
          <SalaryGradesSection
            components={foundationSectionComponents}
            activeJobLevels={activeJobLevels}
            sortedSalaryGrades={sortedSalaryGrades}
            pendingGradeLevels={pendingGradeLevels}
            highestSalaryGrade={highestSalaryGrade}
            salaryGradeRiskSummary={salaryGradeRiskSummary}
            salaryGradeRiskItems={salaryGradeRiskItems}
            gradeSeriesCoverage={gradeSeriesCoverage}
            openGradeDialog={openGradeDialog}
            salaryGradeDiagnostics={salaryGradeDiagnostics}
            jobLevelMap={jobLevelMap}
            formatCurrency={formatCurrency}
            openGradeEditDialog={openGradeEditDialog}
            handleDeleteGrade={handleDeleteGrade}
            actionLoading={actionLoading}
            foundationLoading={foundationLoading}
          />
        );
      case 'insurance':
        return (
          <SalaryInsuranceSection
            components={foundationSectionComponents}
            openInsuranceSchemeDialog={openInsuranceSchemeDialog}
            insuranceSchemeStats={insuranceSchemeStats}
            insuranceSchemeRiskSummary={insuranceSchemeRiskSummary}
            insuranceSchemeRiskItems={insuranceSchemeRiskItems}
            insuranceSchemeCityFilter={insuranceSchemeCityFilter}
            setInsuranceSchemeCityFilter={setInsuranceSchemeCityFilter}
            insuranceSchemeStatusFilter={insuranceSchemeStatusFilter}
            setInsuranceSchemeStatusFilter={setInsuranceSchemeStatusFilter}
            insuranceSchemeCityOptions={insuranceSchemeCityOptions}
            ALL_VALUE={ALL_VALUE}
            currentEmployeeRecord={currentEmployeeRecord}
            currentSelectedEmployeeLabel={currentSelectedEmployeeLabel}
            activeLinkedInsuranceSchemes={activeLinkedInsuranceSchemes}
            unusedInsuranceSchemes={unusedInsuranceSchemes}
            expiredOnlyInsuranceSchemes={expiredOnlyInsuranceSchemes}
            filteredInsuranceSchemes={filteredInsuranceSchemes}
            insuranceSchemeUsageMap={insuranceSchemeUsageMap}
            structureStatusClass={structureStatusClass}
            formatCurrency={formatCurrency}
            formatPercent={formatPercent}
            openInsuranceSchemeEditDialog={openInsuranceSchemeEditDialog}
            openInsuranceAssignDialogWithScheme={openInsuranceAssignDialogWithScheme}
            actionLoading={actionLoading}
            foundationLoading={foundationLoading}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="cf-tabs w-full justify-start overflow-x-auto lg:w-auto">
              {SALARY_SECTION_NAV_ITEMS.map(item => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => goSalarySection(item.value)}
                  className={cn(
                    'cf-tab shrink-0',
                    currentSection === item.value && 'cf-tab-active',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={openAssignDialog}
                disabled={!assignableEmployees.length || !enabledSalaryStructures.length}
              >
                分配薪资
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={openAdjustDialog}
                disabled={!employeesWithSalary.length}
              >
                发起调薪
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void Promise.all([loadFoundationData(), loadEmployeeSalaryList(), loadAdjustmentList()]);
                }}
              >
                刷新数据
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            {currentSection === 'employees' && (
              <SalaryEmployeesSection
                components={primarySectionComponents}
                viewModel={employeesSectionViewModel}
              />
            )}
            {currentSection === 'adjustments' && (
              <SalaryAdjustmentsSection
                components={primarySectionComponents}
                viewModel={adjustmentsSectionViewModel}
              />
            )}
            {FOUNDATION_SECTIONS.includes(currentSection as FoundationSection) && renderFoundationSection()}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialogState.open}
        title={confirmDialogState.title}
        message={confirmDialogState.message}
        confirmText={confirmDialogState.confirmText}
        cancelText={confirmDialogState.cancelText}
        danger={confirmDialogState.danger}
        onConfirm={() => void handleConfirmDialogConfirm()}
        onCancel={closeConfirmDialog}
      />

      <SalaryItemDialog
        components={foundationDialogComponents}
        viewModel={itemDialogViewModel}
      />

      <SalaryStructureDialog
        components={foundationDialogComponents}
        viewModel={structureDialogViewModel}
      />

      <SalaryGradeDialog
        components={foundationDialogComponents}
        viewModel={gradeDialogViewModel}
      />

      <InsuranceSchemeDialog
        components={foundationDialogComponents}
        viewModel={insuranceSchemeDialogViewModel}
      />

      <TaxConfigDialog
        components={taxDialogComponents}
        viewModel={taxConfigDialogViewModel}
      />

      <TaxDeductionDialog
        components={taxDialogComponents}
        viewModel={taxDeductionDialogViewModel}
      />

      <InsuranceAssignDialog
        components={dialogSectionComponents}
        viewModel={insuranceAssignDialogViewModel}
      />

      <AssignSalaryDialog
        components={dialogSectionComponents}
        viewModel={assignDialogViewModel}
      />

      <CreateAdjustmentDialog
        components={dialogSectionComponents}
        viewModel={adjustDialogViewModel}
      />
    </>
  );
};

export default HrSalaryPage;

