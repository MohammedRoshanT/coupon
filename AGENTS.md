<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Guidelines

## Code Style
- Use TypeScript with strict mode enabled
- Follow ESLint configuration for linting
- Use Tailwind CSS for styling with dark mode support via `dark:` prefix
- Prefer Server Components by default; use `'use client'` only when interactivity is needed

## Architecture
- Next.js 16.2.4 with App Router
- React 19.2.4 with TypeScript 5.x
- Supabase for authentication and database
- Integrations: QR codes, Razorpay payments, Recharts for visualization
- Path aliases: `@/*` maps to `src/*`

## Build and Test
- `npm run dev` — Start development server
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — Run ESLint
- No test framework configured yet — consider adding Jest or Vitest for testing

## Conventions
- Component structure: Server Components by default
- Fonts: Use Next.js Font Optimization (Geist family)
- Images: Use Next.js Image component with static imports
- Metadata: Define using server-side `Metadata` type in layout
- Supabase: Use SSR auth flow with `@supabase/ssr` middleware pattern

See [README.md](README.md) for project overview.
