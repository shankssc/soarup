'use client';

// apps/web/src/components/domain/auth/login-form.tsx

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckboxField } from '@/components/ui/checkbox';
import { Separator, FormMessage } from '@/components/ui/separator';
import { OAuthButtons } from '@/components/domain/auth/oauth-buttons';
import { useAuth, useAuthStore } from '@/hooks/useAuth';
import { cn } from '@/lib/utils/cn';

// ─── Schema ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required.')
    .email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
  rememberMe: z.boolean(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoginFormProps {
  /** Called on successful login — defaults to pushing /dashboard */
  onSuccess?: () => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginForm({ onSuccess, className }: LoginFormProps) {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuth();
  const [oauthLoading, setOAuthLoading] = React.useState(false);
  // Tracks the gap between login() resolving and the actual navigation
  // firing. login() already guarantees the Supabase session cookie exists
  // by the time it resolves (see waitForSupabaseSessionCookie in
  // useAuth.ts), but isLoading flips to false as soon as login() returns —
  // before router.push has actually taken the user anywhere. Without this,
  // the button/spinner reverts to its resting state for a beat, then the
  // page suddenly navigates, which reads as the form finishing and then
  // hanging. This keeps the loading UI up for the full sequence instead.
  const [isNavigating, setIsNavigating] = React.useState(false);

  const searchParams = useSearchParams();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  // Clear API-level error when user starts typing again
  function handleFieldChange() {
    if (error) clearError();
  }

  async function onSubmit(values: LoginFormValues) {
    try {
      await login(values.email, values.password);
      if (onSuccess) {
        onSuccess();
      } else {
        // login() has already awaited the Supabase session cookie — no
        // arbitrary delay needed here. Just keep the loading UI active
        // until navigation actually happens.
        setIsNavigating(true);
        const { user } = useAuthStore.getState();
        if (user?.is_onboarded === false) {
          router.push('/onboarding');
        } else {
          const next = searchParams.get('next');
          router.push(next ? decodeURIComponent(next) : '/dashboard');
        }
      }
    } catch {
      // Error is already set in useAuth store
    }
  }

  const isSubmitting = isLoading || oauthLoading || isNavigating;

  return (
    <div className={cn('relative w-full space-y-8', className)}>
      {isSubmitting && (
        <div className="bg-surface/60 absolute inset-0 z-10 rounded-sm backdrop-blur-[1px]" />
      )}
      {/* OAuth buttons */}
      <OAuthButtons disabled={isSubmitting} onLoadingChange={setOAuthLoading} />

      {/* Divider */}
      <Separator label="or" />

      {/* Email/password form */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {/* API-level error — shown above fields */}
        <FormMessage message={error} variant="error" />

        {/* Email */}
        <Input
          {...register('email', { onChange: handleFieldChange })}
          label="Email"
          type="email"
          placeholder="you@soarup.app"
          error={errors.email?.message}
          disabled={isSubmitting}
          autoComplete="email"
          autoFocus
          data-testid="email-input"
        />

        {/* Password */}
        <div className="space-y-2">
          <Input
            {...register('password', { onChange: handleFieldChange })}
            label="Password"
            type="password"
            placeholder="••••••••"
            error={errors.password?.message}
            disabled={isSubmitting}
            autoComplete="current-password"
            data-testid="password-input"
          />

          {/* Forgot password link — sits below the password field */}
          <div className="flex justify-end">
            <Button
              variant="link"
              size="sm"
              type="button"
              onClick={() => router.push('/forgot-password')}
              className="text-[10px] uppercase tracking-widest"
            >
              Forgot password?
            </Button>
          </div>
        </div>

        {/* Remember me */}
        <CheckboxField
          {...register('rememberMe')}
          label="Remember me"
          disabled={isSubmitting}
        />

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          asymmetric
          loading={isSubmitting}
          disabled={isSubmitting}
          className="w-full"
          data-testid="login-submit"
        >
          Sign in
          <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
        </Button>
      </form>

      {/* Sign up link */}
      <p className="text-center font-headline text-lg text-primary">
        <button
          type="button"
          onClick={() => router.push('/signup')}
          className="decoration-secondary underline-offset-8 hover:underline"
        >
          New to SoarUp? Join here
        </button>
      </p>
    </div>
  );
}
