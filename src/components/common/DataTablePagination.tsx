import { ChevronLeft, ChevronRight } from "lucide-react";

export interface DataTablePaginationProps {
  page: number; // 0-indexed
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemName?: string;
  className?: string;
}

export function DataTablePagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  itemName = "entries",
  className = "",
}: DataTablePaginationProps) {
  if (totalItems === 0) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  // Generate clean page numbers to display
  const pages: (number | "ellipsis")[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    if (page > 2) pages.push("ellipsis");
    const pStart = Math.max(1, page - 1);
    const pEnd = Math.min(totalPages - 2, page + 1);
    for (let i = pStart; i <= pEnd; i++) pages.push(i);
    if (page < totalPages - 3) pages.push("ellipsis");
    pages.push(totalPages - 1);
  }

  return (
    <div
      className={`flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:px-5 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>
          Showing <strong className="font-semibold text-slate-900 tabular-nums">{start}</strong> to{" "}
          <strong className="font-semibold text-slate-900 tabular-nums">{end}</strong> of{" "}
          <strong className="font-semibold text-slate-900 tabular-nums">{totalItems}</strong> {itemName}
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <span className="text-slate-400">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(0);
              }}
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-500"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>

          {pages.map((p, idx) => {
            if (p === "ellipsis") {
              return (
                <span key={`ell-${idx}`} className="px-1 text-xs text-slate-400">
                  …
                </span>
              );
            }
            const isCurrent = p === page;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`inline-flex size-8 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                  isCurrent
                    ? "bg-slate-900 text-white shadow-xs"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {p + 1}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
