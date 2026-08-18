// apps/web/src/components/domain/dashboard/dashboard-skeleton.tsx
// Dashboard skeleton loader component

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {/* Date header skeleton */}
      <div className="border-b border-outline-variant pb-3">
        <div className="h-2.5 w-36 animate-pulse rounded-card bg-surface-high" />
      </div>

      {/* CTA buttons skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-10 w-36 animate-pulse rounded-full bg-surface-high" />
        <div className="h-10 w-28 animate-pulse rounded-full bg-surface-high" />
      </div>

      {/* Card skeletons */}
      {[1, 2].map((i) => (
        <div
          key={i}
          className="shadow-card flex flex-col gap-3 border border-outline-variant bg-surface-high p-6"
        >
          {/* Avatar + name row */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-surface-highest" />
            <div className="flex flex-col gap-1.5">
              <div className="h-2.5 w-24 animate-pulse rounded-card bg-surface-highest" />
              <div className="h-2 w-16 animate-pulse rounded-card bg-surface-highest" />
            </div>
          </div>
          {/* Content lines */}
          <div className="flex flex-col gap-2 pl-12">
            <div className="h-3 w-full animate-pulse rounded-card bg-surface-highest" />
            <div className="h-3 w-3/4 animate-pulse rounded-card bg-surface-highest" />
          </div>
        </div>
      ))}
    </div>
  );
}
