import React, { memo } from 'react';
import { PaginationInfo } from '../../types/board.types';
import { ChevronLeftIcon, ChevronRightIcon } from '../common/Icons';

interface PaginationProps {
  pagination: PaginationInfo | null;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export const Pagination = memo<PaginationProps>(({ pagination, currentPage, onPageChange }) => {
  if (!pagination || pagination.totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = typeof window !== 'undefined' && window.innerWidth < 640 ? 3 : 5;

    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const endPage = Math.min(pagination.totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  const navBtn = (
    disabled: boolean,
    onClick: () => void,
    label: string,
    children: React.ReactNode
  ) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500
                 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300
                 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );

  return (
    <div className="flex items-center justify-center gap-1 py-5">
      {/* 이전 페이지 */}
      {navBtn(
        !pagination.hasPrevPage,
        () => onPageChange(currentPage - 1),
        '이전 페이지',
        <ChevronLeftIcon />
      )}

      {/* 첫 페이지 */}
      {pageNumbers[0] > 1 && (
        <>
          <PageBtn page={1} current={currentPage} onClick={onPageChange} />
          {pageNumbers[0] > 2 && <Ellipsis />}
        </>
      )}

      {/* 페이지 번호들 */}
      {pageNumbers.map(page => (
        <PageBtn key={page} page={page} current={currentPage} onClick={onPageChange} />
      ))}

      {/* 마지막 페이지 */}
      {pageNumbers[pageNumbers.length - 1] < pagination.totalPages && (
        <>
          {pageNumbers[pageNumbers.length - 1] < pagination.totalPages - 1 && <Ellipsis />}
          <PageBtn page={pagination.totalPages} current={currentPage} onClick={onPageChange} />
        </>
      )}

      {/* 다음 페이지 */}
      {navBtn(
        !pagination.hasNextPage,
        () => onPageChange(currentPage + 1),
        '다음 페이지',
        <ChevronRightIcon />
      )}
    </div>
  );
});

Pagination.displayName = 'Pagination';

const PageBtn = ({
  page,
  current,
  onClick,
}: {
  page: number;
  current: number;
  onClick: (p: number) => void;
}) => (
  <button
    onClick={() => onClick(page)}
    aria-label={`${page}페이지로 이동`}
    aria-current={current === page ? 'page' : undefined}
    className={`w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-150 ${
      current === page
        ? 'bg-primary-600 dark:bg-primary-500 text-white shadow-sm scale-105'
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 hover:scale-105 active:scale-95'
    }`}
  >
    {page}
  </button>
);

const Ellipsis = () => (
  <span className="w-8 h-8 flex items-center justify-center text-sm text-slate-400 dark:text-slate-600 select-none">
    …
  </span>
);
