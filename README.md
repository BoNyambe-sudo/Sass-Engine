# SaaS Growth Engine

A production-oriented SaaS growth and subscription operations monorepo built with NestJS, Angular, Prisma, and Stripe.

## Monorepo structure

- `backend/` — NestJS API with auth, orgs, users, billing, analytics, and audit modules
- `frontend/` — Angular standalone admin UI with Tailwind + Angular Material

## Prerequisites

- Node.js 22.18+
- pnpm 12+
- Neon Postgres database
- Stripe account with test keys

## Local setup

1. Copy `.env.example` to `.env` and fill in the real secrets.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Generate Prisma client and run migrations:
   ```bash
   cd backend
   pnpm prisma generate
   pnpm prisma db push
   ```
4. Start the backend:
   ```bash
   pnpm dev:backend
   ```
5. Start the frontend:
   ```bash
   pnpm dev:frontend
   ```

## Stripe CLI webhook test

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

## Deployment notes

- Frontend: Vercel
- Backend: Render
- Database: Neon Postgres
- No Docker is used in this project.

## Production checklist

- Global validation and Swagger docs enabled
- JWT auth with refresh tokens and role-based access
- rate limiting on API endpoints
- Stripe webhook signature verification enabled
- audit logging for platform actions
- lazy-loaded Angular routes and bundle budgets in `frontend/angular.json`

## Scripts

```bash
pnpm build
pnpm lint
pnpm test
```
