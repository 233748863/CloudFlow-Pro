import React from 'react';
import { Pagination } from './Pagination';

interface ListResultFooterProps {
  total: number;
  page: number;
  pageSize: number;
  summary: React.ReactNode;
  showPageSizeSelector?: boolean;
  showJump?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export const ListResultFooter: React.FC<ListResultFooterProps> = ({
  total,
  page,
  pageSize,
  summary,
  showPageSizeSelector = false,
  showJump = false,
  onPageChange,
  onPageSizeChange = () => {},
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={`list-result-footer${total === 0 ? ' is-empty' : ''}`}>
      <div className="list-result-summary" aria-label="列表结果摘要">
        <span>{summary}</span>
        <span>第 {page} / {totalPages} 页</span>
      </div>
      {total > 0 ? (
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          showPageSizeSelector={showPageSizeSelector}
          showJump={showJump}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      ) : null}
    </div>
  );
};
