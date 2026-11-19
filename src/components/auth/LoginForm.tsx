"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mail } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Not authorised");
      router.replace("/chat");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <label className="block">
        <span className="text-xs font-semibold text-ink">Work email</span>
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 transition focus-within:border-brand focus-within:shadow-[0_0_0_4px_var(--ring-brand)]">
          <Mail className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            required
          />
        </div>
      </label>
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="tf-btn-primary group w-full px-4 py-4 text-sm font-bold"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {loading ? "Verifying access..." : "Sign in securely"}
        {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
      </button>
    </form>
  );
}

