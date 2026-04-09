"use client";

// apps/web/src/components/domain/auth/forgot-password-form.tsx

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/seperator";
import { cn } from "@/lib/utils/cn";

// ─── Schema ───────────────────────────────────────────────────────────────────

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Please enter a valid email address."),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForgotPasswordFormProps {
  className?: string;
}

// ─── API call ─────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      redirect_to: `${window.location.origin}/reset-password`,
    }),
  });

  // Backend always returns 200 for security — no email enumeration
  // We only throw on network/server errors
  if (!res.ok && res.status >= 500) {
    throw new Error("Service temporarily unavailable. Please try again.");
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ForgotPasswordForm({ className }: ForgotPasswordFormProps) {
  const router = useRouter();
  const [submitted, setSubmitted] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setIsLoading(true);
    setError(null);

    try {
      await requestPasswordReset(values.email);
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className={cn("w-full space-y-6", className)}>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span
              className="material-symbols-outlined text-primary text-[28px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              mark_email_read
            </span>
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
              Check your inbox
            </p>
          </div>
          <p className="font-body text-sm text-on-surface-variant leading-relaxed">
            If an account exists for{" "}
            <span className="text-on-surface font-medium">{getValues("email")}</span>,
            you will receive a password reset link shortly.
          </p>
          <p className="font-body text-xs text-on-surface-variant">
            Didn`t receive it? Check your spam folder or{" "}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="text-primary hover:underline underline-offset-4"
            >
              try again
            </button>
            .
          </p>
        </div>

        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={() => router.push("/login")}
        >
          Back to sign in
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
        <FormMessage message={error} variant="error" />

        <Input
          {...register("email")}
          label="Email"
          type="email"
          placeholder="you@soarup.app"
          error={errors.email?.message}
          disabled={isLoading}
          autoComplete="email"
          autoFocus
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          asymmetric
          loading={isLoading}
          className="w-full"
        >
          Send reset link
          <span className="material-symbols-outlined text-[18px]">
            arrow_forward
          </span>
        </Button>
      </form>

      <p className="text-center">
        <Button
          variant="link"
          size="sm"
          type="button"
          onClick={() => router.push("/login")}
        >
          Back to sign in
        </Button>
      </p>
    </div>
  );
}
