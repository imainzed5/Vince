import type { ReactNode } from "react";

type AuthShellProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  footer?: ReactNode;
  formTitle?: string;
  heroDescription: string;
  heroTitle: ReactNode;
  highlights: string[];
  infoDescription?: string;
  infoEyebrow?: string;
  title: string;
};

export function AuthShell({
  children,
  description,
  eyebrow,
  footer,
  formTitle,
  heroDescription,
  heroTitle,
  highlights,
  infoDescription,
  infoEyebrow = "What opens after sign-in",
  title,
}: AuthShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_18%_20%,_rgba(129,190,255,0.34),_transparent_24%),radial-gradient(circle_at_78%_18%,_rgba(244,173,255,0.2),_transparent_22%),radial-gradient(circle_at_70%_78%,_rgba(164,214,255,0.28),_transparent_26%),linear-gradient(180deg,_#edf3fb,_#f8fafc)] px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-16 h-72 w-72 -translate-x-[31rem] rounded-full bg-sky-200/60 blur-3xl" />
        <div className="absolute bottom-10 right-1/2 h-80 w-80 translate-x-[30rem] rounded-full bg-violet-100/60 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-24 -translate-y-1/2 rounded-full bg-cyan-100/55 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="w-full max-w-5xl overflow-hidden rounded-[34px] border border-white/75 bg-white/44 shadow-[0_40px_120px_-54px_rgba(15,23,42,0.42)] ring-1 ring-slate-200/50 supports-[backdrop-filter]:bg-white/34 supports-[backdrop-filter]:backdrop-blur-3xl">
          <div className="flex items-center justify-between border-b border-white/50 bg-white/36 px-5 py-3.5 text-[11px] font-medium tracking-[0.12em] text-slate-500 uppercase supports-[backdrop-filter]:bg-white/24 supports-[backdrop-filter]:backdrop-blur-2xl">
            <div className="flex items-center gap-2.5">
              <span className="size-3 rounded-full border border-black/8 bg-[#ff5f57] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]" />
              <span className="size-3 rounded-full border border-black/8 bg-[#febc2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]" />
              <span className="size-3 rounded-full border border-black/8 bg-[#28c840] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]" />
            </div>
            <span>Secure access</span>
          </div>

          <div className="grid lg:grid-cols-[1.06fr_0.94fr]">
            <section className="relative overflow-hidden border-b border-black/18 bg-[radial-gradient(circle_at_68%_18%,_rgba(96,165,250,0.09),_transparent_16%),linear-gradient(180deg,#232833,#1c202a)] px-8 py-9 text-white lg:border-b-0 lg:border-r lg:border-r-black/16 sm:px-9 sm:py-10 lg:px-10 lg:py-11">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0))]" />
            <div className="relative flex h-full flex-col gap-8">
              <div className="space-y-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">{eyebrow}</p>
                <div className="space-y-4">
                  <div className="max-w-sm text-4xl font-semibold tracking-tight text-balance sm:text-[3.25rem] sm:leading-[0.95]">
                    {heroTitle}
                  </div>
                  <p className="max-w-md text-base leading-7 text-white/70">{heroDescription}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {highlights.map((item) => (
                  <div
                    key={item}
                    className="inline-flex items-center rounded-full border border-black/22 bg-black/22 px-3 py-2 text-sm font-medium text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
                  >
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto rounded-[20px] border border-black/22 bg-black/24 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_18px_40px_-32px_rgba(0,0,0,0.58)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">{infoEyebrow}</p>
                <p className="mt-3 max-w-md text-sm leading-7 text-white/74">
                  {infoDescription ??
                    "Vince routes you back automatically: your current workspace, your workspace list, or the create-or-join screen if you are brand new."}
                </p>
              </div>
            </div>
          </section>

          <section className="bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(248,250,252,0.88))] px-8 py-9 sm:px-10 sm:py-11 lg:px-8 xl:px-10 supports-[backdrop-filter]:backdrop-blur-2xl">
            <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h1 className="text-[2rem] font-semibold tracking-tight text-slate-900">{formTitle ?? title}</h1>
                  <p className="text-sm leading-7 text-slate-500">{description}</p>
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
              </div>

              <div className="mt-7 space-y-5">
                {children}
                {footer}
              </div>
            </div>
          </section>
          </div>
        </div>
      </div>
    </main>
  );
}