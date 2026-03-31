import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function PageBlock({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("surface-panel rounded-2xl border p-6 shadow-sm", className)}>{children}</div>;
}

function HeadingSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-24 rounded-full" />
      <Skeleton className={cn("h-9 rounded-xl", compact ? "w-56" : "w-72")} />
      <Skeleton className={cn("h-4 rounded-full", compact ? "w-64" : "w-80")} />
    </div>
  );
}

function StatGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <PageBlock key={index} className="space-y-4">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-xl" />
          <Skeleton className="h-4 w-28 rounded-full" />
        </PageBlock>
      ))}
    </div>
  );
}

export function RootLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="surface-panel w-full max-w-md rounded-3xl border p-8 shadow-sm">
        <div className="space-y-4">
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-10 w-44 rounded-2xl" />
          <Skeleton className="h-4 w-64 rounded-full" />
          <div className="space-y-3 pt-4">
            <Skeleton className="h-12 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </main>
  );
}

export function AuthPageLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="surface-panel w-full max-w-md rounded-3xl border p-6 shadow-sm">
        <div className="space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-8 w-52 rounded-xl" />
            <Skeleton className="h-4 w-72 rounded-full" />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <Skeleton className="mx-auto h-4 w-36 rounded-full" />
        </div>
      </div>
    </main>
  );
}

export function AppPageLoading() {
  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HeadingSkeleton />
        <Skeleton className="h-10 w-44 rounded-xl" />
      </div>
      <StatGridSkeleton />
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <PageBlock className="space-y-4">
          <Skeleton className="h-5 w-40 rounded-full" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-xl border p-4">
              <Skeleton className="h-5 w-48 rounded-full" />
              <Skeleton className="h-4 w-full rounded-full" />
              <Skeleton className="h-4 w-4/5 rounded-full" />
            </div>
          ))}
        </PageBlock>
        <PageBlock className="space-y-4">
          <Skeleton className="h-5 w-36 rounded-full" />
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-xl border p-4">
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-4 w-full rounded-full" />
            </div>
          ))}
        </PageBlock>
      </div>
    </main>
  );
}

export function DashboardPageLoading() {
  return (
    <main className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HeadingSkeleton compact />
        <Skeleton className="h-10 w-44 rounded-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <PageBlock key={index} className="space-y-4">
            <Skeleton className="h-6 w-2/3 rounded-xl" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </PageBlock>
        ))}
      </div>
    </main>
  );
}

export function CreateWorkspacePageLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="surface-panel w-full max-w-lg rounded-3xl border p-6 shadow-sm">
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <Skeleton className="h-8 w-64 rounded-xl" />
              <Skeleton className="h-4 w-72 rounded-full" />
            </div>
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28 rounded-full" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <Skeleton className="h-px w-full rounded-full" />
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40 rounded-full" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </main>
  );
}

export function MyTasksPageLoading() {
  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HeadingSkeleton compact />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </div>
      <PageBlock className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </PageBlock>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <PageBlock className="space-y-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-5 w-36 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full rounded-full" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </PageBlock>
        <PageBlock className="space-y-4">
          <Skeleton className="h-6 w-40 rounded-xl" />
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-xl" />
          ))}
        </PageBlock>
      </div>
    </main>
  );
}

export function WorkspaceOverviewLoading() {
  return (
    <main className="space-y-6 p-6">
      <PageBlock className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-10 w-72 rounded-2xl" />
          <Skeleton className="h-4 w-80 rounded-full" />
          <div className="flex flex-wrap gap-2 pt-1">
            <Skeleton className="h-7 w-28 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
      </PageBlock>
      <StatGridSkeleton />
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        <PageBlock className="space-y-4">
          <Skeleton className="h-5 w-44 rounded-full" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-5 w-44 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full rounded-full" />
              <Skeleton className="h-4 w-3/4 rounded-full" />
            </div>
          ))}
        </PageBlock>
        <div className="space-y-4">
          <PageBlock className="space-y-4">
            <Skeleton className="h-5 w-40 rounded-full" />
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2 rounded-xl border p-4">
                <Skeleton className="h-4 w-32 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" />
              </div>
            ))}
          </PageBlock>
          <PageBlock className="space-y-4">
            <Skeleton className="h-5 w-32 rounded-full" />
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2 rounded-xl border p-4">
                <Skeleton className="h-4 w-28 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" />
              </div>
            ))}
          </PageBlock>
        </div>
      </div>
    </main>
  );
}

export function ActivityPageLoading() {
  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HeadingSkeleton compact />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <PageBlock className="space-y-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-4 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-5/6 rounded-full" />
          </div>
        ))}
      </PageBlock>
    </main>
  );
}

export function ChatPageLoading() {
  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HeadingSkeleton compact />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <PageBlock className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className={cn("flex gap-3", index % 2 === 1 && "justify-end")}>
            {index % 2 === 0 ? <Skeleton className="mt-1 size-9 rounded-full" /> : null}
            <div className={cn("max-w-[75%] space-y-2", index % 2 === 1 && "items-end")}>
              <Skeleton className={cn("h-4 rounded-full", index % 2 === 0 ? "w-24" : "ml-auto w-20")} />
              <Skeleton className={cn("h-12 rounded-2xl", index % 2 === 0 ? "w-72" : "ml-auto w-64")} />
            </div>
          </div>
        ))}
        <div className="flex gap-3 pt-4">
          <Skeleton className="h-11 flex-1 rounded-xl" />
          <Skeleton className="h-11 w-24 rounded-xl" />
        </div>
      </PageBlock>
    </main>
  );
}

export function MembersPageLoading() {
  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HeadingSkeleton compact />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
      <PageBlock className="space-y-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-36 rounded-full" />
                <Skeleton className="h-4 w-24 rounded-full" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </PageBlock>
    </main>
  );
}

export function SettingsPageLoading() {
  return (
    <main className="space-y-6 p-6">
      <HeadingSkeleton compact />
      <PageBlock className="space-y-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-3">
            <Skeleton className="h-5 w-40 rounded-full" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-4 w-72 rounded-full" />
          </div>
        ))}
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </PageBlock>
    </main>
  );
}

export function BoardPageLoading() {
  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HeadingSkeleton compact />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, columnIndex) => (
          <PageBlock key={columnIndex} className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-6 w-8 rounded-full" />
            </div>
            {Array.from({ length: 3 }).map((_, cardIndex) => (
              <div key={cardIndex} className="space-y-3 rounded-xl border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-16 rounded-full" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
                <Skeleton className="h-5 w-full rounded-full" />
                <Skeleton className="h-4 w-4/5 rounded-full" />
                <div className="flex items-center justify-between gap-3 pt-1">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="size-7 rounded-full" />
                </div>
              </div>
            ))}
          </PageBlock>
        ))}
      </div>
    </main>
  );
}

export function ProjectOverviewLoading() {
  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-10 w-72 rounded-2xl" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-96 max-w-full rounded-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </div>
      <StatGridSkeleton />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.95fr]">
        <PageBlock className="space-y-4">
          <Skeleton className="h-5 w-40 rounded-full" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-xl border p-4">
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-4 w-full rounded-full" />
              <Skeleton className="h-4 w-5/6 rounded-full" />
            </div>
          ))}
        </PageBlock>
        <div className="space-y-4">
          <PageBlock className="space-y-4">
            <Skeleton className="h-5 w-36 rounded-full" />
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full rounded-xl" />
            ))}
          </PageBlock>
          <PageBlock className="space-y-4">
            <Skeleton className="h-5 w-28 rounded-full" />
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2 rounded-xl border p-4">
                <Skeleton className="h-4 w-24 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" />
              </div>
            ))}
          </PageBlock>
        </div>
      </div>
    </main>
  );
}

export function NotesPageLoading() {
  return (
    <main className="grid min-h-[calc(100vh-10rem)] gap-4 p-6 lg:grid-cols-[320px_1fr]">
      <PageBlock className="space-y-4 p-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-xl border p-4">
            <Skeleton className="h-5 w-3/4 rounded-full" />
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-2/3 rounded-full" />
          </div>
        ))}
      </PageBlock>
      <PageBlock className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-4 w-48 rounded-full" />
          </div>
          <Skeleton className="h-10 w-24 rounded-xl" />
        </div>
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-[20rem] w-full rounded-2xl" />
      </PageBlock>
    </main>
  );
}