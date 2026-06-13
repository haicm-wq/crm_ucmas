/**
 * SkeletonLoader — Reusable shimmer loading placeholders
 * Replaces spinner-only loading states across the app
 */

function SkeletonBlock({ className = '' }) {
  return <div className={`skeleton-shimmer rounded ${className}`} />;
}

export function TableSkeleton({ rows = 5, cols = 6 }) {
  return (
    <div className="overflow-hidden" role="status" aria-label="Đang tải dữ liệu">
      {/* Header */}
      <div className="flex gap-4 p-4 border-b border-surface-200 dark:border-surface-700/50">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-4 border-b border-surface-100 dark:border-surface-800/30">
          {Array.from({ length: cols }).map((_, j) => (
            <SkeletonBlock key={j} className={`h-3 flex-1 ${j === 0 ? 'max-w-[120px]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" role="status" aria-label="Đang tải thống kê">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card p-5">
          <SkeletonBlock className="h-3 w-20 mb-3" />
          <SkeletonBlock className="h-8 w-16 mb-2" />
          <SkeletonBlock className="h-2 w-24" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="glass-card p-5" role="status" aria-label="Đang tải biểu đồ">
      <SkeletonBlock className="h-4 w-32 mb-4" />
      <div className="flex items-end gap-3 h-[200px] pt-4">
        {[60, 80, 45, 90, 30, 70, 55].map((h, i) => (
          <SkeletonBlock key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3" role="status" aria-label="Đang tải danh sách">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-surface-50 dark:bg-surface-800/30">
          <SkeletonBlock className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-3 w-3/4" />
            <SkeletonBlock className="h-2 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default SkeletonBlock;
