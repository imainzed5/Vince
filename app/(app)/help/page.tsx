import Link from "next/link";
import {
  BellRing,
  CheckSquare,
  FolderKanban,
  LifeBuoy,
  MessageSquareText,
  NotebookPen,
  Settings2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const quickStartItems = [
  {
    title: "Create or join a workspace",
    description: "Start from the workspace list, then create a new workspace or join one with an invite code.",
  },
  {
    title: "Open a project board",
    description: "Each project has a board, overview, notes, chat, and activity stream so work stays grouped together.",
  },
  {
    title: "Create and move tasks",
    description: "Use + Add task or press C on the board, then drag tasks across the workflow columns as work moves.",
  },
  {
    title: "Keep context on the project",
    description: "Use notes for durable documentation, chat for discussion, and activity for a quick change log.",
  },
] as const;

const keyAreas = [
  {
    title: "Workspace dashboard",
    description: "See overall attention items, project health, recent activity, and high-level progress across the workspace.",
    icon: FolderKanban,
  },
  {
    title: "My Tasks",
    description: "Filter your assigned tasks across projects, sort by urgency, and jump straight into task details.",
    icon: CheckSquare,
  },
  {
    title: "Project overview",
    description: "Set ownership, target date, goal, outcomes, milestones, status updates, and client share links.",
    icon: NotebookPen,
  },
  {
    title: "Project chat and notes",
    description: "Use chat for active coordination and notes for information the team should be able to revisit later.",
    icon: MessageSquareText,
  },
  {
    title: "Members and roles",
    description: "Owners manage the workspace, invite flow, task settings, and other team-wide controls.",
    icon: Users,
  },
  {
    title: "Notifications and account",
    description: "Use the inbox for mentions and reminders, and manage your profile, password, and appearance from Account settings.",
    icon: BellRing,
  },
] as const;

const workflowTips = [
  "Use the board when the team is actively moving work between stages.",
  "Use My Tasks when you want a personal queue across every project you are assigned to.",
  "Use Overview when a project needs clearer scope, status, milestones, or stakeholder visibility.",
  "Use Workspace settings for team-wide task statuses and custom task fields.",
  "Use Account settings for your own name, password, notification preferences, and theme.",
] as const;

const faqItems = [
  {
    question: "What is the difference between workspace settings and account settings?",
    answer:
      "Workspace settings affect the whole team in that workspace. Account settings only affect your own profile, password, notifications, and appearance.",
  },
  {
    question: "Where should I update project scope or delivery status?",
    answer:
      "Use the project Overview page. That is where the brief, milestones, status updates, templates, and share links live.",
  },
  {
    question: "How do I quickly create a task from the board?",
    answer:
      "Open a project board and press C, or use the + Add task button in the board toolbar or column footer.",
  },
  {
    question: "How do I know what needs my attention?",
    answer:
      "Use the workspace dashboard for team-wide pressure, My Tasks for your own queue, and the notification inbox for mentions and reminders.",
  },
] as const;

export default function HelpPage() {
  return (
    <main className="space-y-6 p-6">
      <section className="space-y-3">
        <Badge variant="outline" className="w-fit">
          Help
        </Badge>
        <div className="max-w-3xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">How to use Vince</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Vince keeps project boards, notes, chat, activity, and personal task tracking in one place for small teams.
            Use this page as the quick reference for where things live and what to do next.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Go to workspace list
          </Link>
          <Link href="/create-workspace" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Create or join workspace
          </Link>
          <Link href="/my-tasks" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open My Tasks
          </Link>
          <Link href="/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open Account settings
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LifeBuoy className="size-4" />
              Quick start
            </CardTitle>
            <CardDescription>Use this sequence when you are setting up work for the first time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickStartItems.map((item, index) => (
              <div key={item.title} className="surface-subpanel rounded-xl border p-4">
                <p className="text-sm font-semibold text-foreground">{index + 1}. {item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4" />
              Key rules
            </CardTitle>
            <CardDescription>These distinctions keep the app easier to navigate day to day.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <div className="surface-subpanel rounded-xl border p-4">
              <p className="font-medium text-foreground">Workspace vs project</p>
              <p className="mt-1">Workspace pages give you team-wide visibility. Project pages are where delivery work happens.</p>
            </div>
            <div className="surface-subpanel rounded-xl border p-4">
              <p className="font-medium text-foreground">Account vs workspace settings</p>
              <p className="mt-1">Account settings are personal. Workspace settings change rules and fields for everyone in that workspace.</p>
            </div>
            <div className="surface-subpanel rounded-xl border p-4">
              <p className="font-medium text-foreground">Chat vs notes</p>
              <p className="mt-1">Use chat for active conversation and notes for information the team should be able to find later.</p>
            </div>
            <div className="surface-subpanel rounded-xl border p-4">
              <p className="font-medium text-foreground">Board vs My Tasks</p>
              <p className="mt-1">Use boards to manage one project and My Tasks to manage your own workload across projects.</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-4 max-w-2xl">
          <h2 className="text-xl font-semibold text-foreground">What each area is for</h2>
          <p className="mt-1 text-sm text-muted-foreground">Start here if you are unsure which page should handle a specific kind of work.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {keyAreas.map((item) => {
            const Icon = item.icon;

            return (
              <Card key={item.title} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Icon className="size-4" />
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recommended workflow</CardTitle>
            <CardDescription>Use these patterns to keep the app organized instead of scattering information across pages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {workflowTips.map((tip) => (
              <div key={tip} className="surface-subpanel rounded-xl border px-4 py-3 text-sm leading-6 text-muted-foreground">
                {tip}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>FAQ</CardTitle>
            <CardDescription>Short answers to the questions that usually come up first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {faqItems.map((item) => (
              <div key={item.question} className="surface-subpanel rounded-xl border p-4">
                <p className="text-sm font-semibold text-foreground">{item.question}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="surface-panel rounded-xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Need the next step?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Go back to the workspace list, open your task queue, or update your own account.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Workspaces
            </Link>
            <Link href="/my-tasks" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              My Tasks
            </Link>
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Account settings
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}