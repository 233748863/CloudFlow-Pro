import { useState } from "react";
import { Input } from "../common/input";

export interface CandidateChipItem {
  /** 唯一标识 (用于 key 与选中判断) */
  id: string;
  /** 已选值 (传给 onToggle) */
  value: string;
  /** 主显示名称 */
  label: string;
  /** 次级文本 (可选: 角色 key / 用户名) */
  caption?: string;
}

export interface CandidateChipListProps {
  /** 整列表标题 (例如 "选择角色") */
  title: string;
  /** 是否多选 */
  multiple: boolean;
  /** 是否处于加载态 */
  loading: boolean;
  /** 搜索占位符 */
  searchPlaceholder: string;
  /** 是否强制显示搜索框 (默认在 items > 5 时显示) */
  alwaysShowSearch?: boolean;
  /** 候选项 */
  items: CandidateChipItem[];
  /** 当前已选 value 数组 */
  selectedValues: string[];
  /** 选中态切换 */
  onToggle: (value: string) => void;
  /** 暂无数据文案 (默认 "暂无数据") */
  emptyText?: string;
  /** 搜索过滤函数 (默认按 label 与 caption 模糊匹配) */
  filterFn?: (item: CandidateChipItem, keyword: string) => boolean;
}

const defaultFilter = (item: CandidateChipItem, keyword: string) => {
  if (!keyword) return true;
  return (
    item.label.includes(keyword) ||
    (item.caption ? item.caption.includes(keyword) : false)
  );
};

/**
 * 通用候选项列表 - 支持单选/多选 + 搜索 + 已选标签条
 * 由 ApproverValueSelector 复用以替代原先 ROLE/USER/DEPT 三段几乎复制的渲染代码。
 */
export const CandidateChipList = ({
  title,
  multiple,
  loading,
  searchPlaceholder,
  alwaysShowSearch,
  items,
  selectedValues,
  onToggle,
  emptyText = "暂无数据",
  filterFn = defaultFilter,
}: CandidateChipListProps) => {
  const [searchText, setSearchText] = useState("");
  const filtered = items.filter((item) => filterFn(item, searchText));
  const showSearch = alwaysShowSearch || items.length > 5;

  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {title}
        {multiple ? "（可多选）" : ""}
      </span>
      {loading ? (
        <div className="py-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
          加载中...
        </div>
      ) : (
        <>
          {showSearch && (
            <Input
              className="mb-2 h-8 text-xs"
              placeholder={searchPlaceholder}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          )}
          <div className="max-h-[168px] overflow-y-auto rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950">
            {filtered.length === 0 ? (
              <div className="py-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
                {emptyText}
              </div>
            ) : (
              filtered.map((item) => {
                const isSelected = selectedValues.includes(item.value);
                return (
                  <div
                    key={item.id}
                    onClick={() => onToggle(item.value)}
                    className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors ${
                      isSelected
                        ? "bg-[var(--cf-surface-muted)] text-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        : "text-slate-600 hover:bg-[var(--cf-surface-muted)] dark:text-slate-300 dark:hover:bg-slate-900/80"
                    }`}
                  >
                    <div
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? "border-slate-700 bg-slate-700 dark:border-cyan-500 dark:bg-cyan-500"
                          : "border-slate-300 dark:border-slate-700"
                      }`}
                    >
                      {isSelected && (
                        <span className="text-[10px] text-white">
                          ✓
                        </span>
                      )}
                    </div>
                    <span className="font-medium">{item.label}</span>
                    {item.caption && (
                      <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
                        {item.caption}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {selectedValues.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedValues.map((v) => {
                const item = items.find((it) => it.value === v);
                return (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
                  >
                    {item?.label || v}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(v);
                      }}
                      className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
