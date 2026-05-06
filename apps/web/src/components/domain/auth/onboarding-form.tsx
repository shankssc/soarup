'use client';

// apps/web/src/components/domain/auth/onboarding-form.tsx
// Two-step onboarding form: Step 1 — profile, Step 2 — workspace.
// Wired to PATCH /auth/profile and POST /workspaces/.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { SelectField } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import {
  detectBrowserTimezone,
  getGroupedTimezones,
} from '@/lib/utils/timezones';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

const TIMEZONE_GROUPS = getGroupedTimezones().map((g) => ({
  label: g.region,
  items: g.timezones.map((tz) => ({ value: tz.value, label: tz.label })),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2;
type WorkspacePath = 'create' | 'join';

interface StepOneFields {
  displayName: string;
  timezone: string;
}

interface StepOneErrors {
  displayName?: string;
  timezone?: string;
}

interface StepTwoErrors {
  name?: string;
  slug?: string;
  inviteCode?: string;
  general?: string;
}

// ─── Slug helpers ─────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function patchProfile(
  accessToken: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? 'Failed to update profile.',
    );
  }
}

async function createWorkspace(
  accessToken: string,
  name: string,
  slug: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/workspaces/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ name, slug }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const code = (err as { error?: string }).error ?? '';
    if (code === 'slug_already_taken') {
      throw Object.assign(
        new Error('This slug is already taken. Please choose another.'),
        { code },
      );
    }
    throw new Error(
      (err as { message?: string }).message ??
        'Could not create workspace. Please try again.',
    );
  }
}

async function joinWorkspace(
  accessToken: string,
  inviteCode: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/workspaces/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ invite_code: inviteCode }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ??
        'Invite code is invalid or has expired.',
    );
  }
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <div className="flex-1 flex gap-1 h-[3px]">
        {/* Segment 1 — always filled */}
        <div className="flex-1 bg-[var(--color-cyan)]" />
        {/* Segment 2 — filled on step 2 */}
        <div
          className={[
            'flex-1 transition-colors duration-300',
            step === 2
              ? 'bg-[var(--color-cyan)]'
              : 'bg-[var(--color-border-default)]',
          ].join(' ')}
        />
      </div>
      <span className="font-[Space_Grotesk] text-[12px] text-[var(--color-text-muted)] shrink-0">
        {step} / 2
      </span>
    </div>
  );
}

// ─── Input field (bottom-border only) ─────────────────────────────────────────

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  hint?: React.ReactNode;
  autoFocus?: boolean;
  id: string;
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  autoFocus,
  id,
}: InputFieldProps) {
  return (
    <div className="flex flex-col gap-[4px]">
      <label
        htmlFor={id}
        className={[
          'font-[Space_Grotesk] text-[10px] font-medium tracking-[0.08em] uppercase',
          error
            ? 'text-[var(--color-error)]'
            : 'text-[var(--color-text-primary)]',
        ].join(' ')}
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'w-full bg-transparent px-0 py-2',
          'border-0 border-b',
          error
            ? 'border-[var(--color-error)]'
            : 'border-[var(--color-border-default)]',
          'font-[Space_Grotesk] text-[15px] text-[var(--color-text-primary)]',
          'placeholder:text-[var(--color-text-muted)]',
          // Cyan underline on focus
          'focus:outline-none focus:border-[var(--color-cyan)]',
          'transition-colors duration-150 rounded-none',
        ].join(' ')}
      />
      {hint && (
        <span className="font-[Space_Grotesk] text-[13px] text-[var(--color-text-muted)] mt-[2px]">
          {hint}
        </span>
      )}
      {error && (
        <span className="font-[Space_Grotesk] text-[12px] text-[var(--color-error)]">
          {error}
        </span>
      )}
    </div>
  );
}

// ─── CTA button ───────────────────────────────────────────────────────────────

interface CtaButtonProps {
  label: string;
  onClick: () => void;
  isLoading?: boolean;
  variant?: 'primary' | 'secondary';
}

function CtaButton({
  label,
  onClick,
  isLoading = false,
  variant = 'primary',
}: CtaButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={[
        'w-full h-12 px-6',
        'flex items-center justify-between',
        'font-[Space_Grotesk] text-[14px] font-bold tracking-[0.06em] uppercase',
        // Asymmetric radius — Electric Atelier CTA
        'rounded-tl-[1.5rem] rounded-br-[1.5rem] rounded-tr-[0.5rem] rounded-bl-[0.5rem]',
        isPrimary
          ? [
              'bg-[var(--color-cyan)] text-[#0e0e10]',
              'shadow-[0_0_16px_rgba(83,221,252,0.25)]',
              'hover:shadow-[0_0_24px_rgba(83,221,252,0.4)]',
            ].join(' ')
          : 'bg-[var(--color-magenta)] text-[#0e0e10]',
        'transition-all duration-150',
        'disabled:opacity-60 disabled:cursor-not-allowed',
      ].join(' ')}
    >
      <span>{isLoading ? 'Please wait...' : label}</span>
      {!isLoading && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      )}
    </button>
  );
}

// ─── Step 1 — Profile setup ───────────────────────────────────────────────────

interface StepOneProps {
  onComplete: (fields: StepOneFields) => void;
  initialDisplayName: string;
}

function StepOne({ onComplete, initialDisplayName }: StepOneProps) {
  const [displayName, setDisplayName] = React.useState(initialDisplayName);
  const [timezone, setTimezone] = React.useState(
    () => detectBrowserTimezone().value,
  );
  const [errors, setErrors] = React.useState<StepOneErrors>({});
  const [isLoading, setIsLoading] = React.useState(false);

  function validate(): boolean {
    const next: StepOneErrors = {};
    if (!displayName.trim()) next.displayName = 'Display name is required.';
    if (displayName.trim().length > 100)
      next.displayName = 'Display name must be 100 characters or fewer.';
    if (!timezone) next.timezone = 'Please select a timezone.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleContinue() {
    if (!validate()) return;
    setIsLoading(true);
    // Validation passed — hand off to parent which calls the API
    onComplete({ displayName: displayName.trim(), timezone });
    setIsLoading(false);
  }

  return (
    <div>
      {/* Titles */}
      <p className="font-[Space_Grotesk] text-[10px] font-medium tracking-[0.08em] uppercase text-[var(--color-text-muted)] mb-1">
        TELL US A BIT ABOUT YOURSELF
      </p>
      <h1 className="font-[Newsreader] italic text-[36px] leading-[1.1] text-[var(--color-text-primary)] mb-8">
        Set up your profile
      </h1>

      {/* Fields */}
      <div className="flex flex-col gap-8 mb-10">
        <InputField
          id="display-name"
          label="Display Name"
          value={displayName}
          onChange={setDisplayName}
          placeholder="Jane Doe"
          error={errors.displayName}
          autoFocus
        />

        <SelectField
          label="Timezone"
          value={timezone}
          onValueChange={setTimezone}
          placeholder="Select timezone..."
          searchable
          searchPlaceholder="Search timezones..."
          groups={TIMEZONE_GROUPS}
          error={errors.timezone}
        />
      </div>

      <CtaButton
        label="Continue"
        onClick={handleContinue}
        isLoading={isLoading}
      />
    </div>
  );
}

// ─── Step 2 — Workspace setup ─────────────────────────────────────────────────

interface StepTwoProps {
  onComplete: () => void;
  accessToken: string;
}

function StepTwo({ onComplete, accessToken }: StepTwoProps) {
  const [path, setPath] = React.useState<WorkspacePath>('create');

  // Create path
  const [workspaceName, setWorkspaceName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false);

  // Join path
  const [inviteCode, setInviteCode] = React.useState('');

  const [errors, setErrors] = React.useState<StepTwoErrors>({});
  const [isLoading, setIsLoading] = React.useState(false);

  // Auto-generate slug from workspace name unless manually edited
  React.useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(toSlug(workspaceName));
    }
  }, [workspaceName, slugManuallyEdited]);

  function handleSlugChange(value: string) {
    // Only allow valid slug characters as the user types
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 50);
    setSlug(sanitized);
    setSlugManuallyEdited(true);
  }

  function validateCreate(): boolean {
    const next: StepTwoErrors = {};
    if (!workspaceName.trim()) next.name = 'Workspace name is required.';
    if (workspaceName.trim().length > 100)
      next.name = 'Name must be 100 characters or fewer.';
    if (!slug) next.slug = 'Slug is required.';
    if (slug && !/^[a-z0-9-]+$/.test(slug))
      next.slug = 'Slug can only contain lowercase letters, numbers, and hyphens.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateJoin(): boolean {
    const next: StepTwoErrors = {};
    if (!inviteCode.trim()) next.inviteCode = 'Invite code is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleCreate() {
    if (!validateCreate()) return;
    setIsLoading(true);
    setErrors({});
    try {
      await createWorkspace(accessToken, workspaceName.trim(), slug);
      onComplete();
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'slug_already_taken') {
        setErrors({ slug: e.message });
      } else {
        setErrors({ general: e.message });
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleJoin() {
    if (!validateJoin()) return;
    setIsLoading(true);
    setErrors({});
    try {
      await joinWorkspace(accessToken, inviteCode.trim());
      onComplete();
    } catch (err) {
      setErrors({
        inviteCode: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Reset errors and form when switching paths
  function switchPath(next: WorkspacePath) {
    setPath(next);
    setErrors({});
  }

  return (
    <div>
      {/* Titles */}
      <p className="font-[Space_Grotesk] text-[10px] font-medium tracking-[0.08em] uppercase text-[var(--color-text-muted)] mb-1">
        WHERE YOUR TEAM&apos;S UPDATES WILL LIVE
      </p>
      <h1 className="font-[Newsreader] italic text-[36px] leading-[1.1] text-[var(--color-text-primary)] mb-6">
        Create your workspace
      </h1>

      {/* Segmented toggle */}
      <div className="flex rounded-full border border-[var(--color-border-default)] p-[3px] mb-8">
        {(
          [
            { value: 'create', label: 'Create workspace' },
            { value: 'join', label: 'Join with invite code' },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => switchPath(option.value)}
            className={[
              'flex-1 py-2 px-4 rounded-full',
              'font-[Space_Grotesk] text-[12px] font-medium tracking-[0.04em]',
              'transition-colors duration-150',
              path === option.value
                ? 'bg-[var(--color-cyan)] text-[#0e0e10]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* General error */}
      {errors.general && (
        <p className="font-[Space_Grotesk] text-[13px] text-[var(--color-error)] mb-4">
          {errors.general}
        </p>
      )}

      {/* Create path */}
      {path === 'create' && (
        <div className="flex flex-col gap-8 mb-10">
          <InputField
            id="workspace-name"
            label="Workspace Name"
            value={workspaceName}
            onChange={setWorkspaceName}
            placeholder="Acme Team"
            error={errors.name}
            autoFocus
          />

          <InputField
            id="workspace-slug"
            label="Workspace Slug"
            value={slug}
            onChange={handleSlugChange}
            placeholder="acme-team"
            error={errors.slug}
            hint={
              slug ? (
                <>
                  <span className="text-[var(--color-text-muted)]">
                    soarup.app/join/
                  </span>
                  <span className="text-[var(--color-cyan)]">{slug}</span>
                </>
              ) : null
            }
          />
        </div>
      )}

      {/* Join path */}
      {path === 'join' && (
        <div className="flex flex-col gap-8 mb-10">
          <InputField
            id="invite-code"
            label="Invite Code"
            value={inviteCode}
            onChange={setInviteCode}
            placeholder="Enter your invite code"
            error={errors.inviteCode}
            autoFocus
          />
        </div>
      )}

      <CtaButton
        label={path === 'create' ? 'Create Workspace' : 'Join Workspace'}
        onClick={path === 'create' ? handleCreate : handleJoin}
        isLoading={isLoading}
        variant={path === 'create' ? 'primary' : 'secondary'}
      />
    </div>
  );
}

// ─── Main onboarding form ─────────────────────────────────────────────────────

export function OnboardingForm() {
  const router = useRouter();
  const { user, tokens, setUser } = useAuth();
  const [step, setStep] = React.useState<Step>(1);
  const [isSubmittingStep1, setIsSubmittingStep1] = React.useState(false);
  const [step1Error, setStep1Error] = React.useState<string | null>(null);

  const accessToken = tokens?.access_token ?? '';

  // Pre-fill display name from OAuth or previous signup
  const initialDisplayName = user?.full_name ?? '';

  async function handleStep1Complete(fields: StepOneFields) {
    setIsSubmittingStep1(true);
    setStep1Error(null);
    try {
      await patchProfile(accessToken, {
        full_name: fields.displayName,
        timezone: fields.timezone,
      });
      // Optimistically update the Zustand store so the name is reflected
      // immediately if the user navigates back or the token is refreshed
      if (user) {
        setUser({ ...user, full_name: fields.displayName });
      }
      setStep(2);
    } catch (err) {
      setStep1Error(
        (err as Error).message ?? 'Failed to save profile. Please try again.',
      );
    } finally {
      setIsSubmittingStep1(false);
    }
  }

  function handleStep2Complete() {
    // Mark user as onboarded in the Zustand store.
    // The backend already set is_onboarded = true via create_workspace.
    if (user) {
      setUser({ ...user, is_onboarded: true });
    }
    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6">
        <span className="font-[Space_Grotesk] text-[16px] font-bold tracking-tight uppercase text-[var(--color-text-primary)]">
          SoarUp
        </span>
        {/* Theme toggle placeholder — wired to your existing ThemeToggle component */}
        <div className="border border-[var(--color-border-default)] px-3 py-1 rounded-full">
          <span className="font-[Space_Grotesk] text-[12px] text-[var(--color-text-muted)]">
            ◐
          </span>
        </div>
      </header>

      {/* Centered card */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[512px] bg-[var(--color-surface)] border border-[var(--color-border-default)] p-8">
          <ProgressBar step={step} />

          {step === 1 && (
            <>
              <StepOne
                onComplete={handleStep1Complete}
                initialDisplayName={initialDisplayName}
              />
              {step1Error && (
                <p className="mt-4 font-[Space_Grotesk] text-[13px] text-[var(--color-error)]">
                  {step1Error}
                </p>
              )}
              {isSubmittingStep1 && (
                <p className="mt-2 font-[Space_Grotesk] text-[13px] text-[var(--color-text-muted)]">
                  Saving...
                </p>
              )}
            </>
          )}

          {step === 2 && (
            <StepTwo
              onComplete={handleStep2Complete}
              accessToken={accessToken}
            />
          )}
        </div>
      </main>
    </div>
  );
}
