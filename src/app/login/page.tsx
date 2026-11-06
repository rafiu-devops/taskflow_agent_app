import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { getManagementUser } from "@/lib/auth/server";

export default async function LoginPage() {
  const user = await getManagementUser();
  if (user) redirect("/home");

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[2.5rem] bg-surface shadow-[0_30px_80px_rgba(7,20,38,0.18)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden min-h-[36rem] flex-col justify-between overflow-hidden bg-navy p-10 text-white lg:flex">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-base font-black text-white">TF</div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan">TaskFlow</p>
                <p className="text-xs text-slate-300">AI operations assistant</p>
              </div>
            </div>
            <h1 className="mt-12 max-w-md text-5xl font-semibold leading-[1.05] tracking-tight">
              Ask once.<br />Get the work done.
            </h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-slate-300">
              A secure conversational interface for your workforce data — tasks, assignments, performance and reports, all behind your existing permissions.
            </p>
          </div>
          <ul className="relative space-y-4 text-sm text-slate-200">
            {[
              "Your access stays controlled by TaskFlow permissions",
              "Every action is executed through the management backend",
              "Employees only see their own authorized records",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan/15 text-xs font-bold text-cyan">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col justify-center p-8 sm:p-12">
          <div className="mb-8 flex self-start lg:hidden">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-base font-black text-white">TF</div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">TaskFlow</p>
                <p className="text-xs text-muted">AI operations assistant</p>
              </div>
            </div>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Welcome back</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy">Sign in to TaskFlow</h2>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
