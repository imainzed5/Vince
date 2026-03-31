import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuthShellProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  footer?: ReactNode;
  highlights: string[];
  title: string;
};

export function AuthShell({
  children,
  description,
  eyebrow,
  footer,
  highlights,
  title,
}: AuthShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(180deg,_rgba(248,250,252,0.98),_rgba(241,245,249,0.96))] px-4 py-8 text-foreground dark:bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.24),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.18),_transparent_26%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.96))] sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/72 p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] supports-[backdrop-filter]:bg-white/58 supports-[backdrop-filter]:backdrop-blur-2xl dark:border-white/8 dark:bg-slate-950/45 dark:shadow-[0_30px_80px_-46px_rgba(0,0,0,0.8)] dark:supports-[backdrop-filter]:bg-slate-950/36">
          <div className="max-w-xl space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700 dark:text-sky-300">
              {eyebrow}
            </p>
            <div className="space-y-3">
              <h1 className="max-w-lg text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                {title}
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
                {description}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {highlights.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] dark:border-white/8 dark:bg-white/5 dark:text-slate-200 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="rounded-[28px] border border-slate-200/80 bg-slate-950 px-6 py-5 text-slate-100 shadow-[0_28px_70px_-44px_rgba(15,23,42,0.8)] dark:border-white/10 dark:bg-slate-900">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">What opens after sign-in</p>
              <p className="mt-3 text-sm leading-7 text-slate-200/92">
                Vince routes you back into the right place automatically: your current workspace, your workspace list, or the create-or-join screen if you are brand new.
              </p>
            </div>
          </div>
        </section>

        <Card className="border-white/75 bg-white/84 shadow-[0_30px_70px_-45px_rgba(15,23,42,0.4)] supports-[backdrop-filter]:bg-white/78 dark:border-white/8 dark:bg-slate-950/52 dark:supports-[backdrop-filter]:bg-slate-950/44">
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {children}
            {footer}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}