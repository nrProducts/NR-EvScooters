# Split typecheck

> ## No longer necessary — 2026-08-20
>
> This directory was built for TypeScript 5, where the `Database` generic made
> a whole-project check exceed 3.4 GB. The project is on `typescript@^7` now
> (the native compiler), and `tsc -p tsconfig.json --noEmit` completes on this
> machine in well under a minute.
>
> The slices still work and still cost nothing to keep, but the two warnings
> below no longer apply: `maintenance`, `support` and `app.ci` ARE verified
> locally, because the whole program is. Prefer `pnpm --filter backend
> typecheck:whole`.
>
> ### And a warning the audit added
>
> A clean typecheck proves LESS than this file implies. `.select()` strings are
> only checked when supabase-js can parse them, and it gives up on interpolated
> constants (`` `${LIST_COLUMNS}, more` ``) and on deeply nested embeds with
> `alias:table!fk_name(...)` hints. Three modules shipped queries that
> PostgREST rejects with a 400 while `tsc` passed. Run `pnpm --filter backend
> verify:selects` — it asks the real database — and treat that as the actual
> guarantee for query shape.

## The original rationale

`tsc -p tsconfig.json` over the whole backend needs more than 3.4 GB of heap
and does not complete on a 6 GB machine. The line count is not the problem —
21k LOC is small. The problem is the `Database` generic on `supabaseAdmin`:
every `.from(x).select("a, b, embed(c)")` type-parses its select **string**
against a 62-table schema, and there are hundreds of those calls, some with
nested embeds.

Detaching the generic makes the whole project check in 2 GB, but it also stops
table and column names being checked at all — which is exactly the class of
error this migration produces. So the generic stays, and the *program* is split
instead.

Each file here is a normal tsconfig whose `include` names one slice of the
codebase plus the shared directories. `tsc` still pulls in whatever those files
import, so slices overlap and some files are checked more than once; that is
the trade. Peak memory is the largest single slice, not the sum, because
`pnpm typecheck` runs them one after another.

    pnpm --filter backend typecheck          # every slice, sequentially
    pnpm --filter backend typecheck:slice ops   # just one, while working on it

If a slice ever OOMs on its own, split it further rather than raising the heap.
Raising it does not work: `support` was tried at 3 GB and still died, because
what it needs is not a bigger ceiling but a smaller program.

## The .ci slices

`platform`, `maintenance` and `support` are named `*.ci.json` and skipped by
default. Each one transitively imports the entire module graph, so there is no
smaller program to split them into.

The cause is service-to-service imports, and it is worth being precise about
it, because the obvious reading is wrong. `reports` also depends on
`maintenance` and `vehicles` — and it checks in 23 seconds, because it imports
only their **types** files. `maintenance` imports vehicles.service, which
imports bookings.service and rentals.service, which reach payments, refunds,
deposits, returns and damages. Cost tracks service imports, not module count.

Two consequences:

  - Changes to maintenance.service.ts and support.service.ts are NOT verified
    locally. Run them in CI, or accept that the first check they get is the
    smoke test.

  - Closing the gap means breaking the vehicles -> bookings/rentals import
    cycle (it is a genuine runtime circular dependency, not only a build
    problem). That is a refactor, not a config change, and is deliberately
    not done here.

## `app.ci`

`src/routes/index.ts` and `src/app.ts` were in no slice at all, so a route
file importing a module that does not exist typechecked clean everywhere and
failed at boot. `app.ci` covers them.

It is a `.ci` slice because `routes/index.ts` imports every module, which
makes it the one slice that cannot be split — running it needs more heap than
the small dev box has. Run it explicitly with
`node tsconfig.parts/run.mjs app.ci` when routes change.
