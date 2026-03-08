import React from 'react';
import { List } from 'react-window';

interface VirtualListProps<T> {
  /** 数据列表 */
  items: T[];
  /** 每项高度（像素） */
  itemHeight: number;
  /** 列表高度（像素） */
  height: number;
  /** 列表宽度（像素或百分比） */
  width?: number | string;
  /** 渲染每一项的函数 */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 空状态组件 */
  emptyComponent?: React.ReactNode;
}

interface VirtualListRowProps<T> {
  index: number;
  style: React.CSSProperties;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
}

function VirtualListRow<T>({
  index,
  style,
  items,
  renderItem,
}: VirtualListRowProps<T>) {
  return <div style={style}>{renderItem(items[index], index)}</div>;
}

/**
 * 虚拟滚动列表组件
 * 使用 react-window 实现高性能长列表渲染
 * 适用于任务列表、表单列表等大数据量场景
 */
export function VirtualList<T>({
  items,
  itemHeight,
  height,
  width = '100%',
  renderItem,
  className = '',
  emptyComponent,
}: VirtualListProps<T>) {
  if (items.length === 0 && emptyComponent) {
    return <>{emptyComponent}</>;
  }

  return (
    <List
      className={className}
      defaultHeight={height}
      rowComponent={VirtualListRow as never}
      rowCount={items.length}
      rowHeight={itemHeight}
      rowProps={{ items, renderItem } as never}
      style={{ height, width }}
    />
  );
}
