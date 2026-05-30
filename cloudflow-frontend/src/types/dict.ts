/**
 * 字典系统类型定义
 *
 * 用于前端字典数据的类型定义，与后端 SysDictData 对应
 */

/** 状态颜色名称（与 enumLabels.ts 保持一致） */
export type StatusColorName =
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'slate'
  | 'violet'
  | 'orange'
  | 'teal';

/**
 * 前端字典项
 * 从后端 SysDictData 转换而来，增加了前端样式相关的扩展字段
 */
export interface DictItem {
  /** 字典标签（显示文本） - 对应后端 dictLabel */
  label: string;

  /** 字典值（实际值） - 对应后端 dictValue */
  value: string;

  /** 排序号 - 对应后端 dictSort */
  sort: number;

  /** 列表样式类（success/warning/danger/info/primary） - 对应后端 listClass */
  listClass?: string;

  /** 自定义 CSS 类 - 对应后端 cssClass */
  cssClass?: string;

  /** 是否为默认值 - 对应后端 isDefault === 'Y' */
  isDefault?: boolean;

  // ========== 扩展字段（前端计算生成，兼容 StatusMeta） ==========

  /** 颜色名称（从 listClass 映射而来） */
  colorName?: StatusColorName;

  /** 完整 Tailwind 类（包含 light + dark mode） */
  fullClass?: string;

  /** 简化样式类（向后兼容旧代码） */
  tone?: string;
}

/**
 * useDict Hook 配置选项
 */
export interface UseDictOptions {
  /** 是否启用查询（默认 true） */
  enabled?: boolean;

  /** 数据过期时间（毫秒，默认 10 分钟） */
  staleTime?: number;

  /** 挂载时是否重新获取（默认 false） */
  refetchOnMount?: boolean;
}

/**
 * useDict Hook 返回结果
 */
export interface UseDictResult {
  /** 字典数据列表 */
  data: DictItem[] | undefined;

  /** 是否正在加载 */
  isLoading: boolean;

  /** 是否加载失败 */
  isError: boolean;

  /** 错误信息 */
  error: Error | null;

  /** 重新获取数据 */
  refetch: () => Promise<void>;

  // ========== 便捷方法 ==========

  /**
   * 根据 value 获取 label
   * @param value 字典值
   * @returns 字典标签，未找到时返回原值
   */
  getLabel: (value: string) => string;

  /**
   * 根据 value 获取完整字典项
   * @param value 字典值
   * @returns 字典项，未找到时返回 undefined
   */
  getItem: (value: string) => DictItem | undefined;

  /**
   * 获取下拉选项列表
   * @returns { label, value } 数组
   */
  getOptions: () => Array<{ label: string; value: string }>;
}
