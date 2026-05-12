import { DeptTreeNode, HrEmployee } from '@/services/api/hr';

export type HrOptionLike = { label: unknown; value: string | number };

export const HR_CITY_OPTIONS = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '南京',
  '苏州',
  '成都',
  '重庆',
  '武汉',
  '西安',
  '天津',
  '青岛',
  '宁波',
  '厦门',
  '长沙',
  '郑州',
  '合肥',
  '福州',
  '济南',
  '无锡',
  '东莞',
  '佛山',
  '沈阳',
  '大连',
  '长春',
  '哈尔滨',
  '石家庄',
  '太原',
  '呼和浩特',
  '南昌',
  '南宁',
  '贵阳',
  '昆明',
  '兰州',
  '银川',
  '西宁',
  '乌鲁木齐',
  '海口',
  '三亚',
  '温州',
  '嘉兴',
  '绍兴',
  '金华',
  '常州',
  '南通',
  '徐州',
  '扬州',
  '泉州',
  '珠海',
  '中山',
  '惠州',
  '南昌',
  '洛阳',
  '襄阳',
  '宜昌',
  '株洲',
  '绵阳',
  '南充',
  '遵义',
  '唐山',
  '保定',
].filter((city, index, list) => list.indexOf(city) === index).map((city) => ({ label: city, value: city }));

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

  nodes.forEach(node => {
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
  return [employee.employeeNo, employee.name, employee.deptName, employee.postName, employee.positionName]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(normalizedKeyword));
};

export const buildEmployeeLabel = (employee: HrEmployee) =>
  [employee.employeeNo, employee.name, employee.deptName].filter(Boolean).join(' / ');

export const toDateInputValue = (value?: string | null) =>
  value ? String(value).slice(0, 10) : '';

export const formatDateValue = (value?: unknown) => {
  if (!value) return '-';
  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || text;
};

export const formatDateTimeValue = (value?: unknown) => {
  if (!value) return '-';
  const text = String(value).replace('T', ' ');
  const match = text.match(/^(\d{4}-\d{2}-\d{2})\s?(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : text;
};

export const formatMoneyValue = (value?: unknown, currency = 'CNY') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const yesNoLabel = (value?: unknown) =>
  Number(value) === 1 || value === true || String(value).toUpperCase() === 'TRUE' ? '是' : '否';

export const enumLabel = (labels: Record<string, string>, value?: unknown) => {
  if (value == null || value === '') return '-';
  return labels[String(value).toUpperCase()] || String(value);
};

export const optionLabelText = (label: unknown) =>
  typeof label === 'string' || typeof label === 'number' ? String(label) : '';

export const optionLabel = (options: HrOptionLike[], value?: unknown) => {
  if (value == null || value === '') return '-';
  const option = options.find((item) => String(item.value) === String(value));
  return optionLabelText(option?.label) || String(value);
};

export const idFallbackLabel = (prefix: string, value?: unknown) =>
  value == null || value === '' ? '-' : `${prefix} #${value}`;

export const optionOrIdLabel = (prefix: string, options: HrOptionLike[], value?: unknown) => {
  if (value == null || value === '') return '-';
  const option = options.find((item) => String(item.value) === String(value));
  return optionLabelText(option?.label) || idFallbackLabel(prefix, value);
};

export const buildOptionLabelMap = (options: HrOptionLike[]) => {
  const map = new Map<string, string>();
  options.forEach((option) => {
    map.set(String(option.value), optionLabelText(option.label) || String(option.value));
  });
  return map;
};

// 前端动作按钮直接复用后端状态机，避免用户点到后端明确不允许的流转。
export const hasWorkflowStatus = (status: string | null | undefined, ...allowed: string[]) =>
  allowed.includes(String(status || '').toUpperCase());
