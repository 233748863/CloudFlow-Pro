import { useEffect, useRef } from 'react';

export interface FrozenColumnsOptions {
  /** 左侧冻结列数，从第 1 列起 */
  left?: number;
  /** 右侧冻结列数，从最后 1 列起 */
  right?: number;
  /** 关掉冻结（例如移动端窄屏不需要） */
  disabled?: boolean;
}

/** 清掉之前写在单元格上的冻结样式，避免列数变化后残留 */
function resetCell(cell: HTMLTableCellElement) {
  cell.style.position = '';
  cell.style.left = '';
  cell.style.right = '';
  delete cell.dataset.cfPin;
  delete cell.dataset.cfPinEdge;
}

/**
 * 给表格加冻结列。
 *
 * 偏移量按前序列的实际渲染宽度累加，不需要手写列宽；表格尺寸变化时自动重算。
 * 视觉部分（底色、层级、边界分隔线）由 index.css 里 `.cf-table-sticky` 一族规则负责，
 * 本 hook 只负责写 `position: sticky` 与 `left/right`，以及打上 data-cf-pin 标记。
 *
 * 一列的场景其实纯 CSS 就能做（left: 0），用这个 hook 是为了支持多列与自动宽度。
 *
 * 已知限制：靠 `row.cells` 的下标定位列，含 colspan 的表格会错位，这类表不要开。
 */
export function useFrozenColumns<T extends HTMLTableElement>(
  options: FrozenColumnsOptions = {},
) {
  const ref = useRef<T | null>(null);
  const { left = 0, right = 0, disabled = false } = options;

  useEffect(() => {
    const table = ref.current;
    if (!table) return;

    const apply = () => {
      const rows = Array.from(table.rows);
      if (rows.length === 0) return;

      for (const row of rows) {
        for (const cell of Array.from(row.cells)) resetCell(cell);
      }
      if (disabled || (left === 0 && right === 0)) {
        table.classList.remove('cf-table-sticky');
        return;
      }
      table.classList.add('cf-table-sticky');

      const reference = Array.from(rows[0].cells);
      const widths = reference.map((cell) => cell.getBoundingClientRect().width);
      const colCount = reference.length;

      const leftOffsets: number[] = [];
      let acc = 0;
      for (let i = 0; i < Math.min(left, colCount); i += 1) {
        leftOffsets.push(acc);
        acc += widths[i] ?? 0;
      }

      const rightOffsets: number[] = [];
      acc = 0;
      for (let i = 0; i < Math.min(right, colCount); i += 1) {
        rightOffsets.push(acc);
        acc += widths[colCount - 1 - i] ?? 0;
      }

      for (const row of rows) {
        const cells = Array.from(row.cells);
        // 跨列单元格（加载中/空状态那种 colSpan 整行）不参与冻结，
        // 否则整条横幅会被钉住，横向滚动时看起来很怪
        const hasSpan = cells.some((cell) => cell.colSpan > 1);
        if (hasSpan) continue;
        leftOffsets.forEach((offset, i) => {
          const cell = cells[i];
          if (!cell) return;
          cell.style.position = 'sticky';
          cell.style.left = `${offset}px`;
          cell.dataset.cfPin = 'left';
          if (i === leftOffsets.length - 1) cell.dataset.cfPinEdge = 'left';
        });
        rightOffsets.forEach((offset, i) => {
          const cell = cells[cells.length - 1 - i];
          if (!cell) return;
          cell.style.position = 'sticky';
          cell.style.right = `${offset}px`;
          cell.dataset.cfPin = 'right';
          if (i === rightOffsets.length - 1) cell.dataset.cfPinEdge = 'right';
        });
      }
    };

    apply();

    // 列宽随内容与容器变化，行数变化也要重算
    const resizeObserver = new ResizeObserver(apply);
    resizeObserver.observe(table);
    const mutationObserver = new MutationObserver(apply);
    mutationObserver.observe(table, { childList: true, subtree: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [left, right, disabled]);

  return ref;
}
