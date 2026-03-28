# Vince

Vince is a lightweight real-time team workspace for small freelance and student teams. It combines task tracking, shared notes, workspace chat, project chat, activity feeds, and member management in one focused web app.

## Stack

- Next.js App Router with TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, Realtime, and Storage
- Zustand for client state
- dnd-kit for board interactions

## Current Product Direction

Vince is designed around small teams that need a clean shared workspace without heavy project-management overhead. The app structure in this repository includes:

- authentication flows
- workspace creation and invite-code onboarding
- workspace and project navigation
- task board foundations
- shared notes
- workspace and project chat
- activity feeds
- notifications and member views

## Local Development

1. Install dependencies.
2. Copy `.env.local.example` to `.env.local` and fill in your Supabase values.
3. Start the development server.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Environment Variables

The app expects these values in `.env.local`:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Use `.env.local.example` as the public template.

## Scripts

- `npm run dev` starts the Next.js dev server
- `npm run build` creates a production build
- `npm run start` runs the production server
- `npm run lint` runs ESLint
- `npm run verify:rls` verifies workspace onboarding and RLS expectations against Supabase

## Notes

- This repository targets Vercel deployment.
- Supabase Row Level Security is a core part of the data access model.
- Local environment files and build artifacts are intentionally excluded from git.
