# Prisma ORM 8 Setup

This project uses Prisma ORM 8 with PostgreSQL. Prisma ORM 8 is currently a release candidate and requires Node.js 22.18 or newer. Follow the [Prisma ORM 8 documentation](https://www.prisma.io/docs/orm/v8).

The CLI and database library are versioned independently. The published versions used here are `prisma@8.0.0-rc.19` and `@prisma/orm-postgres@8.0.0-rc.14`; they do not need matching RC numbers. Do not add `@prisma/client` or `@prisma/cli-engine` to this v8 setup.

Install from the workspace root with `pnpm install`. The exact versions are pinned in `backend/package.json` and `pnpm-lock.yaml`.

## Contract source

The contract source is [`backend/src/modules/prisma/contract.prisma`](backend/src/modules/prisma/contract.prisma). Every Prisma 8 PSL file must start with `// use prisma-8`.

```prisma
// use prisma-8

model User {
  id    Uuid   @id @default(uuid())
  email String @unique
}
```

Prisma 8 PSL is not identical to Prisma 6/7 schema syntax. For example, `@updatedAt` is replaced by `temporal.updatedAt()` and `@default(cuid())` by `@default(cuid(2))`. Use the [PSL syntax reference](https://www.prisma.io/docs/orm/contract-authoring/psl-syntax) when editing this file.

`prisma contract emit` writes two generated files next to the contract:

- `contract.json` — the runtime data contract.
- `contract.d.ts` — TypeScript contract declarations.

Commit both generated files. Never hand-write or edit them; rerun emit after changing the contract.

## Configuration

[`backend/prisma.config.ts`](backend/prisma.config.ts) points to the contract and reads the connection string from the workspace `.env`:

```typescript
import "dotenv/config";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./src/modules/prisma/contract.prisma",
    db: {
      connection: process.env["DATABASE_URL"]!,
    },
  }),
});
```

`DATABASE_URL` is defined in the workspace root [`.env`](./.env) file:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
```

## Commands

Run these from the workspace root:

```bash
pnpm --filter @saas-growth-engine/backend exec prisma contract emit
pnpm --filter @saas-growth-engine/backend exec prisma db init
pnpm --filter @saas-growth-engine/backend exec prisma migration plan --name initial
pnpm --filter @saas-growth-engine/backend exec prisma db migrate --db "$DATABASE_URL"
```

`contract emit` is offline. Database commands use the v8 CLI and the connection configured in `backend/prisma.config.ts`; review migration plans before applying them. See the [v8 CLI docs](https://www.prisma.io/docs/cli).

## Project files

| File                                                                                       | Purpose                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------- |
| [`backend/src/modules/prisma/contract.prisma`](backend/src/modules/prisma/contract.prisma) | Authoritative data contract           |
| [`backend/prisma.config.ts`](backend/prisma.config.ts)                                     | Prisma CLI and database configuration |
| [`backend/src/modules/prisma/db.ts`](backend/src/modules/prisma/db.ts)                     | PostgreSQL runtime client             |
| `backend/src/modules/prisma/contract.json`                                                 | Generated runtime contract            |
| `backend/src/modules/prisma/contract.d.ts`                                                 | Generated TypeScript contract         |

## Workflow

1. Edit the contract, preserving the `// use prisma-8` header.
2. Run `pnpm --filter @saas-growth-engine/backend exec prisma contract emit`.
3. Review and commit the generated contract files with the source change.
