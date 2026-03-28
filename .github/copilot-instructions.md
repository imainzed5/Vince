# Vince — Copilot Instructions

You are helping me build **Vince**, a lightweight real-time team workspace web app for small freelance and student teams (2–6 people). Think Linear meets Basecamp but simpler. Read this file fully before doing anything. Treat it as the source of truth for this project alongside the project overview document (`workspace_overview_v2.docx`) attached in this workspace.

---

## Project Summary

Vince is a focused collaboration tool that combines a task board, shared notes, group chat, and activity feed into one clean interface. No bloat, no unnecessary complexity. Built for small teams who just want to get things done.

**Developer:** Solo (me)
**Platform:** Web app first, PWA in Phase 3
**Deployment:** Vercel
**Database:** Supabase (free tier — keep the data model lean)

---

## Clarifications (supersede anything in the docx)

- The project is named **Vince** (the docx may still say "Team Workspace App" in places)
- I am the **solo developer** on this
- The Claude API / AI features are **fully deferred** — do not scaffold, reference, or plan anything AI-related
- Task identifiers use **project-specific prefixes** (for example `CWR-01`, `DGP-04`) rather than one global prefix
- We are targeting **Supabase free tier** — 500MB DB, 1GB storage, 50MB file uploads
- Platform is **web app**, evolving to **PWA in Phase 3** — no Electron, no native

---

## Tech Stack

### Frontend
- **Next.js 14** — App Router, TypeScript, no Pages Router
- **Tailwind CSS** — utility-first styling, no CSS modules, no styled-components
- **shadcn/ui** — base component library (built on Radix UI)
- **Zustand** — lightweight client-side state management
- **@dnd-kit** — drag and drop for the kanban board (`@dnd-kit/core`, `@dnd-kit/sortable`)
- **Framer Motion** — animations and micro-interactions
- **Lucide React** — icons

### Backend & Database
- **Supabase** — PostgreSQL, Auth, Realtime, Storage
- **@supabase/supabase-js** — Supabase JS client
- **@supabase/ssr** — server-side Supabase helpers for Next.js

### Dev & Deployment
- **Vercel** — hosting and preview deployments
- **TypeScript** — strict mode, fully typed throughout
- **ESLint + Prettier** — code quality and formatting

---

## Folder Structure

```
vince/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── signup/
│   │       └── page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              # Protected layout with sidebar
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── create-workspace/
│   │   │   └── page.tsx
│   │   └── workspace/
│   │       └── [workspaceId]/
│   │           ├── layout.tsx
│   │           ├── page.tsx        # Workspace dashboard
│   │           └── project/
│   │               └── [projectId]/
│   │                   ├── board/
│   │                   ├── overview/
│   │                   ├── notes/
│   │                   ├── chat/
│   │                   └── activity/
├── components/
│   ├── ui/                         # shadcn/ui components (auto-generated)
│   ├── layout/                     # Sidebar, topbar, nav
│   ├── board/                      # Kanban board, columns, task cards
│   ├── tasks/                      # Task detail panel, task form
│   ├── chat/                       # Chat UI components
│   ├── notes/                      # Notes editor and list
│   └── shared/                     # Avatars, badges, modals, etc.
├── hooks/
│   ├── useWorkspace.ts
│   ├── useTasks.ts
│   ├── useChat.ts
│   └── useRealtime.ts
├── lib/
│   └── supabase/
│       ├── client.ts               # Browser Supabase client
│       ├── server.ts               # Server Supabase client
│       └── middleware.ts           # Auth middleware helper
├── stores/
│   ├── workspaceStore.ts
│   ├── taskStore.ts
│   └── uiStore.ts
├── types/
│   ├── database.types.ts           # Auto-generated Supabase types
│   └── index.ts                    # App-level types
├── middleware.ts                   # Next.js middleware for auth protection
├── .env.local.example
└── .env.local                      # Never commit this
```

---

## Code Conventions

### General
- **TypeScript strict mode** — no `any`, no implicit types, everything typed
- **Server components by default** — only add `"use client"` when strictly necessary (interactivity, realtime subscriptions, Zustand access, browser APIs)
- **Small, single-responsibility components** — if a component is doing too much, split it
- **Ask before major architecture decisions** — don't make big structural choices without confirming with me first

### Next.js
- App Router only — no Pages Router patterns
- Use `(app)` route group for all authenticated pages
- Use `(auth)` route group for login and signup
- Co-locate page-specific components with their route when they won't be reused
- Use `loading.tsx` and `error.tsx` where appropriate

### Supabase
- Browser client (`lib/supabase/client.ts`) — for client components and hooks
- Server client (`lib/supabase/server.ts`) — for server components, server actions, and API routes
- **Never write raw SQL on the frontend** — use the Supabase query builder
- **All queries must be fully typed** using generated database types from `types/database.types.ts`
- RLS (Row Level Security) must be enabled on every table — never skip this

### Styling
- Tailwind CSS only — no inline styles unless absolutely unavoidable
- Use shadcn/ui components for all base UI — buttons, inputs, dropdowns, modals, tooltips
- Follow the design direction described below — do not introduce random styling choices

### State Management
- Zustand for global client state (workspace data, UI state, task cache)
- Keep Zustand stores in `stores/`
- Server state (database data) lives in Supabase — don't duplicate it in Zustand unnecessarily
- Use custom hooks in `hooks/` to abstract Supabase queries and realtime subscriptions

### Environment Variables
- All Supabase keys go in `.env.local`
- Always maintain `.env.local.example` with placeholder values
- Never hardcode secrets or API keys anywhere in the codebase

---

## Database Schema (High Level)

```sql
workspaces        — id, name, invite_code, created_by, created_at
workspace_members — workspace_id, user_id, role, joined_at
projects          — id, workspace_id, name, status, phase, progress_pct, created_by, created_at
tasks             — id, project_id, identifier, title, description, status, priority,
                    assignee_id, due_date, is_blocked, blocked_reason, milestone_id, created_by, created_at
milestones        — id, project_id, name, due_date, created_at
notes             — id, project_id, title, content, updated_by, is_pinned, created_at, updated_at
messages          — id, workspace_id, project_id (nullable), user_id, content, created_at
standups          — id, project_id, user_id, done, next, blockers, created_at
activity_log      — id, workspace_id, project_id, actor_id, action, metadata, created_at
attachments       — id, task_id, user_id, file_url, file_name, created_at
```

**RLS rules (enforce these on every table):**
- Users can only read/write data that belongs to workspaces they are members of
- `workspace_members` is the source of truth for access — always join through it

---

## Realtime Channels

```
workspace:{id}        — workspace-wide chat, member join events
project:{id}          — task changes, project-level chat, standup posts
activity:{workspaceId} — activity feed updates
```

---

## Design Direction

- **Aesthetic:** Clean, minimal, professional — inspired by Linear
- **Layout:** Sidebar on the left with two levels of navigation — workspace-level on top, project-level below when inside a project
- **Colors:** Neutral base, blue accents, red for blocked/overdue, green for done
- **Typography:** Clean sans-serif, clear hierarchy, no decorative fonts

### Kanban Board
- 5 columns: **Backlog → Todo → In Progress → In Review → Done**
- Each column has a colored dot indicator and task count badge
- Done tasks are faded (reduced opacity) with strikethrough title

### Task Cards
- Show: identifier (for example `CWR-01`), title, priority dot, assignee avatar, due date
- Blocked tasks have a red left border and inline blocker reason
- Overdue due dates render in red
- Press **`C`** anywhere to open the quick task creation modal

### Priority Levels
- Urgent — red dot
- High — amber dot
- Medium — blue dot
- No priority — gray dot

### Navigation
- Workspace level: Dashboard, Activity Feed, Chat, Members, Settings
- Project level (tabs): Board (default), Overview, Notes, Chat, Activity
- "My tasks" view accessible from workspace sidebar — shows all tasks assigned to the current user across all projects

---

## Feature Phases

### Phase 1 — Core (build this first)
Auth, workspace creation, task board, project-specific task identifiers, priority flags, blocker flags, project phase indicator, shared notes, real-time group chat (workspace + project level), activity feed, keyboard shortcut (C to create task)

### Phase 2 — Depth
Task detail panel, due dates + overdue flagging, milestones, standup thread, who's working on what, My tasks view, list view, @mentions, notifications, file attachments, global search, emoji reactions

### Phase 3 — Growth + PWA
Client guest access (read-only link), progress snapshot (manual template), weekly digest email (template-based), PWA support (manifest + service worker), mobile responsive layout, task completion animation

### Future (deferred — no budget yet)
AI features via Claude API — task suggester, AI progress snapshot, AI weekly digest

---

## Current Build Order

We are starting from zero. Work through these steps in order and do not skip ahead:

1. Scaffold Next.js 14 with TypeScript and Tailwind CSS
2. Install and configure shadcn/ui
3. Set up the full folder structure as defined above
4. Install all dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `zustand`, `@dnd-kit/core`, `@dnd-kit/sortable`, `framer-motion`, `lucide-react`
5. Set up Supabase browser and server clients in `lib/supabase/`
6. Set up `.env.local.example` with all required variables
7. Set up Next.js middleware for auth route protection
8. Build auth — sign up page, sign in page, protected routes
9. Build workspace creation — after signup, redirect users with no workspace to `/create-workspace` where they name their workspace and get an invite code
10. Deploy to Vercel — get a live URL before moving to the task board

**Do not start the task board or database schema until auth and workspace creation are working and deployed.**

---

## Rules for You (Copilot)

- Read the full docx and this file before writing any code
- Follow the folder structure exactly — do not invent new directories without asking
- Always generate TypeScript, never plain JavaScript
- Always use the Supabase query builder — never raw SQL on the frontend
- Always enable and respect RLS — never bypass it
- Use shadcn/ui components — do not reinvent base UI from scratch
- Keep components small and focused
- Ask me before making major architecture or design decisions
- Do not scaffold AI features — they are fully deferred
- Production-ready code from day one — no TODOs left in committed code