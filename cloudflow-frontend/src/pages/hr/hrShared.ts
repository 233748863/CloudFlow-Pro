import { DeptTreeNode, HrEmployee } from '@/services/api/hr';

export const normalizeRows = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];

  if (typeof data === 'object') {
    const value = data as { records?: unknown; rows?: unknown };
    if (Array.isArray(value.records)) return value.records as T[];
    if (Array.isArray(value.rows)) return value.rows as T[];
  }

  return [];
};

export const flattenDeptTree = (nodes: DeptTreeNode[] = [], prefix = ''): Array<{ label: string; value: number }> => {
  const result: Array<{ label: string; value: number }> = [];

  nodes.forEach((node) => {
    const currentLabel = prefix ? `${prefix} / ${node.deptName}` : node.deptName;
    result.push({ label: currentLabel, value: node.deptId });

    if (node.children?.length) {
      result.push(...flattenDeptTree(node.children, currentLabel));
    }
  });

  return result;
};

export const matchEmployeeKeyword = (employee: HrEmployee, keyword: string) => {
  if (!keyword.trim()) return true;

  const normalizedKeyword = keyword.trim().toLowerCase();
  return [employee.employeeNo, employee.name, employee.deptName, employee.postName]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedKeyword));
};

export const buildEmployeeLabel = (employee: HrEmployee) =>
  [employee.employeeNo, employee.name, employee.deptName].filter(Boolean).join(' / ');

export const toDateInputValue = (value?: string | null) =>
  value ? String(value).slice(0, 10) : '';
