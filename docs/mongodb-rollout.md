# MongoDB Schema Rollout Strategy

Ballotly uses Mongoose models as the runtime schema contract. MongoDB does not use SQL migrations by default, so the deployment process treats schema evolution as an application rollout with explicit, backward-compatible changes.

| Change type | Rollout approach |
|---|---|
| Additive field or index | Add the field as optional or with a safe default, deploy the application, then backfill asynchronously if a historical value is needed. |
| New collection | Deploy the Mongoose model and indexes before any feature writes to the collection. |
| Data transform | Deploy code that reads both old and new representations, run a one-time authenticated migration script, verify counts, then remove old-field support in a later release. |
| Destructive change | Export a database backup first, deploy compatibility code, verify production behavior, and only then remove unused data in a separate approved operation. |

The current Ballotly models create indexes for organization slugs, organization membership uniqueness, election/voter eligibility, and attributable-vote uniqueness. The application requires a MongoDB replica set because ballot submission uses a transaction to atomically mark eligibility and persist the vote.

Before a production schema change, run `pnpm test`, `pnpm check`, and `pnpm build`; review the affected Mongoose model; verify the MongoDB Atlas backup; and test the migration in a non-production Atlas database. Do not run ad-hoc destructive updates against production ballot data.
