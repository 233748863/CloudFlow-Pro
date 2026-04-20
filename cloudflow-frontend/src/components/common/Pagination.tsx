import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';

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
  const pages: Array<number | string> = [];
  const maxVisible = 7;

  if (totalPages <= maxVisible) {
    for (let index = 1; index <= totalPages; index += 1) {
      pages.push(index);
    }
    return pages;
  }

  pages.push(1);

  const start = Math.max(2, currentPage - 2);
  const end = Math.min(totalPages - 1, currentPage + 2);

  if (start > 2) {
    pages.push('...');
  }

  for (let index = start; index <= end; index += 1) {
    pages.push(index);
  }

  if (end < totalPages - 1) {
    pages.push('...');
  }

  pages.push(totalPages);

  return pages;
}

export const Pagination: React.FC<PaginationProps> = ({
  total,
  page,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
  showPageSizeSelector = true,
  showJump = false,
  onPageChange,
  onPageSizeChange,
}) => {
  const [jumpPage, setJumpPage] = useState('');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toItem = Math.min(page * pageSize, total);

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
    <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6 dark:border-slate-800 dark:bg-slate-950/88">
      <div className="flex flex-1 items-center justify-between sm:hidden">
        <Button variant="outline" onClick={() => goToPage(page - 1)} disabled={page === 1}>
          上一页
        </Button>
        <span className="text-sm text-slate-600 dark:text-slate-300">
          第 {page} / {totalPages} 页
        </span>
        <Button variant="outline" onClick={() => goToPage(page + 1)} disabled={page === totalPages}>
          下一页
        </Button>
      </div>

      <div className="hidden w-full items-center justify-between gap-6 sm:flex">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            显示第 <span className="font-medium text-slate-900 dark:text-slate-100">{fromItem}</span>{' '}
            到 <span className="font-medium text-slate-900 dark:text-slate-100">{toItem}</span>{' '}
            条，共 <span className="font-medium text-slate-900 dark:text-slate-100">{total}</span> 条
          </p>

          {showPageSizeSelector ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-300">每页</span>
              <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                <SelectTrigger className="h-9 w-20 rounded-lg">
                  <SelectValue />
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
          ) : null}

          {showJump ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-300">跳至</span>
              <input
                value={jumpPage}
                type="number"
                min={1}
                max={totalPages}
                className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="页码"
                onChange={(event) => setJumpPage(event.target.value)}
                onKeyUp={(event) => {
                  if (event.key === 'Enter') {
                    submitJump();
                  }
                }}
              />
              <Button variant="outline" onClick={submitJump}>
                前往
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center rounded-lg shadow-sm">
          <Button
            variant="outline"
            className="rounded-r-none border-r-0"
            onClick={() => goToPage(page - 1)}
            disabled={page === 1}
            aria-label="上一页"
          >
            <ChevronLeft size={16} />
          </Button>

          {visiblePages.map((pageItem, index) => {
            const key = `${pageItem}-${index}`;
            const active = pageItem === page;

            if (typeof pageItem !== 'number') {
              return (
                <span
                  key={key}
                  className="inline-flex h-10 min-w-10 items-center justify-center border border-slate-200 bg-white px-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
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
                  'inline-flex h-10 min-w-10 items-center justify-center border border-slate-200 px-3 text-sm font-medium transition-colors',
                  active
                    ? 'relative z-10 border-cyan-500 bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-200'
                    : 'bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {pageItem}
              </button>
            );
          })}

          <Button
            variant="outline"
            className="rounded-l-none border-l-0"
            onClick={() => goToPage(page + 1)}
            disabled={page === totalPages}
            aria-label="下一页"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};
