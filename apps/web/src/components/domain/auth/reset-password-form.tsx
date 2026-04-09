"use client";

// apps/web/src/components/domain/auth/reset-password-form.tsx

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/separator";
import { cn } from "@/lib/utils/cn";

// ─── Schema ───────────────────────────────────────────────────────────────────
// Password rules match backend ResetPasswordRequest validator exactly.

const resetPasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(1, "Password is required.")
      .min(8, "Password must be at least 8 characters.")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
      .regex(/[0-9]/, "Password must contain at least one digit."),
    confirm_password: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match.",
    path: ["confirm_password"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResetPasswordFormProps {
  className?: string;
}

// ─── Server action ────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function resetPassword(
  recoveryToken: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Token sent as Authorization header — backend extracts it there
      Authorization: `Bearer ${recoveryToken}`,
    },
    body: JSON.stringify({ new_password: newPassword }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      data?.message ?? "Failed to reset password. The link may have expired."
    );
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ResetPasswordForm({ className }: ResetPasswordFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [recoveryToken, setRecoveryToken] = React.useState<string | null>(null);
  const [tokenError, setTokenError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  // Extract recovery token from URL on mount.
  // Supabase delivers it either in the query string or the URL hash.
  // Token lives in React state only — never written to localStorage.
  React.useEffect(() => {
    const fromQuery = searchParams.get("access_token");

    // Hash params (#access_token=xxx) — Supabase default for some flows
    const hashParams = new URLSearchParams(
      window.location.hash.substring(1)
    );
    const fromHash = hashParams.get("access_token");

    const token = fromQuery ?? fromHash;

    if (token) {
      setRecoveryToken(token);
    } else {
      setTokenError(
        "Invalid or missing recovery token. Please request a new reset link."
      );
    }
  }, [searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: "", confirm_password: "" },
  });

  async function onSubmit(values: ResetPasswordValues) {
    if (!recoveryToken) return;

    setIsLoading(true);
    setApiError(null);

    try {
      await resetPassword(recoveryToken, values.new_password);
      setSuccess(true);
      // Redirect to login after short delay so user can read success message
      setTimeout(() => router.push("/login?reset=success"), 2500);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className={cn("w-full space-y-6 text-center", className)}>
        <div className="flex flex-col items-center gap-3">
          <span
            className="material-symbols-outlined text-primary text-[40px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            check_circle
          </span>
          <p className="font-body text-sm text-on-surface-variant">
            Password updated. Redirecting to sign in...
          </p>
        </div>
      </div>
    );
  }

  // ── Invalid token state ────────────────────────────────────────────────────

  if (tokenError) {
    return (
      <div className={cn("w-full space-y-6", className)}>
        <FormMessage message={tokenError} variant="error" />
        <Button
          variant="primary"
          size="lg"
          asymmetric
          className="w-full"
          onClick={() => router.push("/forgot-password")}
        >
          Request new reset link
        </Button>
      </div>
    );
  }

  // ── Form state ─────────────────────────────────────────────────────────────

  return (
    <div className={cn("w-full space-y-6", className)}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-6"
      >
        <FormMessage message={apiError} variant="error" />

        <Input
          {...register("new_password")}
          label="New password"
          type="password"
          placeholder="••••••••"
          error={errors.new_password?.message}
          hint="Min 8 characters, one uppercase letter, one digit."
          disabled={isLoading}
          autoComplete="new-password"
          autoFocus
        />

        <Input
          {...register("confirm_password")}
          label="Confirm new password"
          type="password"
          placeholder="••••••••"
          error={errors.confirm_password?.message}
          disabled={isLoading}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          asymmetric
          loading={isLoading}
          disabled={isLoading || !recoveryToken}
          className="w-full"
        >
          Update password
          <span className="material-symbols-outlined text-[18px]">
            arrow_forward
          </span>
        </Button>
      </form>
    </div>
  );
}
