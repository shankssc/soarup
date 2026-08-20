// apps/web/src/app/(app)/history/page.tsx
// Full rewrite — adds Updates and Analytics tabs to the existing Digests tab.
// Preserves existing Digests tab UI conventions (skeleton, empty state, load more button style).

'use client';

import * as React from 'react';
import { ScrollText, History, LineChart } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useDigests } from '@/hooks/useDigests';
import { useUpdateHistory, type DateRangePreset } from '@/hooks/useUpdateHistory';
import {
  usePersonalAnalytics,
  useTeamAnalytics,
  type MemberParticipationRow,
} from '@/hooks/useAnalytics';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { DigestCard } from '@/components/domain/digests/digest-card';
import { UpdateCardCompact } from '@/components/domain/updates/update-card-compact';
import { StreakCard } from '@/components/ui/streak-card';
import { Heatmap } from '@/components/ui/heatmap';

type MainTab = 'digests' | 'updates' | 'analytics';
type AnalyticsTab = 'personal' | 'team';

export default function HistoryPage() {
  const { user } = useAuth();
  const { data: workspace } = useWorkspace();
  const [mainTab, setMainTab] = React.useState<MainTab>('digests');
  const [analyticsTab, setAnalyticsTab] = React.useState<AnalyticsTab>('personal');
  const [datePreset, setDatePreset] = React.useState<DateRangePreset>('30d');

  // Role check — gates the Team analytics sub-tab
  const { data: membersData } = useWorkspaceMembers(workspace?.id);
  const currentMember = membersData?.members.find((m) => m.user_id === user?.id);
  const isAdmin = ['admin', 'owner'].includes(currentMember?.role ?? '');

  // Lazy queries — only fetch when the relevant tab is active
  const {
    data: digestData,
    isLoading: digestsLoading,
    isFetchingNextPage: digestsFetchingNext,
    hasNextPage: digestsHasNext,
    fetchNextPage: digestsFetchNext,
  } = useDigests(workspace?.id);

  const {
    data: updatesData,
    isLoading: updatesLoading,
    isFetchingNextPage: updatesFetchingNext,
    hasNextPage: updatesHasNext,
    fetchNextPage: updatesFetchNext,
  } = useUpdateHistory(mainTab === 'updates' ? workspace?.id : undefined, datePreset);

  const { data: personalData, isLoading: personalLoading } = usePersonalAnalytics(
    mainTab === 'analytics' ? workspace?.id : undefined,
  );

  const { data: teamData, isLoading: teamLoading } = useTeamAnalytics(
    mainTab === 'analytics' && isAdmin && analyticsTab === 'team'
      ? workspace?.id
      : undefined,
  );

  const allDigests = digestData?.pages.flatMap((p) => p.digests) ?? [];
  const digestTotal = digestData?.pages[0]?.total ?? 0;
  const allUpdates = updatesData?.pages.flatMap((p) => p.updates) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-headline text-[24px] text-on-surface">History</h1>
      </div>

      {/* Main tab pills */}
      <div className="flex items-center gap-2">
        {(['digests', 'updates', 'analytics'] as MainTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMainTab(tab)}
            className={[
              'rounded-full px-4 py-1.5',
              'font-label text-[11px] uppercase tracking-[0.15em]',
              'capitalize transition-colors duration-150',
              mainTab === tab
                ? 'text-on-primary bg-primary'
                : 'border border-outline-variant text-outline hover:text-on-surface',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab: Digests                                                         */}
      {/* ------------------------------------------------------------------ */}
      {mainTab === 'digests' && (
        <>
          {/* Subtitle */}
          {digestTotal > 0 && (
            <p className="-mt-3 font-body text-[13px] text-on-surface-variant">
              {digestTotal} digest{digestTotal !== 1 ? 's' : ''} generated
            </p>
          )}

          {/* Skeleton */}
          {digestsLoading && (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-32 w-full animate-pulse border border-outline-variant bg-surface-high"
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!digestsLoading && allDigests.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <ScrollText
                className="h-10 w-10 text-on-surface-variant"
                aria-hidden="true"
              />
              <p className="max-w-xs font-body text-[14px] text-on-surface-variant">
                No digests yet. Digests are generated daily when updates exist.
              </p>
            </div>
          )}

          {/* Digest list */}
          {allDigests.map((digest) => (
            <DigestCard
              key={digest.id}
              digest={digest}
              workspaceId={workspace?.id ?? ''}
            />
          ))}

          {/* Load more */}
          {digestsHasNext && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => digestsFetchNext()}
                disabled={digestsFetchingNext}
                className={[
                  'px-6 py-2.5',
                  'font-label text-[12px] font-medium uppercase tracking-[0.06em]',
                  'border border-outline-variant text-on-surface-variant',
                  'hover:border-primary hover:text-primary',
                  'transition-colors duration-150',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                ].join(' ')}
              >
                {digestsFetchingNext ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab: Updates                                                         */}
      {/* ------------------------------------------------------------------ */}
      {mainTab === 'updates' && (
        <>
          {/* Date range filter pills */}
          <div className="flex items-center gap-2">
            {(['7d', '30d', '90d'] as DateRangePreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDatePreset(preset)}
                className={[
                  'rounded-full px-3 py-1',
                  'font-label text-[11px] uppercase tracking-[0.1em]',
                  'transition-colors duration-150',
                  datePreset === preset
                    ? 'bg-primary-container text-primary-on-container'
                    : 'border border-outline-variant text-outline hover:text-on-surface',
                ].join(' ')}
              >
                {preset === '7d' ? '7 days' : preset === '30d' ? '30 days' : '90 days'}
              </button>
            ))}
          </div>

          {/* Skeleton */}
          {updatesLoading && (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 w-full animate-pulse border border-outline-variant bg-surface-high"
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!updatesLoading && allUpdates.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <History
                className="h-10 w-10 text-on-surface-variant"
                aria-hidden="true"
              />
              <p className="max-w-xs font-body text-[14px] text-on-surface-variant">
                No updates in this period.
              </p>
            </div>
          )}

          {/* Update list */}
          {allUpdates.map((update) => (
            <UpdateCardCompact
              key={update.id}
              update={update}
              workspaceId={workspace?.id ?? ''}
            />
          ))}

          {/* Load more */}
          {updatesHasNext && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => updatesFetchNext()}
                disabled={updatesFetchingNext}
                className={[
                  'px-6 py-2.5',
                  'font-label text-[12px] font-medium uppercase tracking-[0.06em]',
                  'border border-outline-variant text-on-surface-variant',
                  'hover:border-primary hover:text-primary',
                  'transition-colors duration-150',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                ].join(' ')}
              >
                {updatesFetchingNext ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab: Analytics                                                       */}
      {/* ------------------------------------------------------------------ */}
      {mainTab === 'analytics' && (
        <>
          {/* Analytics sub-tab pills */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAnalyticsTab('personal')}
              className={[
                'rounded-full px-4 py-1.5',
                'font-label text-[11px] uppercase tracking-[0.15em]',
                'transition-colors duration-150',
                analyticsTab === 'personal'
                  ? 'text-on-primary bg-primary'
                  : 'border border-outline-variant text-outline hover:text-on-surface',
              ].join(' ')}
            >
              My stats
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setAnalyticsTab('team')}
                className={[
                  'rounded-full px-4 py-1.5',
                  'font-label text-[11px] uppercase tracking-[0.15em]',
                  'transition-colors duration-150',
                  analyticsTab === 'team'
                    ? 'text-on-primary bg-primary'
                    : 'border border-outline-variant text-outline hover:text-on-surface',
                ].join(' ')}
              >
                Team
              </button>
            )}
          </div>

          {/* Personal sub-tab */}
          {analyticsTab === 'personal' && (
            <>
              {/* Skeleton */}
              {personalLoading && (
                <div className="flex flex-col gap-3">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-24 w-full animate-pulse border border-outline-variant bg-surface-high"
                    />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!personalLoading && !personalData && (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <LineChart
                    className="h-10 w-10 text-on-surface-variant"
                    aria-hidden="true"
                  />
                  <p className="max-w-xs font-body text-[14px] text-on-surface-variant">
                    No analytics yet. Submit your first update to start tracking.
                  </p>
                </div>
              )}

              {personalData && (
                <div className="flex flex-col gap-6">
                  <StreakCard streak={personalData.streak} />
                  <Heatmap
                    days={personalData.heatmap}
                    weeks={personalData.heatmap_weeks}
                    label="Your activity — last 52 weeks"
                  />
                </div>
              )}
            </>
          )}

          {/* Team sub-tab */}
          {analyticsTab === 'team' && isAdmin && (
            <>
              {/* Skeleton */}
              {teamLoading && (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-20 w-full animate-pulse border border-outline-variant bg-surface-high"
                    />
                  ))}
                </div>
              )}

              {teamData && (
                <div className="flex flex-col gap-6">
                  {/* Aggregate stat cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <StatCard
                      value={`${Math.round(teamData.participation_rate_30d * 100)}%`}
                      label="Participation (30d)"
                      highlight
                    />
                    <StatCard
                      value={teamData.avg_updates_per_day_30d.toFixed(1)}
                      label="Avg updates/day"
                    />
                    <StatCard
                      value={String(teamData.active_member_count)}
                      label="Active members"
                    />
                  </div>

                  {/* Workspace heatmap */}
                  <Heatmap
                    days={teamData.workspace_heatmap}
                    weeks={teamData.workspace_heatmap_weeks}
                    label="Team activity — last 12 weeks"
                  />

                  {/* Per-member table */}
                  <div className="flex flex-col gap-2">
                    <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
                      Members
                    </p>
                    {teamData.members.map((member) => (
                      <MemberRow key={member.user_id} member={member} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  value,
  label,
  highlight = false,
}: {
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="shadow-card bg-surface-high p-4 text-center">
      <span
        className={[
          'font-headline text-[22px] tabular-nums',
          highlight ? 'text-primary' : 'text-on-surface',
        ].join(' ')}
      >
        {value}
      </span>
      <p className="mt-1 font-label text-[10px] uppercase tracking-[0.15em] text-outline">
        {label}
      </p>
    </div>
  );
}

function MemberRow({ member }: { member: MemberParticipationRow }) {
  return (
    <div
      className="shadow-card flex items-center gap-4 bg-surface-high px-4 py-3"
      data-testid="member-row"
    >
      {/* Avatar initial */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-container text-xs font-bold text-primary-on-container">
        {member.full_name?.[0]?.toUpperCase() ?? '?'}
      </div>

      {/* Name */}
      <span className="min-w-0 flex-1 truncate font-body text-[13px] text-on-surface">
        {member.full_name ?? 'Unknown'}
      </span>

      {/* Streak */}
      <div className="flex-shrink-0 text-right">
        <span className="font-label text-[12px] font-bold tabular-nums text-primary">
          {member.current_streak}d
        </span>
        <p className="font-label text-[9px] text-outline">streak</p>
      </div>

      {/* 30d participation rate */}
      <div className="w-12 flex-shrink-0 text-right">
        <span className="font-label text-[12px] tabular-nums text-on-surface">
          {Math.round(member.participation_rate_30d * 100)}%
        </span>
        <p className="font-label text-[9px] text-outline">30d</p>
      </div>

      {/* Sparkline */}
      <SparkLine data={member.sparkline} />
    </div>
  );
}

function SparkLine({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-6 flex-shrink-0 items-end gap-px" aria-hidden="true">
      {data.map((count, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm transition-all"
          style={{
            height: `${Math.max((count / max) * 100, count > 0 ? 15 : 5)}%`,
            backgroundColor:
              count > 0 ? 'var(--color-primary)' : 'var(--color-surface-highest)',
          }}
        />
      ))}
    </div>
  );
}
