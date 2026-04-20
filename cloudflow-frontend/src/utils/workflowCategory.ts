/**
 * 流程分类统一工具。
 *
 * 这里负责把后端历史分类值统一映射成前端约定的标准分类编码，
 * 避免筛选按钮、卡片徽标和流程设置弹窗各自维护一套分类字典。
 */
export const WORKFLOW_CATEGORY_OPTIONS = [
  { value: 'office', label: '行政办公' },
  { value: 'finance', label: '财务管理' },
  { value: 'hr', label: '人事管理' },
  { value: 'sales', label: '销售业务' },
  { value: 'it', label: 'IT 运维' },
  { value: 'production', label: '生产制造' },
  { value: 'quality', label: '质量管理' },
  { value: 'project', label: '项目管理' },
  { value: 'other', label: '其他' },
] as const;

export type WorkflowCategoryValue = (typeof WORKFLOW_CATEGORY_OPTIONS)[number]['value'];

export const WORKFLOW_CATEGORY_LABELS: Record<WorkflowCategoryValue, string> = {
  office: '行政办公',
  finance: '财务管理',
  hr: '人事管理',
  sales: '销售业务',
  it: 'IT 运维',
  production: '生产制造',
  quality: '质量管理',
  project: '项目管理',
  other: '其他',
};

const normalizeCategoryToken = (value: string): string =>
  value.trim().toLowerCase().replace(/[\s_-]+/g, '');

const WORKFLOW_CATEGORY_ALIAS_MAP: Record<string, WorkflowCategoryValue> = {
  office: 'office',
  oa: 'office',
  admin: 'office',
  administration: 'office',
  行政: 'office',
  办公: 'office',
  行政办公: 'office',

  finance: 'finance',
  financial: 'finance',
  财务: 'finance',
  财务管理: 'finance',
  财务审批: 'finance',

  hr: 'hr',
  humanresource: 'hr',
  humanresources: 'hr',
  personnel: 'hr',
  人事: 'hr',
  人事管理: 'hr',

  sales: 'sales',
  sale: 'sales',
  销售: 'sales',
  销售业务: 'sales',
  业务销售: 'sales',

  it: 'it',
  tech: 'it',
  technology: 'it',
  运维: 'it',
  it运维: 'it',
  it管理: 'it',
  信息技术: 'it',

  production: 'production',
  industry: 'production',
  manufacturing: 'production',
  manufacture: 'production',
  生产: 'production',
  制造: 'production',
  生产制造: 'production',
  行业专属: 'production',

  quality: 'quality',
  qa: 'quality',
  qc: 'quality',
  质量: 'quality',
  品质: 'quality',
  质量管理: 'quality',

  project: 'project',
  pm: 'project',
  项目: 'project',
  项目管理: 'project',

  other: 'other',
  others: 'other',
  misc: 'other',
  general: 'other',
  其他: 'other',
};

/**
 * 将任意来源的流程分类统一成标准编码。
 *
 * 示例：
 * - `OA` -> `office`
 * - `行政办公` -> `office`
 * - `industry` -> `production`
 */
export const normalizeWorkflowCategory = (rawCategory: unknown): string => {
  if (typeof rawCategory !== 'string') {
    return '';
  }

  const trimmed = rawCategory.trim();
  if (!trimmed) {
    return '';
  }

  const normalizedToken = normalizeCategoryToken(trimmed);
  return WORKFLOW_CATEGORY_ALIAS_MAP[normalizedToken] || trimmed;
};

/**
 * 读取流程分类的展示名称。
 * 未识别的自定义分类保持原样回显，避免错误映射。
 */
export const getWorkflowCategoryLabel = (rawCategory: unknown): string => {
  const normalized = normalizeWorkflowCategory(rawCategory);
  if (!normalized) {
    return '';
  }

  return WORKFLOW_CATEGORY_LABELS[normalized as WorkflowCategoryValue] || String(rawCategory).trim();
};
