import React, { useId, useState } from 'react';
import { Button } from '@/components/common/button';

export interface ChartTableData {
  columns: readonly string[];
  rows: readonly (readonly (string | number | null)[])[];
  onActivate?: (rowIndex: number) => void;
  actionLabel?: string;
}

export const ChartViewToggle = ({ tableView, onChange, controls }: {
  tableView: boolean; onChange: (value: boolean) => void; controls?: string;
}) => <Button type="button" variant="outline" className="shrink-0" style={{ minHeight: 44, minWidth: 44 }} aria-pressed={tableView}
  aria-controls={controls} onClick={() => onChange(!tableView)}>{tableView ? '查看图表' : '查看数据表'}</Button>;

/** 原始数据分页展示，保持读屏可访问；不截断或采样业务数据。 */
export const ChartDataTable = ({ data, label }: { data: ChartTableData; label: string }) => {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(data.rows.length / 100));
  const currentPage = Math.min(page, pageCount - 1);
  const tableId = useId();
  return <div className="min-w-0">
    <div className="max-h-[420px] overflow-auto" role="region" aria-label={`${label}数据表`} tabIndex={0}>
      <table id={tableId} className="unity-data-table w-full text-cf-body">
        <caption className="sr-only">{label}，共{data.rows.length}行</caption>
        <thead><tr>{data.columns.map((column, index) => <th key={index} scope="col">{column}</th>)}
          {data.onActivate ? <th scope="col">操作</th> : null}</tr></thead>
        <tbody>{data.rows.slice(currentPage * 100, (currentPage + 1) * 100).map((row, index) => <tr key={index}>
          {row.map((cell, column) => <td key={column}>{cell ?? '—'}</td>)}
          {data.onActivate ? <td><Button type="button" variant="outline" style={{ minHeight: 44, minWidth: 44 }}
            onClick={() => data.onActivate?.(currentPage * 100 + index)}>{data.actionLabel ?? '查看详情'}</Button></td> : null}
        </tr>)}</tbody>
      </table>
    </div>
    {pageCount > 1 ? <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
      <span aria-live="polite" className="text-sm text-cf-subtle">第 {currentPage + 1} / {pageCount} 页，共 {data.rows.length} 行</span>
      <Button type="button" variant="outline" style={{ minHeight: 44, minWidth: 44 }} aria-controls={tableId} disabled={currentPage === 0}
        onClick={() => setPage(currentPage - 1)}>上一页</Button>
      <Button type="button" variant="outline" style={{ minHeight: 44, minWidth: 44 }} aria-controls={tableId} disabled={currentPage + 1 === pageCount}
        onClick={() => setPage(currentPage + 1)}>下一页</Button>
    </div> : null}
  </div>;
};
