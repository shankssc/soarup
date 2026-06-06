'use client';

// apps/web/src/components/domain/auth/onboarding-form.tsx
// Two-step onboarding form: Step 1 — profile, Step 2 — workspace.
// Wired to PATCH /auth/profile and POST /invites/{code}/accept or POST /workspaces/.
//
// M5: If a pending invite code exists in localStorage (soarup_pending_invite),
// Step 2 auto-switches to the join path, pre-fills the code, and hides the
// create option — the user is joining an existing workspace via invite.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { SelectField } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { detectBrowserTimezone, getGroupedTimezones } from '@/lib/utils/timezones';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';
export const PENDING_INVITE_KEY = 'soarup_pending_invite';

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

// ─── localStorage helpers ──────────────────────────────────────────────────────────────

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function readPendingInviteCode(): string | null {
  const raw = localStorage.getItem(PENDING_INVITE_KEY);
  if (!raw) return null;
  try {
    const { code, storedAt } = JSON.parse(raw);
    if (Date.now() - storedAt > SEVEN_DAYS) {
      localStorage.removeItem(PENDING_INVITE_KEY);
      return null;
    }
    return code;
  } catch {
    localStorage.removeItem(PENDING_INVITE_KEY);
    return null;
  }
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

async function acceptInvite(accessToken: string, inviteCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/invites/${inviteCode.trim()}/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail =
      (err as { detail?: string }).detail ??
      (err as { message?: string }).message ??
      '';

    if (
      detail.includes('already_member') ||
      detail.toLowerCase().includes('already a member')
    ) {
      throw new Error('You are already a member of this workspace.');
    }
    if (detail.includes('invite_expired') || detail.toLowerCase().includes('expired')) {
      throw new Error('This invite has expired. Ask an admin to send a new one.');
    }
    if (
      detail.includes('invite_not_found') ||
      detail.includes('invite_already_used') ||
      detail.toLowerCase().includes('invalid')
    ) {
      throw new Error('Invite code is invalid or has already been used.');
    }
    throw new Error('Could not join workspace. Please check your invite code.');
  }
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  return (
    <div className="mb-8 flex items-center gap-4">
      <div className="flex h-[3px] flex-1 gap-1">
        <div className="flex-1 bg-primary" />
        <div
          className={[
            'flex-1 transition-colors duration-300',
            step === 2 ? 'bg-primary' : 'bg-outline-variant',
          ].join(' ')}
        />
      </div>
      <span className="shrink-0 font-label text-[12px] text-on-surface-variant">
        {step} / 2
      </span>
    </div>
  );
}

// ─── Input field ──────────────────────────────────────────────────────────────

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  hint?: React.ReactNode;
  autoFocus?: boolean;
  id: string;
  readOnly?: boolean;
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
  readOnly = false,
}: InputFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={[
          'font-label text-[10px] font-medium uppercase tracking-[0.08em]',
          error ? 'text-error' : 'text-on-surface',
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
        readOnly={readOnly}
        className={[
          'w-full bg-transparent px-0 py-2',
          'border-0 border-b',
          error ? 'border-error' : 'border-outline-variant',
          'font-body text-[15px] text-on-surface',
          'placeholder:text-on-surface-variant',
          readOnly
            ? 'cursor-default opacity-60'
            : 'focus:border-primary focus:outline-none',
          'rounded-none transition-colors duration-150',
        ].join(' ')}
      />
      {hint && (
        <span className="mt-0.5 font-label text-[13px] text-on-surface-variant">
          {hint}
        </span>
      )}
      {error && <span className="font-label text-[12px] text-error">{error}</span>}
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
        'h-12 w-full px-6',
        'flex items-center justify-between',
        'font-label text-[14px] font-bold uppercase tracking-[0.06em]',
        'asymmetric-btn',
        isPrimary
          ? 'bg-primary text-primary-on shadow-electric-sm hover:shadow-electric'
          : 'bg-secondary text-secondary-on',
        'transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-60',
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
  const [timezone, setTimezone] = React.useState(() => detectBrowserTimezone().value);
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
    onComplete({ displayName: displayName.trim(), timezone });
    setIsLoading(false);
  }

  return (
    <div>
      <p className="mb-1 font-label text-[10px] font-medium uppercase tracking-[0.08em] text-outline">
        TELL US A BIT ABOUT YOURSELF
      </p>
      <h1 className="mb-8 font-headline text-4xl italic leading-tight text-on-surface md:text-5xl">
        Set up your profile
      </h1>

      <div className="mb-10 flex flex-col gap-8">
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

      <CtaButton label="Continue" onClick={handleContinue} isLoading={isLoading} />
    </div>
  );
}

// ─── Step 2 — Workspace setup ─────────────────────────────────────────────────

interface StepTwoProps {
  onComplete: () => void;
  accessToken: string;
  // If set, the user arrived via an invite link — hide create option,
  // pre-fill the code, and lock the path to 'join'.
  pendingInviteCode: string | null;
}

function StepTwo({ onComplete, accessToken, pendingInviteCode }: StepTwoProps) {
  const hasInvite = Boolean(pendingInviteCode);

  // Lock to 'join' if arriving via invite, otherwise default to 'create'
  const [path, setPath] = React.useState<WorkspacePath>(hasInvite ? 'join' : 'create');
  const [workspaceName, setWorkspaceName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false);
  // Pre-fill invite code from localStorage if present
  const [inviteCode, setInviteCode] = React.useState(pendingInviteCode ?? '');
  const [errors, setErrors] = React.useState<StepTwoErrors>({});
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(toSlug(workspaceName));
    }
  }, [workspaceName, slugManuallyEdited]);

  function handleSlugChange(value: string) {
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
      await acceptInvite(accessToken, inviteCode.trim());
      onComplete();
    } catch (err) {
      setErrors({ inviteCode: (err as Error).message });
    } finally {
      setIsLoading(false);
    }
  }

  function switchPath(next: WorkspacePath) {
    setPath(next);
    setErrors({});
  }

  return (
    <div>
      <p className="mb-1 font-label text-[10px] font-medium uppercase tracking-[0.08em] text-outline">
        {hasInvite ? "YOU'VE BEEN INVITED" : "WHERE YOUR TEAM'S UPDATES WILL LIVE"}
      </p>
      <h1 className="mb-6 font-headline text-4xl italic leading-tight text-on-surface md:text-5xl">
        {hasInvite ? 'Join your workspace' : 'Create your workspace'}
      </h1>

      {/* Show invite context banner when arriving via invite */}
      {hasInvite && (
        <div className="mb-6 border border-outline-variant bg-surface-high px-4 py-3">
          <p className="font-body text-[14px] text-on-surface-variant">
            You have a pending workspace invite. Accept it below to get started.
          </p>
        </div>
      )}

      {/* Segmented toggle — hidden when arriving via invite */}
      {!hasInvite && (
        <div className="mb-8 flex rounded-full border border-outline-variant p-[3px]">
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
                'flex-1 rounded-full px-4 py-2',
                'font-label text-[12px] font-medium tracking-[0.04em]',
                'transition-colors duration-150',
                path === option.value
                  ? 'bg-primary text-primary-on'
                  : 'text-on-surface-variant hover:text-on-surface',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {errors.general && (
        <p className="mb-4 font-label text-[13px] text-error">{errors.general}</p>
      )}

      {path === 'create' && (
        <div className="mb-10 flex flex-col gap-8">
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
                  <span className="text-on-surface-variant">soarup.app/join/</span>
                  <span className="text-primary">{slug}</span>
                </>
              ) : null
            }
          />
        </div>
      )}

      {path === 'join' && (
        <div className="mb-10 flex flex-col gap-8">
          <InputField
            id="invite-code"
            label="Invite Code"
            value={inviteCode}
            onChange={setInviteCode}
            placeholder="Enter your invite code"
            error={errors.inviteCode}
            autoFocus={!hasInvite}
            // Read-only when pre-filled from localStorage — prevents accidental edits
            readOnly={hasInvite}
          />
          {hasInvite && (
            <p className="font-label text-[12px] text-on-surface-variant">
              This code was pre-filled from your invite link.{' '}
              <button
                type="button"
                onClick={() => {
                  setInviteCode('');
                  // Allow manual edit if user wants to use a different code
                }}
                className="text-primary underline-offset-2 hover:underline"
              >
                Use a different code
              </button>
            </p>
          )}
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

  // Read pending invite code from localStorage on mount
  const [pendingInviteCode, setPendingInviteCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    const stored = localStorage.getItem(PENDING_INVITE_KEY);
    if (stored) setPendingInviteCode(stored);
  }, []);

  const accessToken = tokens?.access_token ?? '';
  const initialDisplayName = user?.full_name ?? '';

  async function handleStep1Complete(fields: StepOneFields) {
    setIsSubmittingStep1(true);
    setStep1Error(null);
    try {
      await patchProfile(accessToken, {
        full_name: fields.displayName,
        timezone: fields.timezone,
        is_onboarded: true,
      });

      if (user) {
        setUser({ ...user, full_name: fields.displayName });
      }

      const pendingCode = readPendingInviteCode();

      if (pendingCode) {
        try {
          await acceptInvite(accessToken, pendingCode);
          localStorage.removeItem(PENDING_INVITE_KEY);
          router.replace('/dashboard');
        } catch {
          localStorage.removeItem(PENDING_INVITE_KEY);
          setStep1Error('Invite link expired or invalid. Create a workspace instead.');
          setStep(2);
        }
      } else {
        setStep(2);
      }
    } catch (err) {
      setStep1Error(
        (err as Error).message ?? 'Failed to save profile. Please try again.',
      );
    } finally {
      setIsSubmittingStep1(false);
    }
  }

  function handleStep2Complete() {
    // Always clear pending invite from localStorage on workspace step completion
    localStorage.removeItem(PENDING_INVITE_KEY);

    if (user) {
      setUser({ ...user, is_onboarded: true });
    }
    router.replace('/dashboard');
  }

  return (
    <div className="space-y-8">
      <ProgressBar step={step} />

      {step === 1 && (
        <>
          <StepOne
            onComplete={handleStep1Complete}
            initialDisplayName={initialDisplayName}
          />
          {step1Error && (
            <p className="font-label text-[13px] text-error">{step1Error}</p>
          )}
          {isSubmittingStep1 && (
            <p className="font-label text-[13px] text-on-surface-variant">Saving...</p>
          )}
        </>
      )}

      {step === 2 && (
        <StepTwo
          onComplete={handleStep2Complete}
          accessToken={accessToken}
          pendingInviteCode={pendingInviteCode}
        />
      )}
    </div>
  );
}
