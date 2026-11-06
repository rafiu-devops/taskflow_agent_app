import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-[2rem] bg-surface p-8 text-center shadow-[0_24px_60px_rgba(7,20,38,0.12)]">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-navy text-xl font-black text-cyan">
          TF
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">You&apos;re offline</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          TaskFlow AI needs a connection to reach your workspace. Live tasks, permissions and agent actions are unavailable until you&apos;re back online.
        </p>
        <Link href="/home" className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-200 hover:bg-[#0670e8]">
          Try again
        </Link>
        <p className="mt-4 text-xs text-muted">Your private data is never served from an untrusted offline cache.</p>
      </section>
    </main>
  );
}
