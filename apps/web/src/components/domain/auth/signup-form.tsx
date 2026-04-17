'use client';

// apps/web/src/components/domain/auth/signup-form.tsx

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator, FormMessage } from '@/components/ui/separator';
import { OAuthButtons } from '@/components/domain/auth/oauth-buttons';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils/cn';

// ─── Schema ───────────────────────────────────────────────────────────────────
// Must match backend SignupRequest validator exactly:
//   - min 8 characters
//   - at least one uppercase letter
//   - at least one digit
// Password confirmation is frontend-only — not sent to the API.

const signupSchema = z
  .object({
    full_name: z.string().max(100, 'Name must be under 100 characters.').optional(),
    email: z
      .string()
      .min(1, 'Email is required.')
      .email('Please enter a valid email address.'),
    password: z
      .string()
      .min(1, 'Password is required.')
      .min(8, 'Password must be at least 8 characters.')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
      .regex(/[0-9]/, 'Password must contain at least one digit.'),
    confirm_password: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match.',
    path: ['confirm_password'],
  });

type SignupFormValues = z.infer<typeof signupSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignupFormProps {
  onSuccess?: () => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SignupForm({ onSuccess, className }: SignupFormProps) {
  const router = useRouter();
  const { signup, isLoading, error, clearError } = useAuth();
  const [oauthLoading, setOAuthLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    mode: 'onTouched',
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      confirm_password: '',
    },
  });

  function handleFieldChange() {
    if (error) clearError();
  }

  async function onSubmit(values: SignupFormValues) {
    try {
      // confirm_password is not sent to the API — only email, password, full_name
      await signup(values.email, values.password, values.full_name || undefined);
      if (onSuccess) {
        onSuccess();
      } else {
        // After signup, go to onboarding (profile setup)
        router.push('/onboarding');
      }
    } catch {
      // Error already set in useAuth store
    }
  }

  const isSubmitting = isLoading || oauthLoading;

  return (
    <div className={cn('w-full space-y-8', className)}>
      {/* OAuth buttons */}
      <OAuthButtons disabled={isSubmitting} onLoadingChange={setOAuthLoading} />

      <Separator label="or" />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {/* API-level error */}
        <FormMessage message={error} variant="error" />

        {/* Full name — optional */}
        <Input
          {...register('full_name', { onChange: handleFieldChange })}
          label="Full name (optional)"
          type="text"
          placeholder="Jane Doe"
          error={errors.full_name?.message}
          disabled={isSubmitting}
          autoComplete="name"
          autoFocus
        />

        {/* Email */}
        <Input
          {...register('email', { onChange: handleFieldChange })}
          label="Email"
          type="email"
          placeholder="you@soarup.app"
          error={errors.email?.message}
          disabled={isSubmitting}
          autoComplete="email"
        />

        {/* Password */}
        <Input
          {...register('password', { onChange: handleFieldChange })}
          label="Password"
          type="password"
          placeholder="••••••••"
          error={errors.password?.message}
          hint="Min 8 characters, one uppercase letter, one digit."
          disabled={isSubmitting}
          autoComplete="new-password"
        />

        {/* Confirm password */}
        <Input
          {...register('confirm_password', { onChange: handleFieldChange })}
          label="Confirm password"
          type="password"
          placeholder="••••••••"
          error={errors.confirm_password?.message}
          disabled={isSubmitting}
          autoComplete="new-password"
        />

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          asymmetric
          loading={isLoading}
          disabled={isSubmitting}
          className="w-full"
        >
          Create account
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </Button>
      </form>

      {/* Sign in link */}
      <p className="text-center font-headline text-lg italic text-primary">
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="decoration-secondary underline-offset-8 hover:underline"
        >
          Already have an account? Sign in
        </button>
      </p>
    </div>
  );
}
