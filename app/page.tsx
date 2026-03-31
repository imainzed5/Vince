import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  GitPullRequestDraft,
  KanbanSquare,
  LayoutDashboard,
  Layers3,
  MessageSquareText,
  NotebookPen,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaceRoute } from "@/lib/workspace";

import { LandingHover, LandingReveal } from "./landing-motion";

export const metadata: Metadata = {
  title: "Vince",
  description:
    "Vince brings project boards, shared notes, team chat, and activity into one focused workspace for small freelance and student teams.",
};

const heroHighlights = [
  "Boards, notes, and team chat in one flow",
  "Built for freelance teams and student groups",
  "Fast to adopt, with no setup tax",
] as const;

const workspaceNavItems = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Activity, label: "Activity" },
  { icon: MessageSquareText, label: "Workspace Chat" },
  { icon: CheckCircle2, label: "My Tasks" },
] as const;

const workflowLayers = [
  {
    icon: Layers3,
    title: "Workspace",
    description:
      "See project health, recent movement, team chat, and personal workload without bouncing between separate tools.",
  },
  {
    icon: KanbanSquare,
    title: "Project",
    description:
      "Every project gets its own board, notes, chat, and activity so the team always knows where the context belongs.",
  },
  {
    icon: Target,
    title: "Task",
    description:
      "Tasks carry clear ownership, priority, due dates, and blockers so small teams can move without guesswork.",
  },
] as const;

const problemPoints = [
  {
    icon: MessageSquareText,
    title: "Tasks vanish into chat",
    description:
      "Requirements, approvals, and next steps disappear into message threads, so the team remembers the conversation but not the action.",
  },
  {
    icon: NotebookPen,
    title: "Project context drifts away",
    description:
      "Briefs, notes, and decisions end up in separate docs that nobody revisits at the right time, so updates keep repeating.",
  },
  {
    icon: GitPullRequestDraft,
    title: "Heavy tools create admin work",
    description:
      "Most PM tools assume a bigger org and more process. Small teams need clarity immediately, not another system to manage.",
  },
] as const;

const boardBenefits = [
  "Flag blockers and show exactly what is stopping work.",
  "Use readable project-specific task IDs like CWR-04.",
  'Press "C" to create a task instantly from the board.',
] as const;

const contextBenefits = [
  "Dedicated project chat, plus a workspace-wide channel for broader coordination.",
  "Shared project notes for briefs, decisions, and checklists.",
  "Visible activity so updates do not vanish into scrollback.",
] as const;

const smallTeamReasons = [
  {
    title: "Enough structure, no process theater",
    description:
      "You get a real workflow, visible ownership, and blocker tracking without spending days configuring rules and custom views.",
  },
  {
    title: "Everyone sees the same picture",
    description:
      "Boards, notes, chat, and activity all live together, so the team can align quickly without constant status meetings.",
  },
  {
    title: "Ready to use on day one",
    description:
      "Create a workspace, invite the team, and start moving work. Vince is built for teams that need traction fast.",
  },
] as const;

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const destination = await getUserWorkspaceRoute(supabase, user.id);
    redirect(destination.path);
  }

  return (
    <div className="landing-shell min-h-screen overflow-x-clip bg-[#f7f8fb] text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      <div className="landing-grid pointer-events-none absolute inset-0 -z-10 opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.18),_transparent_38%),radial-gradient(circle_at_78%_18%,_rgba(14,165,233,0.12),_transparent_18%),linear-gradient(180deg,_rgba(255,255,255,0.88),_rgba(247,248,251,0.96))]" />

      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-[#f7f8fb]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="text-sm font-medium tracking-[0.18em] text-slate-500 uppercase">Focused collaboration</div>

          <div className="hidden items-center gap-6 text-sm font-medium text-slate-500 md:flex">
            <a className="transition-colors hover:text-slate-900" href="#product">
              Product
            </a>
            <a className="transition-colors hover:text-slate-900" href="#workflow">
              How it works
            </a>
            <a className="transition-colors hover:text-slate-900" href="#why-vince">
              Why Vince
            </a>
          </div>

          <div className="flex items-center gap-4 text-sm font-medium text-slate-600 md:gap-6">
            <Link className="transition-colors hover:text-slate-900" href="/login">
              Sign in
            </Link>
            <Link
              className="rounded-full bg-slate-900 px-4 py-2 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.85)] transition-[background-color,transform,box-shadow] duration-200 motion-safe:hover:-translate-y-px hover:bg-slate-800"
              href="/signup"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-18 pt-24 md:pb-22 md:pt-28">
          <LandingReveal className="mx-auto max-w-4xl text-center">
            {/* Banner removed as requested */}
            <h1 className="mt-6 text-balance text-5xl font-semibold leading-[0.95] tracking-tight text-slate-950 md:text-7xl">
              Keep tasks, notes, and team chat in the same place.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
              Vince is the focused workspace for small teams that have outgrown scattered docs,
              message threads, and lightweight task lists. It gives you one shared place to plan,
              talk, and move work forward without enterprise overhead.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3.5 font-medium text-white shadow-[0_18px_40px_-20px_rgba(37,99,235,0.9)] transition-[background-color,transform,box-shadow] duration-200 motion-safe:hover:-translate-y-px hover:bg-blue-700 sm:w-auto"
                href="/signup"
              >
                Create a workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                className="inline-flex w-full items-center justify-center rounded-full border border-slate-300/90 bg-white/90 px-6 py-3.5 font-medium text-slate-700 transition-[background-color,transform] duration-200 motion-safe:hover:-translate-y-px hover:bg-white sm:w-auto"
                href="/login"
              >
                Join your team
              </Link>
            </div>
            <p className="mt-5 text-sm font-medium text-slate-500">
              Best for teams of 2-6 people who want momentum without a setup tax.
            </p>
          </LandingReveal>

          <LandingReveal className="mx-auto mt-10 grid max-w-5xl gap-3 sm:grid-cols-3" delay={0.08}>
            {heroHighlights.map((item) => (
              <div
                key={item}
                className="landing-panel rounded-2xl border border-white/70 px-4 py-4 text-sm font-medium text-slate-700 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.42)]"
              >
                {item}
              </div>
            ))}
          </LandingReveal>
        </section>

        <section className="px-6 pb-32" id="product">
          <LandingReveal className="mx-auto max-w-6xl" delay={0.14}>
            <LandingHover className="relative mx-auto overflow-hidden rounded-[2rem] border border-white/70 bg-white/92 p-3 shadow-[0_40px_120px_-56px_rgba(15,23,42,0.4)] backdrop-blur">
              <div className="pointer-events-none absolute inset-x-10 top-0 h-20 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.18),_transparent_58%)]" />

              <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-[linear-gradient(180deg,#f9fbff,#eef4ff)]">
                  <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Workspace overview
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-slate-900">
                        Studio Workspace
                      </h2>
                    </div>
                    <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      Live product view
                    </div>
                  </div>

                  <div className="grid gap-0 md:grid-cols-[16rem_1fr]">
                    <div className="border-b border-slate-200 bg-white/70 p-4 md:border-b-0 md:border-r">
                      <div className="flex items-center gap-3 rounded-2xl bg-slate-950 px-3 py-3 text-white shadow-[0_18px_36px_-26px_rgba(15,23,42,0.95)]">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/20 text-sm font-semibold text-blue-100">
                          SW
                        </div>
                        <div>
                          <p className="text-sm font-medium">Studio Workspace</p>
                          <p className="text-xs text-white/58">2 projects · 4 members</p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1.5">
                        {workspaceNavItems.map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-slate-600 transition-colors hover:bg-white"
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Team pulse
                        </p>
                        <div className="mt-4 space-y-3 text-sm text-slate-600">
                          <div className="flex items-center justify-between">
                            <span>In progress</span>
                            <span className="font-medium text-slate-900">6 tasks</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Blocked</span>
                            <span className="font-medium text-red-600">1 task</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Due this week</span>
                            <span className="font-medium text-slate-900">4 tasks</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 md:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Client Website Redesign
                          </p>
                          <h3 className="mt-1 text-xl font-semibold text-slate-950">
                            Board, notes, chat, and activity in one project view
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                          <Clock3 className="h-3.5 w-3.5" />
                          In progress
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 2xl:grid-cols-[1.1fr_0.9fr]">
                        <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                Board
                              </p>
                              <p className="mt-1 text-sm font-medium text-slate-700">
                                Work moves across a clear five-column workflow.
                              </p>
                            </div>
                            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                              8 open tasks
                            </div>
                          </div>

                          <div className="mt-4 space-y-3">
                            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/90">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    Todo
                                  </p>
                                  <p className="mt-2 text-sm font-medium text-slate-700">
                                    CWR-04 Draft pricing copy
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                                  2 items
                                </span>
                              </div>
                            </div>
                            <div className="rounded-2xl border border-red-200 bg-white p-3 shadow-sm ring-1 ring-red-100/80">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    In Progress
                                  </p>
                                  <div className="mt-2 flex items-center gap-2">
                                    <p className="text-sm font-medium text-slate-700">CWR-05 Mobile nav</p>
                                    <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                                  </div>
                                  <p className="mt-2 text-xs font-medium text-red-700">
                                    Blocked: waiting on updated logo assets
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">
                                  1 item
                                </span>
                              </div>
                            </div>
                            <div className="rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm ring-1 ring-emerald-100/80">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    In Review
                                  </p>
                                  <p className="mt-2 text-sm font-medium text-slate-700">
                                    CWR-03 QA landing page states
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                  1 item
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-4">
                          <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                Notes
                              </p>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                                Shared
                              </span>
                            </div>
                            <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/90">
                              <p className="text-sm font-semibold text-slate-900">Launch checklist</p>
                              <div className="mt-3 space-y-2 text-sm text-slate-600">
                                <p>Finalize headline and CTA copy.</p>
                                <p>Confirm responsive states across board and notes.</p>
                                <p>Share the review link with the client.</p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                Activity
                              </p>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                                Realtime
                              </span>
                            </div>
                            <div className="mt-3 space-y-2">
                              <div className="rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200/90">
                                <p className="font-medium text-slate-900">Nina moved CWR-03 into In Review</p>
                                <p className="mt-1 text-slate-500">2 minutes ago</p>
                              </div>
                              <div className="rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200/90">
                                <p className="font-medium text-slate-900">Jules updated the launch checklist note</p>
                                <p className="mt-1 text-slate-500">8 minutes ago</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="landing-panel rounded-[1.6rem] border border-white/70 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.4)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Workspace chat
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      Quick coordination stays close to the work.
                    </p>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200/90">
                        <p className="font-medium text-slate-900">Jules</p>
                        <p className="mt-1 text-slate-600">
                          Pushed the updated copy. Can someone review mobile spacing?
                        </p>
                      </div>
                      <div className="ml-auto max-w-[18rem] rounded-2xl bg-blue-600 px-4 py-3 text-sm text-white shadow-[0_18px_36px_-24px_rgba(37,99,235,0.92)]">
                        Reviewing it now. I&apos;ll move the task once the footer spacing looks right.
                      </div>
                    </div>
                  </div>

                  <div className="landing-panel rounded-[1.6rem] border border-white/70 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.4)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Product preview
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      A quick look at how the workspace can feel in practice.
                    </p>
                    <div className="mt-4 overflow-hidden rounded-[1.4rem] border border-slate-200 bg-slate-50 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-200 bg-white/92 px-4 py-3">
                        <span className="text-sm font-medium text-slate-700">Workspace snapshot</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                          Preview
                        </span>
                      </div>
                      <div className="relative aspect-[3/2] bg-white">
                        <Image
                          src="/landing-workspace-snapshot.png"
                          alt="Workspace preview showing a Vince board, shared notes, recent activity, and workspace chat"
                          fill
                          priority
                          sizes="(min-width: 1024px) 32vw, (min-width: 768px) 40vw, 100vw"
                          className="object-cover object-top"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </LandingHover>
          </LandingReveal>
        </section>

        <section className="bg-slate-950 py-24 text-white">
          <LandingReveal className="mx-auto max-w-5xl px-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
              Why teams switch
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight md:text-5xl">
              Scattered tools make small teams slower than they should be.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/64">
              When tasks live in one tool, notes live in another, and updates happen in chat, the
              team spends too much time reconstructing context instead of moving the work forward.
            </p>
          </LandingReveal>

          <LandingReveal className="mx-auto mt-14 grid max-w-6xl gap-6 px-6 md:grid-cols-3" delay={0.08}>
            {problemPoints.map((point) => (
              <LandingHover key={point.title} className="h-full">
                <div className="h-full rounded-[1.7rem] border border-white/10 bg-white/5 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                  <point.icon className="h-8 w-8 text-white/58" />
                  <h3 className="mt-5 text-xl font-semibold text-white">{point.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/62">{point.description}</p>
                </div>
              </LandingHover>
            ))}
          </LandingReveal>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-28" id="workflow">
          <LandingReveal className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              How Vince works
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Structured enough to keep work clear, lightweight enough to use every day.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Vince keeps the product simple on purpose. Everything lives at the workspace,
              project, or task level so the team always knows where to look.
            </p>
          </LandingReveal>

          <LandingReveal className="mt-12 grid gap-5 lg:grid-cols-3" delay={0.08}>
            {workflowLayers.map((item) => (
              <LandingHover key={item.title} className="h-full">
                <div className="landing-panel flex h-full flex-col rounded-[1.8rem] border border-white/75 p-6 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.35)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                </div>
              </LandingHover>
            ))}
          </LandingReveal>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-24 grid items-center gap-16 md:grid-cols-2">
            <LandingReveal>
              <div>
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <KanbanSquare className="h-6 w-6" />
                </div>
                <h3 className="mb-3 text-2xl font-semibold text-slate-950 md:text-3xl">
                  Boards that feel clear the moment you open them
                </h3>
                <p className="mb-6 text-base leading-8 text-slate-600 md:text-lg">
                  Vince gives every project the same predictable workflow out of the box: Backlog,
                  Todo, In Progress, In Review, and Done. Task IDs stay readable, blockers stand
                  out immediately, and priorities are obvious at a glance.
                </p>
                <ul className="space-y-3">
                  {boardBenefits.map((point) => (
                    <li key={point} className="flex gap-3 text-sm font-medium text-slate-700">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-500" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </LandingReveal>

            <LandingReveal delay={0.08}>
              <LandingHover className="landing-panel rounded-[1.9rem] border border-white/75 p-6 shadow-[0_28px_70px_-44px_rgba(15,23,42,0.38)]">
                <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Sprint view
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">This week&apos;s work</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                      6 active
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/90">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Backlog</p>
                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-medium text-slate-700">
                        CWR-08 Capture homepage screenshots
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/90">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">In Progress</p>
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm font-medium text-slate-700">
                        CWR-05 Mobile nav polish
                        <p className="mt-2 text-xs text-red-700">Blocked by updated logo export</p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/90 sm:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Done</p>
                      <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                        CWR-01 Set workspace structure
                      </div>
                    </div>
                  </div>
                </div>
              </LandingHover>
            </LandingReveal>
          </div>

          <div className="grid items-center gap-16 md:grid-cols-2">
            <LandingReveal delay={0.04}>
              <LandingHover className="landing-panel rounded-[1.9rem] border border-white/75 p-6 shadow-[0_28px_70px_-44px_rgba(15,23,42,0.38)]">
                <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Notes
                      </p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                        Shared live
                      </span>
                    </div>
                    <div className="mt-4 space-y-3 rounded-[1.2rem] bg-white p-4 shadow-sm ring-1 ring-slate-200/90">
                      <p className="text-sm font-semibold text-slate-900">Project brief</p>
                      <p className="text-sm leading-7 text-slate-600">
                        Primary goal: ship a lean client-facing homepage with clear CTA and fast
                        mobile loading.
                      </p>
                      <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                        Notes hold the durable context the team should not have to rediscover.
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Project chat
                      </p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                        Realtime
                      </span>
                    </div>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/90">
                        <p className="font-medium text-slate-900">Nina</p>
                        <p className="mt-1 text-slate-600">Board copy is ready. Can you QA the notes layout?</p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-900 shadow-sm ring-1 ring-blue-100">
                        <p className="font-medium">Jules</p>
                        <p className="mt-1">On it. I&apos;ll update the brief once it&apos;s checked.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </LandingHover>
            </LandingReveal>

            <LandingReveal>
              <div>
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <NotebookPen className="h-6 w-6" />
                </div>
                <h3 className="mb-3 text-2xl font-semibold text-slate-950 md:text-3xl">
                  Shared context stays where the work is happening
                </h3>
                <p className="mb-6 text-base leading-8 text-slate-600 md:text-lg">
                  Use project notes for the information the team needs to revisit later, and keep
                  project chat for the fast coordination that moves work forward right now. Activity
                  stays visible so updates do not disappear into a scrollback hole.
                </p>
                <ul className="space-y-3">
                  {contextBenefits.map((point) => (
                    <li key={point} className="flex gap-3 text-sm font-medium text-slate-700">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-500" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </LandingReveal>
          </div>
        </section>

        <section className="border-y border-slate-200/80 bg-slate-50/90 py-24" id="why-vince">
          <LandingReveal className="mx-auto max-w-4xl px-6 text-center">
            <Users className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
              Vince is intentionally built for small teams.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Not for a 500-person org. Not for teams that need a full-time admin. Vince is for
              the scrappy agency, the small product squad, and the student team that just wants
              everyone aligned and moving.
            </p>
          </LandingReveal>

          <LandingReveal className="mx-auto mt-12 grid max-w-6xl gap-5 px-6 md:grid-cols-3" delay={0.08}>
            {smallTeamReasons.map((item) => (
              <LandingHover key={item.title} className="h-full">
                <div className="landing-panel h-full rounded-[1.7rem] border border-white/70 p-6 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.32)]">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <h3 className="mt-5 text-xl font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                </div>
              </LandingHover>
            ))}
          </LandingReveal>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-28 text-center">
          <LandingReveal>
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#0f172a,#111827)] px-6 py-14 text-white shadow-[0_36px_100px_-52px_rgba(15,23,42,0.95)] sm:px-10">
              <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
                Clear the clutter and give your team one place to work.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/68">
                Create a workspace in seconds, invite the team with one code, and keep boards,
                notes, chat, and activity connected from the start.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-lg font-medium text-slate-950 shadow-[0_18px_40px_-26px_rgba(255,255,255,0.55)] transition-[background-color,transform] duration-200 motion-safe:hover:-translate-y-px hover:bg-slate-100 sm:w-auto"
                  href="/signup"
                >
                  Start your workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/16 bg-white/6 px-8 py-4 text-lg font-medium text-white/88 transition-[background-color,transform] duration-200 motion-safe:hover:-translate-y-px hover:bg-white/10 sm:w-auto"
                  href="/login"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </LandingReveal>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 px-6 py-12 text-sm text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="text-center md:text-left">Boards, notes, chat, and activity in one place.</div>
          <div className="text-center md:text-right">
            {new Date().getFullYear()} Vince Workspace. Focused collaboration for small teams.
          </div>
        </div>
      </footer>
    </div>
  );
}
