'use client';

// apps/web/src/app/(app)/settings/profile/page.tsx

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import {
  useUpdateProfile,
  useUploadAvatar,
  useDeleteAvatar,
} from '@/hooks/useProfileSettings';
import { useDebounce } from '@/hooks/useDebounce';
import { useUsernameAvailability } from '@/hooks/usePublicProfile';

export default function ProfileSettingsPage() {
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();

  const [displayName, setDisplayName] = useState(user?.full_name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');

  const [usernameInput, setUsernameInput] = useState(user?.username ?? '');
  const [usernameDirty, setUsernameDirty] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [tagline, setTagline] = useState(user?.tagline ?? '');

  const [isDirty, setIsDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const debouncedUsername = useDebounce(usernameInput, 500);

  const availabilityQuery = useUsernameAvailability(
    debouncedUsername,
    user?.id,
    usernameDirty && debouncedUsername.length >= 3,
  );

  useEffect(() => {
    const nameChanged = displayName !== (user?.full_name ?? '');
    const tzChanged = timezone !== (user?.timezone ?? 'UTC');
    const usernameChanged = usernameInput !== (user?.username ?? '');
    const bioChanged = bio !== (user?.bio ?? '');
    const taglineChanged = tagline !== (user?.tagline ?? '');
    setIsDirty(
      nameChanged || tzChanged || usernameChanged || bioChanged || taglineChanged,
    );
  }, [displayName, timezone, usernameInput, bio, tagline, user]);

  const initials = (user?.full_name ?? user?.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Username is usable if it's the saved one or a newly available one
  const hasUsername = !!(
    user?.username ||
    (availabilityQuery.data?.available && usernameInput.length >= 3)
  );

  function handleSave() {
    updateProfile.mutate({
      full_name: displayName,
      timezone,
      username: usernameInput || undefined,
      bio: bio || undefined,
      tagline: tagline || undefined,
    });
    setIsDirty(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadAvatar.mutate(file);
  }

  function UsernameIndicator() {
    if (!usernameDirty || usernameInput.length < 3) return null;
    if (usernameInput === user?.username) {
      return (
        <span className="flex items-center gap-1 font-label text-[10px] text-emerald-400">
          <span className="material-symbols-outlined text-[12px]">check_circle</span>
          Your current username
        </span>
      );
    }
    if (availabilityQuery.isLoading) {
      return (
        <span className="material-symbols-outlined animate-spin text-[14px] text-outline">
          progress_activity
        </span>
      );
    }
    if (availabilityQuery.data?.available) {
      return (
        <span className="flex items-center gap-1 font-label text-[10px] text-emerald-400">
          <span className="material-symbols-outlined text-[12px]">check_circle</span>
          Available
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 font-label text-[10px] text-error">
        <span className="material-symbols-outlined text-[12px]">cancel</span>
        Already taken
      </span>
    );
  }

  return (
    <div className="max-w-lg px-6 py-10">
      <h1 className="mb-8 font-serif text-3xl text-on-surface">Profile</h1>

      {/* Username */}
      <div className="mb-6">
        <label className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Username
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-outline">@</span>
          <input
            value={usernameInput}
            onChange={(e) => {
              setUsernameInput(e.target.value.toLowerCase());
              setUsernameDirty(true);
            }}
            placeholder="your-username"
            className="flex-1 border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface transition-colors focus:border-primary focus:outline-none"
          />
          <UsernameIndicator />
        </div>
        <p className="mt-1 font-label text-[10px] text-outline">
          soarup.app/u/{usernameInput || 'your-username'}
        </p>
      </div>

      {/* Bio */}
      <div className="mb-6">
        <label className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Bio
        </label>
        <input
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Full-stack engineer building in public"
          maxLength={160}
          className="w-full border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface transition-colors placeholder:text-outline focus:border-primary focus:outline-none"
        />
      </div>

      {/* Tagline */}
      <div className="mb-6">
        <label className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Tagline
        </label>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Building in public · Open source"
          maxLength={60}
          className="w-full border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface transition-colors placeholder:text-outline focus:border-primary focus:outline-none"
        />
      </div>

      {/* Public profile toggle */}
      <div className="mb-8 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-body text-sm text-on-surface">Make profile public</p>
            <p className="mt-0.5 font-label text-[11px] text-outline">
              {hasUsername
                ? `Share your activity at soarup.app/u/${user?.username ?? usernameInput}`
                : 'Set a username above to enable your public profile'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={user?.profile_public ?? false}
            disabled={!hasUsername || updateProfile.isPending}
            onClick={() =>
              updateProfile.mutate({ profile_public: !(user?.profile_public ?? false) })
            }
            className={[
              'relative h-6 w-12 flex-shrink-0 overflow-hidden rounded-full transition-colors',
              'disabled:opacity-40',
              user?.profile_public ? 'bg-primary' : 'bg-surface-highest',
            ].join(' ')}
          >
            <span
              className={[
                'absolute bottom-1 top-1 w-4 rounded-full bg-white transition-all duration-200',
                user?.profile_public ? 'left-auto right-1' : 'left-1 right-auto',
              ].join(' ')}
            />
          </button>
        </div>

        {/* Shareable URL when public */}
        {user?.profile_public && user?.username && (
          <div className="flex items-center gap-2 rounded-card border border-outline-variant bg-surface-high p-3">
            <code className="flex-1 truncate font-label text-xs text-primary">
              soarup.app/u/{user.username}
            </code>
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(
                  `${window.location.origin}/u/${user.username}`,
                )
              }
              className="flex-shrink-0 font-label text-[10px] uppercase tracking-[0.1em] text-outline transition-colors hover:text-primary"
            >
              Copy
            </button>
            <a
              href={`/u/${user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 font-label text-[10px] uppercase tracking-[0.1em] text-outline transition-colors hover:text-primary"
            >
              View →
            </a>
          </div>
        )}
      </div>

      {/* Avatar */}
      <div className="mb-8 flex flex-col items-start gap-3">
        <label className="mb-1 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Avatar
        </label>
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary-container">
          {user?.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt="Avatar"
              width={80}
              height={80}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span className="text-2xl font-semibold text-primary-on-container">
              {initials}
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadAvatar.isPending}
          className="text-sm text-primary transition-opacity hover:opacity-80"
        >
          {uploadAvatar.isPending ? 'Uploading…' : 'Change photo'}
        </button>
        {user?.avatar_url && (
          <button
            onClick={() => deleteAvatar.mutate()}
            disabled={deleteAvatar.isPending}
            className="text-sm text-on-surface-variant transition-colors hover:text-error"
          >
            {deleteAvatar.isPending ? 'Removing…' : 'Remove photo'}
          </button>
        )}
      </div>

      {/* Display name */}
      <div className="mb-6">
        <label className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Display name
        </label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full border-b border-outline-variant bg-transparent py-2 text-on-surface transition-colors focus:border-primary focus:outline-none"
        />
      </div>

      {/* Timezone */}
      <div className="mb-8">
        <label className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Timezone
        </label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full border-b border-outline-variant bg-transparent py-2 text-on-surface transition-colors focus:border-primary focus:outline-none"
        >
          {Intl.supportedValuesOf('timeZone').map((tz) => (
            <option key={tz} value={tz} className="bg-surface">
              {tz}
            </option>
          ))}
        </select>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!isDirty || updateProfile.isPending}
          className="asymmetric-btn bg-primary px-6 py-2.5 font-label text-[12px] font-medium uppercase tracking-[0.06em] text-primary-on transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {updateProfile.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {isDirty && (
          <span className="h-2 w-2 rounded-full bg-amber-400" title="Unsaved changes" />
        )}
      </div>
    </div>
  );
}
