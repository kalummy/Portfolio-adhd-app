# Native QA source reconciliation

Base: `origin/main` at `c7f88b7`. The validated code was recovered from the
`medication-closed-qa` worktree (`a1d3099` plus uncommitted QA changes). The
0.3.4, 0.3.5, 0.3.6, 0.3.7, and 0.3.8 artifact reports in `artifacts/` record
the successive Dev builds. There is no single commit containing the 0.3.8
source. The 0.3.8 QA report explicitly limits M-03's new-medication case to
fixture and KST-boundary verification; it did not create a new Dev medication
today.

## Inventory against main

| Class | Features and disposition |
| --- | --- |
| A — already in main | Native OAuth callback (PR #93), Native/Web reminder cron selection and retry rules (PR #94), Web M-01 empty-state component, Web API and Web Push paths. |
| B — validated and missing | Native API repository/account/AI/MFDS adapter and Edge source; medication and visit CRUD screens; M-01 final query-state behavior; M-02 time validation and schedule edit; M-03 registration-date projection; 0.3.4 Toast/Splash/date context/Haptic; 0.3.5 resource and image caches; 0.3.6 mood navigation, fixed header and auth first frame; mood draft vault; analytics; legal/account and social identity routes; camera/OCR and update adapter; environment-gated Native Push Edge source. These are restored in this branch. |
| C — Dev/QA only | Live Dev integration accounts, one-shot/test permissions, QA-only routes, Dev database fixtures/migrations, emulator automation, APKs and local credential files. They are excluded. Deterministic regression fixtures remain as tests. |
| D — superseded/separate | Production release variant and build guards belong to PR #95. Its configuration must be merged after this branch. The newer PR #93/#94 callback and cron code is retained from main. |

## Boundaries

Native same-origin `/api/*` requests use the authenticated `native-api` adapter;
browser requests retain the existing Next.js API and cookie path. The Native
client selects its Supabase project from the build stage, verifies the session
owner around requests, and never retries mutations against another user. The
Edge functions authenticate the bearer and constrain repository methods and
target paths. Production/Dev selection remains guarded by PR #95's release
configuration, which is intentionally not merged into this branch.

No Production environment, database, scheduler, Push, OAuth, Play, or signing
state is changed by this reconciliation.
