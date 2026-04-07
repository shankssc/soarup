import * as React from "react";
import { LoginForm } from "@/components/domain/auth/login-form";

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Server Component — no auth check needed here (handled by middleware).
// The LoginForm inside is a Client Component that owns all interactivity.

export default function LoginPage() {
  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div className="space-y-1">
        <h1 className="font-headline italic text-4xl md:text-5xl text-on-surface leading-tight">
          Welcome back
        </h1>
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Sign in to your workspace
        </p>
      </div>

      {/* Form */}
      <LoginForm />
    </div>
  );
}
