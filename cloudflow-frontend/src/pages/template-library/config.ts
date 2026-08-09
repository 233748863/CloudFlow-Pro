export const TEXT = {
  pageTitle: "模板库",
  pageDescription:
    "从系统模板快速创建流程，让流程设计与发布体验保持在同一套工作台视觉语言下。",
  createFromTemplateTitle: "从模板创建流程",
  createFromTemplateDescription:
    "先筛选合适模板，再带入流程定义进入设计器；没有合适模板时也可以直接空白创建。",
  allTemplates: "全部模板",
  categoryNavigation: "分类导航",
  categoryNavigationDesc: "按业务分类缩小模板范围，让流程设计入口更集中。",
  commonTags: "常用标签",
  commonTagsDesc: "直接点选常见业务标签，快速筛选当前模板。",
  searchPlaceholder: "搜索模板名称、描述或分类...",
  clearFilters: "清空筛选",
  gridView: "卡片视图",
  listView: "列表视图",
  tableView: "表格视图",
  currentResults: "当前结果",
  categoryCount: "分类数",
  activeFilters: "已生效筛选",
  currentView: "当前视图",
  noDescription: "暂无描述",
  systemTemplate: "系统",
  systemTemplateHint: "当前页可直接复用的系统模板",
  preview: "预览",
  useTemplate: "使用模板",
  templateUsage: "使用次数",
  nodeCount: "节点数",
  edgeCount: "连线数",
  category: "分类",
  tags: "标签",
  uncategorized: "未分类",
  loadTemplatesFailed: "加载模板列表失败",
  loadCategoriesFailed: "加载模板分类失败",
  loadTagsFailed: "加载模板推荐标签失败",
  emptyTitle: "暂无匹配模板",
  emptyDescription: "可以尝试清除筛选条件，或切换到其他分类查找流程模板。",
  retry: "重试",
  previewTitleSuffix: "模板预览",
  previewOverview: "模板概览",
  previewStructure: "流程结构预览",
  previewStructureDesc: "直接展示流程节点与连线结构，减少来回跳转查看。",
  templateInfo: "模板信息",
  nodeTypes: "节点类型",
  nodeList: "节点清单",
  edgeList: "连线清单",
  edgeNotFound: "未解析到连线信息",
  invalidDefinition:
    "未解析到流程定义节点，请检查模板 definition 字段是否为标准 JSON 结构。",
  close: "关闭",
  createWorkflowFromTemplate: "从模板创建流程",
  createWorkflowDesc:
    "使用当前模板创建新流程，系统会自动带入已选模板的 nodes 和 edges 定义。",
  workflowName: "流程名称",
  workflowNameRequired: "请输入流程名称",
  workflowNamePlaceholder: "请输入流程名称",
  workflowDescriptionLabel: "流程描述",
  workflowDescriptionPlaceholder: "请输入流程描述（可选）",
  cancel: "取消",
  create: "创建",
  createSuccess: "流程创建成功",
  createFailed: "从模板创建流程失败",
  loginRequired: "请先登录后再使用模板创建流程",
  useTemplateTitle: "使用模板创建流程",
  noCategoryDesc:
    "系统还没有配置模板分类，仍可以通过关键词和标签查找模板。",
  defaultViewHint: "当前显示默认视图",
  gridDescription: "按卡片浏览模板摘要、分类和使用入口。",
  listDescription: "按列表横向比较模板结构、标签与使用频次。",
  backToCreate: "返回创建方式",
  createBlank: "直接空白创建",
} as const;

export const DEFAULT_COMMON_TAGS = [
  "审批",
  "请假",
  "报销",
  "采购",
  "合同",
  "财务",
  "人事",
];

export const FILTER_CHIP_CLASS_NAME =
  "inline-flex items-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-1 text-sm text-cf-body shadow-none transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-cyan-900/70 dark:hover:bg-cyan-950/30 dark:hover:text-cyan-200";

export const PREVIEW_META_LABEL_CLASS_NAME =
  "text-[10px] font-bold text-cf-faint";

export const PREVIEW_SECTION_HEADER_CLASS_NAME =
  "border-b border-slate-100 px-5 py-3 text-[11px] font-bold text-cf-subtle dark:border-slate-800";

export const NODE_TYPE_LABELS: Record<string, string> = {
  START: "开始",
  APPROVAL: "审批",
  END: "结束",
  CC: "抄送",
  CONDITION: "条件",
  PARALLEL: "并行",
  TIMER: "定时",
  SUB_PROCESS: "子流程",
};
