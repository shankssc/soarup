// apps/web/src/components/ui/streak-card.tsx

import type { StreakData } from '@/hooks/useAnalytics';

interface StreakCardProps {
  streak: StreakData;
}

export function StreakCard({ streak }: StreakCardProps) {
  return (
    <div
      className="shadow-card flex items-center gap-6 rounded-card bg-surface-high p-6"
      data-testid="streak-badge"
    >
      {/* Current streak */}
      <div className="text-center">
        <div className="flex items-baseline gap-1">
          <span
            className="text-4xl font-bold tabular-nums text-primary"
            data-testid="streak-count"
          >
            {streak.current_streak}
          </span>
          <span className="font-label text-sm text-outline">
            {streak.current_streak === 1 ? 'day' : 'days'}
          </span>
        </div>
        <p className="mt-1 font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Current streak
        </p>
      </div>

      <div className="h-12 w-px flex-shrink-0 bg-outline-variant" />

      {/* Best streak */}
      <div className="text-center">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tabular-nums text-on-surface-variant">
            {streak.best_streak}
          </span>
          <span className="font-label text-xs text-outline">
            {streak.best_streak === 1 ? 'day' : 'days'}
          </span>
        </div>
        <p className="mt-1 font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Best streak
        </p>
      </div>

      <div className="h-12 w-px flex-shrink-0 bg-outline-variant" />

      {/* Total submissions */}
      <div className="text-center">
        <span className="text-2xl font-bold tabular-nums text-on-surface-variant">
          {streak.total_submissions}
        </span>
        <p className="mt-1 font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Total updates
        </p>
      </div>
    </div>
  );
}
