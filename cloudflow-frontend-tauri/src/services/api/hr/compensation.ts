import request from '@/services/api/request';
import { parseMaybeJson, withList } from './internals';
import type {
  EmployeeInsurance,
  EmployeeInsuranceAssignPayload,
  EmployeeInsuranceDetail,
  EmployeeSalary,
  EmployeeSalaryAssignPayload,
  EmployeeSalaryDetail,
  EmployeeTaxDeduction,
  EmployeeTaxDeductionPayload,
  EmployeeTaxDeductionUpdatePayload,
  HrPagedResult,
  HrRecord,
  InsuranceCalculation,
  InsuranceScheme,
  InsuranceSchemePayload,
  JobLevelOption,
  SalaryAdjustment,
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
} from './types';

const normalizeSalaryItem = (item: SalaryItem): SalaryItem => ({
  ...item,
  itemCode: item.itemCode || item.componentCode,
  itemName: item.itemName || item.componentName,
  itemType: item.itemType || item.componentType,
  componentCode: item.componentCode || item.itemCode,
  componentName: item.componentName || item.itemName,
  componentType: item.componentType || item.itemType,
  isTaxable: item.isTaxable ?? item.taxable,
  taxable: item.taxable ?? item.isTaxable,
});

const normalizeSalaryStructure = (item: SalaryStructure): SalaryStructure => {
  const componentConfig = parseMaybeJson<{ itemIds?: number[] }>(item.componentConfig, {});
  return {
    ...item,
    itemIds: item.itemIds || componentConfig.itemIds || [],
  };
};

const normalizeEmployeeSalary = (item: EmployeeSalary): EmployeeSalary => ({
  ...item,
  salaryData: item.salaryData || item.componentValues || {},
});

const normalizeEmployeeSalaryDetail = async (item: EmployeeSalaryDetail): Promise<EmployeeSalaryDetail> => {
  if (!item) return {} as EmployeeSalaryDetail;
  const normalized = normalizeEmployeeSalary(item) as EmployeeSalaryDetail;
  const amountMap = parseMaybeJson<Record<string, number | string | null>>(normalized.salaryData, {});
  const structure = normalized.structureId ? await getSalaryStructure(normalized.structureId).catch(() => null) : null;
  return {
    ...normalized,
    items: (structure?.items || []).map((salaryItem) => ({
      ...salaryItem,
      itemId: salaryItem.id,
      amount: amountMap[String(salaryItem.id)] ?? null,
    })),
  };
};

export const listSalaryItems = async () => (await request.get<SalaryItem[]>('/hr/compensation/components')).map(normalizeSalaryItem);
export const createSalaryItem = (data: SalaryItemPayload) => request.post<number>('/hr/compensation/components', { ...data, componentCode: data.componentCode || data.itemCode, componentName: data.componentName || data.itemName, componentType: data.componentType || data.itemType });
export const updateSalaryItem = (id: number, data: Partial<SalaryItemPayload>) => request.put<void>(`/hr/compensation/components/${id}`, data);
export const deleteSalaryItem = (id: number) => request.delete<void>(`/hr/compensation/components/${id}`);

export const listSalaryStructures = async () => (await request.get<SalaryStructure[]>('/hr/compensation/structures')).map(normalizeSalaryStructure);
export const getSalaryStructure = async (id: number) => {
  const structure = (await listSalaryStructures()).find((item) => item.id === id) as SalaryStructureDetail;
  const items = await listSalaryItems();
  return {
    ...structure,
    items: items.filter((item) => (structure.itemIds || []).includes(item.id)),
  };
};
export const createSalaryStructure = (data: SalaryStructurePayload) =>
  request.post<number>('/hr/compensation/structures', { ...data, componentConfig: { itemIds: data.itemIds || [] } });
export const updateSalaryStructure = (id: number, data: Partial<SalaryStructurePayload>) =>
  request.put<void>(`/hr/compensation/structures/${id}`, { ...data, componentConfig: { itemIds: data.itemIds || [] } });
export const deleteSalaryStructure = (id: number) => request.delete<void>(`/hr/compensation/structures/${id}`);

export const listSalaryGrades = () => request.get<SalaryGrade[]>('/hr/compensation/grades');
export const setSalaryGrade = (data: SalaryGradePayload) => request.post<void>('/hr/compensation/grades', data);
export const deleteSalaryGrade = (levelId: number) => request.delete<void>(`/hr/compensation/grades/${levelId}`);

export const listJobLevels = (params?: { levelSeries?: string }) => request.get<JobLevelOption[]>('/hr/organization/levels', { params });

export const assignSalaryStructure = (data: EmployeeSalaryAssignPayload) =>
  request.post<void>('/hr/compensation/employee-compensations', { ...data, componentValues: data.componentValues || data.salaryData });
export const getEmployeeSalary = async (employeeId: number) =>
  normalizeEmployeeSalaryDetail((await listEmployeeSalaries({ employeeId }))[0] as EmployeeSalaryDetail);
export const listEmployeeSalaries = async (params?: HrRecord) =>
  (await request.get<EmployeeSalary[]>('/hr/compensation/employee-compensations', { params })).map(normalizeEmployeeSalary);

export const createSalaryAdjustment = (data: SalaryAdjustmentPayload) => request.post<number>('/hr/compensation/changes', { ...data, changeNo: data.changeNo || data.applicationNo || `HRCG${Date.now()}` });
export const submitSalaryAdjustment = (id: number) => request.post<void>(`/hr/compensation/changes/${id}/submit`);
export const approveSalaryAdjustment = (id: number) => request.post<void>(`/hr/compensation/changes/${id}/approve`);
export const effectiveSalaryAdjustment = (id: number) => request.post<void>(`/hr/compensation/changes/${id}/effective`);
export const getSalaryAdjustment = async (id: number) => withList(await listSalaryAdjustments({ pageNum: 1, pageSize: 500 })).find((item) => item.id === id) as SalaryAdjustment;
export const listSalaryAdjustments = (params?: HrRecord) => request.get<HrPagedResult<SalaryAdjustment>>('/hr/compensation/changes', { params });
export const getSalaryAdjustmentHistory = async (employeeId: number) => withList(await listSalaryAdjustments({ employeeId, pageNum: 1, pageSize: 500 }));

export const listInsuranceSchemes = () => request.get<InsuranceScheme[]>('/hr/compensation/benefits');
export const createInsuranceScheme = (data: InsuranceSchemePayload) => request.post<number>('/hr/compensation/benefits', { ...data, schemeCode: data.schemeCode || `BEN${Date.now()}`, benefitConfig: data.benefitConfig || {} });
export const updateInsuranceScheme = (id: number, data: Partial<InsuranceSchemePayload>) => request.put<void>(`/hr/compensation/benefits/${id}`, data);
export const assignInsuranceScheme = (data: EmployeeInsuranceAssignPayload) => request.post<void>('/hr/compensation/employee-benefits', data);
export const getEmployeeInsurance = async (employeeId: number) => withList(await listEmployeeInsurances({ employeeId } as HrRecord))[0] as EmployeeInsuranceDetail;
export const listEmployeeInsurances = (params?: HrRecord) => request.get<HrPagedResult<EmployeeInsurance>>('/hr/compensation/employee-benefits', { params });
export const listEmployeeBenefits = (params?: HrRecord) =>
  request.get<HrPagedResult<EmployeeInsurance>>('/hr/compensation/employee-benefits', { params });
export const calculateEmployeeInsurance = async (employeeId: number, salary = 0) => ({
  employeeId,
  salary,
  base: salary,
  personalTotalAmount: 0,
  companyTotalAmount: 0,
}) as InsuranceCalculation;

export const listTaxProfiles = (params?: HrRecord) =>
  request.get<HrRecord[]>('/hr/compensation/tax-profiles', { params });
export const createTaxConfig = (data: TaxConfigPayload) => request.post<number>('/hr/compensation/tax-profiles', data);
export const updateTaxConfig = (id: number, data: Partial<TaxConfigPayload>) => request.put<void>(`/hr/compensation/tax-profiles/${id}`, data);
export const getCurrentTaxConfig = async () => ({ threshold: 5000 }) as TaxConfig;

export const addTaxDeduction = (data: EmployeeTaxDeductionPayload) => request.post<number>('/hr/compensation/tax-deductions', data);
export const updateTaxDeduction = (id: number, data: EmployeeTaxDeductionUpdatePayload) => request.put<void>(`/hr/compensation/tax-deductions/${id}`, data);
export const deleteTaxDeduction = (id: number) => request.delete<void>(`/hr/compensation/tax-deductions/${id}`);
export const listTaxDeductions = (employeeId: number, year?: number, month?: number) =>
  request.get<EmployeeTaxDeduction[]>('/hr/compensation/tax-deductions', { params: { employeeId, year, month } });
export const listTaxDeductionRecords = (params?: HrRecord) =>
  request.get<EmployeeTaxDeduction[]>('/hr/compensation/tax-deductions', { params });
export const listActiveTaxDeductions = (employeeId: number, year?: number, month?: number) =>
  listTaxDeductions(employeeId, year, month);

export const calculateTax = async (data: HrRecord) => {
  const taxableIncome = Number(data.taxableIncome || 0);
  const taxableAmount = Math.max(taxableIncome - 5000, 0);
  return {
    ...data,
    taxableIncome,
    totalDeduction: 0,
    taxableAmount,
    taxAmount: 0,
    afterTaxIncome: Number((taxableIncome - 0).toFixed(2)),
  } as TaxCalculation;
};
