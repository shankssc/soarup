// apps/web/src/components/ui/heatmap.tsx
// GitHub contribution graph-style activity heatmap built with SVG.
// No third-party chart library — pure SVG + inline hex colors.
//
// Dark/light mode colors are hardcoded hex (not CSS vars) because SVG fill
// attributes don't support CSS custom properties in all browsers.
// Theme detection uses a MutationObserver on document.documentElement.class.
//
// SSR note: initial state reads classList synchronously to avoid a flash
// of dark colors when the user is in light mode.

'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import type { HeatmapDay } from '@/hooks/useAnalytics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_SIZE = 11;
const CELL_GAP = 2;
const CELL_STEP = CELL_SIZE + CELL_GAP;

// Intensity → hex color
// Dark mode: cyan tints against #1f1f22 (surface-high)
const DARK: Record<0 | 1 | 2 | 3, string> = {
  0: '#1f1f22', // surface-high — empty cell
  1: '#1a3d4a', // very light cyan tint
  2: '#1f7a8c', // medium cyan
  3: '#53ddfc', // primary cyan — full intensity
};

// Light mode: cyan tints against #daeceb (surface-high light)
const LIGHT: Record<0 | 1 | 2 | 3, string> = {
  0: '#daeceb',
  1: '#a8d8df',
  2: '#4ab8cf',
  3: '#00687a', // primary light
};

// Day labels shown on left axis (M W F only — matching GitHub's convention)
const DAY_LABELS = ['', 'M', '', 'W', '', 'F', ''];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HeatmapProps {
  days: HeatmapDay[];
  weeks: number;
  label?: string;
  className?: string;
  'data-testid'?: string;
}

export function Heatmap({
  days,
  label,
  className,
  'data-testid': testId = 'heatmap-grid',
}: HeatmapProps) {
  // Read the theme synchronously on first render to avoid a flash of wrong
  // colors when the user is in light mode.
  // The typeof guard handles SSR where document doesn't exist.
  const [isDark, setIsDark] = React.useState<boolean>(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : true,
  );

  React.useEffect(() => {
    // Keep in sync with runtime theme changes (e.g. user toggles dark mode)
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const colors = isDark ? DARK : LIGHT;

  // Group days into columns of 7 (one column = one week, Mon–Sun top to bottom)
  const columns: HeatmapDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    columns.push(days.slice(i, i + 7));
  }

  const svgWidth = columns.length * CELL_STEP + 24; // +24 for day-label column
  const svgHeight = 7 * CELL_STEP + 20; // +20 for month-label row

  // Month labels — show above the first column of each new month
  const monthLabels: { x: number; label: string }[] = [];
  let lastMonth = '';
  columns.forEach((col, colIdx) => {
    const firstDay = col[0];
    if (firstDay) {
      const month = format(parseISO(firstDay.date), 'MMM');
      if (month !== lastMonth) {
        monthLabels.push({ x: 24 + colIdx * CELL_STEP, label: month });
        lastMonth = month;
      }
    }
  });

  return (
    <div className={className} data-testid={testId}>
      {label && (
        <p className="mb-2 font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          {label}
        </p>
      )}
      <svg
        width={svgWidth}
        height={svgHeight}
        aria-label="Activity heatmap"
        role="img"
        style={{ overflow: 'visible' }}
      >
        {/* Month labels */}
        {monthLabels.map(({ x, label: monthLabel }) => (
          <text
            key={`month-${x}`}
            x={x}
            y={10}
            fill={isDark ? '#48474a' : '#6b7280'}
            style={{ fontSize: '9px', fontFamily: 'var(--font-space-grotesk)' }}
          >
            {monthLabel}
          </text>
        ))}

        {/* Day labels (M / W / F) */}
        {DAY_LABELS.map((dayLabel, rowIdx) => (
          <text
            key={`day-${rowIdx}`}
            x={0}
            y={18 + rowIdx * CELL_STEP + CELL_SIZE}
            fill={isDark ? '#48474a' : '#6b7280'}
            style={{ fontSize: '9px', fontFamily: 'var(--font-space-grotesk)' }}
          >
            {dayLabel}
          </text>
        ))}

        {/* Cells */}
        {columns.map((col, colIdx) =>
          col.map((day, rowIdx) => (
            <rect
              key={day.date}
              x={24 + colIdx * CELL_STEP}
              y={18 + rowIdx * CELL_STEP}
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={2}
              fill={colors[day.intensity as 0 | 1 | 2 | 3]}
              aria-label={`${day.count} on ${day.date}`}
              data-testid="heatmap-cell"
              data-intensity={day.intensity}
            >
              {/* SVG <title> provides hover tooltip in most browsers */}
              <title>
                {day.count > 0
                  ? `${day.count} submission${day.count > 1 ? 's' : ''} on ${format(parseISO(day.date), 'EEEE d MMMM')}`
                  : `No submissions on ${format(parseISO(day.date), 'EEEE d MMMM')}`}
              </title>
            </rect>
          )),
        )}
      </svg>
    </div>
  );
}
