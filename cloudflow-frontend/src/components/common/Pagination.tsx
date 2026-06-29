import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { Select, SelectContent, SelectItem, SelectTrigger } from './select';

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions?: number[];
  showPageSizeSelector?: boolean;
  showJump?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

function buildVisiblePages(currentPage: number, totalPages: number): Array<number | string> {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, '...', totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, '...', totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

export const Pagination: React.FC<PaginationProps> = ({
  total,
  page,
  pageSize,
  pageSizeOptions = [10, 20, 50],
  showPageSizeSelector = true,
  showJump = false,
  onPageChange,
  onPageSizeChange,
}) => {
  const [jumpPage, setJumpPage] = useState('');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toItem = total === 0 ? 0 : Math.min(page * pageSize, total);

  const visiblePages = useMemo(() => buildVisiblePages(page, totalPages), [page, totalPages]);

  const goToPage = (nextPage: number) => {
    if (nextPage >= 1 && nextPage <= totalPages && nextPage !== page) {
      onPageChange(nextPage);
    }
  };

  const submitJump = () => {
    const parsed = Number.parseInt(jumpPage.trim(), 10);
    if (Number.isNaN(parsed)) {
      return;
    }

    const nextPage = Math.min(Math.max(parsed, 1), totalPages);
    setJumpPage('');
    goToPage(nextPage);
  };

  return (
    <div className="pagination-bar cf-pagination flex items-center justify-between">
      <div className="pagination-mobile flex flex-1 items-center justify-between sm:hidden">
        <Button variant="outline" size="sm" onClick={() => goToPage(page - 1)} disabled={page === 1}>
          <ChevronLeft size={15} /> 上一页
        </Button>
        <Button variant="outline" size="sm" onClick={() => goToPage(page + 1)} disabled={page === totalPages}>
          下一页 <ChevronRight size={15} />
        </Button>
      </div>

      <div className="pagination-desktop hidden w-full items-center justify-between gap-4 sm:flex">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          显示 <span className="font-medium text-slate-900 dark:text-slate-100">{fromItem}</span>{' '}
          至 <span className="font-medium text-slate-900 dark:text-slate-100">{toItem}</span>{' '}
          共 <span className="font-medium text-slate-900 dark:text-slate-100">{total}</span> 条结果
        </p>

        <div className="pagination-actions flex items-center gap-2">
          {showPageSizeSelector ? (
            <>
              <span className="text-sm text-slate-600 dark:text-slate-300">每页:</span>
              <div className="unity-select">
                <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                  <SelectTrigger>
                    <span className="pagination-size-value">{pageSize}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          <button
            type="button"
            className="pagination-btn"
            onClick={() => goToPage(page - 1)}
            disabled={page === 1}
            aria-label="上一页"
          >
            <ChevronLeft size={16} />
          </button>

          {visiblePages.map((pageItem, index) => {
            const key = `${pageItem}-${index}`;
            const active = pageItem === page;

            if (typeof pageItem !== 'number') {
              return (
                <span
                  key={key}
                  className="pagination-ellipsis cf-pagination-ellipsis"
                >
                  {pageItem}
                </span>
              );
            }

            return (
              <button
                key={key}
                type="button"
                onClick={() => goToPage(pageItem)}
                className={[
                  'pagination-btn cf-pagination-page',
                  active
                    ? 'active is-active'
                    : '',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {pageItem}
              </button>
            );
          })}

          <button
            type="button"
            className="pagination-btn"
            onClick={() => goToPage(page + 1)}
            disabled={page === totalPages}
            aria-label="下一页"
          >
            <ChevronRight size={16} />
          </button>

          {showJump ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-300">跳至</span>
              <input
                value={jumpPage}
                type="number"
                min={1}
                max={totalPages}
                className="cf-control h-9 w-20 rounded-md px-3 text-sm"
                placeholder="页码"
                onChange={(event) => setJumpPage(event.target.value)}
                onKeyUp={(event) => {
                  if (event.key === 'Enter') {
                    submitJump();
                  }
                }}
              />
              <Button variant="ghost" size="sm" onClick={submitJump}>
                前往
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
