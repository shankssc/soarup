"use client";

// apps/web/src/components/domain/auth/login-form.tsx

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckboxField } from "@/components/ui/checkbox";
import { Separator, FormMessage } from "@/components/ui/seperator";
import { OAuthButtons } from "@/components/domain/auth/oauth-buttons";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils/cn";

// ─── Schema ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Please enter a valid email address."),
  password: z
    .string()
    .min(1, "Password is required.")
    .min(8, "Password must be at least 8 characters."),
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
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
        router.push("/dashboard");
      }
    } catch {
      // Error is already set in useAuth store — no need to handle here
    }
  }

  const isSubmitting = isLoading || oauthLoading;

  return (
    <div className={cn("w-full space-y-8", className)}>
      {/* OAuth buttons */}
      <OAuthButtons
        disabled={isSubmitting}
        onLoadingChange={setOAuthLoading}
      />

      {/* Divider */}
      <Separator label="or" />

      {/* Email/password form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-6"
      >
        {/* API-level error — shown above fields */}
        <FormMessage message={error} variant="error" />

        {/* Email */}
        <Input
          {...register("email", { onChange: handleFieldChange })}
          label="Email"
          type="email"
          placeholder="you@soarup.app"
          error={errors.email?.message}
          disabled={isSubmitting}
          autoComplete="email"
          autoFocus
        />

        {/* Password */}
        <div className="space-y-2">
          <Input
            {...register("password", { onChange: handleFieldChange })}
            label="Password"
            type="password"
            placeholder="••••••••"
            error={errors.password?.message}
            disabled={isSubmitting}
            autoComplete="current-password"
          />

          {/* Forgot password link — sits below the password field */}
          <div className="flex justify-end">
            <Button
              variant="link"
              size="sm"
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="text-[10px] uppercase tracking-widest"
            >
              Forgot password?
            </Button>
          </div>
        </div>

        {/* Remember me */}
        <CheckboxField
          {...register("rememberMe")}
          label="Remember me"
          disabled={isSubmitting}
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
          Sign in
          <span className="material-symbols-outlined text-[18px]">
            arrow_forward
          </span>
        </Button>
      </form>

      {/* Sign up link */}
      <p className="text-center font-headline italic text-lg text-primary">
        <button
          type="button"
          onClick={() => router.push("/signup")}
          className="hover:underline underline-offset-8 decoration-secondary"
        >
          Create your workspace
        </button>
      </p>
    </div>
  );
}
