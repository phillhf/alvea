interface SkeletonProps {
  rows?: number;
  className?: string;
}

export function SkeletonCard({ rows = 3 }: SkeletonProps) {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-3">
        <div className="skeleton skeleton-circle" style={{ width: 36, height: 36, flexShrink: 0 }} />
        <div className="flex-1 space-y-2">
          <div className="skeleton skeleton-title" style={{ width: "60%" }} />
          <div className="skeleton skeleton-text" style={{ width: "40%" }} />
        </div>
      </div>
      {Array.from({ length: rows - 1 }).map((_, i) => (
        <div key={i} className="skeleton skeleton-text" style={{ width: `${70 - i * 10}%` }} />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} rows={2} />
      ))}
    </div>
  );
}

export function SkeletonText({ width = "100%", height = 12 }: { width?: string | number; height?: number }) {
  return <div className="skeleton" style={{ width, height, borderRadius: 6 }} />;
}
