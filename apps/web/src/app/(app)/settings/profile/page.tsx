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

export default function ProfileSettingsPage() {
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();

  const [displayName, setDisplayName] = useState(user?.full_name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [isDirty, setIsDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const nameChanged = displayName !== (user?.full_name ?? '');
    const tzChanged = timezone !== (user?.timezone ?? 'UTC');
    setIsDirty(nameChanged || tzChanged);
  }, [displayName, timezone, user]);

  const initials = (user?.full_name ?? user?.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function handleSave() {
    updateProfile.mutate({ full_name: displayName, timezone });
    setIsDirty(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadAvatar.mutate(file);
  }

  return (
    <div className="max-w-lg px-6 py-10">
      <h1 className="mb-8 font-serif text-3xl italic text-on-surface">Profile</h1>

      {/* Avatar */}
      <div className="mb-8 flex flex-col items-start gap-3">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary-container">
          {user?.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt="Avatar"
              width={32}
              height={32}
              className="rounded-full object-cover"
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
        <label className="mb-2 block text-xs uppercase tracking-widest text-on-surface-variant">
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
        <label className="mb-2 block text-xs uppercase tracking-widest text-on-surface-variant">
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
          className="relative rounded-bl-lg rounded-br-3xl rounded-tl-3xl rounded-tr-lg bg-primary px-6 py-2.5 text-sm font-semibold text-[#004b58] transition-opacity hover:opacity-90 disabled:opacity-40"
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
