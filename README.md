# Ballotly

Ballotly is a multi-tenant voting platform for organizations. Each organization receives an isolated workspace where administrators can create election boards, enroll voters, configure a single-choice ballot, manage the election lifecycle, and view results. Users create a native Ballotly account with their name, email address, and password before accessing a workspace.

The application is built with **React**, **Node.js**, **Express**, **tRPC**, and **MongoDB via Mongoose**. React provides the product interface, the Express/tRPC server enforces authorization and election rules, and MongoDB holds account, tenant, voter eligibility, ballot, and audit data. Passwords are hashed with bcrypt; browser sessions are signed, HTTP-only cookies.

## Election Privacy Model

| Mode | Administrator visibility | Voter disclosure |
|---|---|---|
| Anonymous | Turnout and aggregate result totals; no persisted voter-to-selection link | The ballot states that identity is used only for eligibility and administrators cannot view individual selections. |
| Attributable | The recorded voter and selected candidate can be joined for authorized administrative reporting | The voter must explicitly acknowledge this before submitting the ballot. |

The ballot mode can only be changed while an election is in **Draft** and before the first voter is enrolled. Once that boundary is crossed, the platform requires a new election for a different privacy model.

> **Scope note:** Ballotly is designed for private organizational elections, such as associations, committees, clubs, schools, and companies. It is not presented as a certified system for public-government or legally regulated elections. Those uses need independent security review, legal review, accessibility assessment, and a purpose-built cryptographic election protocol.

## Local Setup

Install dependencies and provide a MongoDB Atlas connection string and a 32+ character session secret at runtime. The supplied MongoDB cluster must be a replica set; Atlas clusters meet this requirement, and it allows the application to make ballot submission atomic.

```bash
pnpm install
export MONGODB_URI='mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/ballotly?retryWrites=true&w=majority'
export JWT_SECRET='replace-this-with-a-long-random-value-of-at-least-32-characters'
pnpm dev
```

The interface is served at `http://localhost:3000`. Sign in through the configured authentication flow, create an organization, then create an election before enrolling voters.

## Quality Checks

```bash
pnpm test
pnpm check
pnpm build
```

The test suite covers election lifecycle validation, the immutable ballot-mode safeguard, eligibility, one-vote behavior rules, and email normalization.

## Deploying to `ballotly.alliancedev.online` with Vercel

The repository includes `vercel.json`, an API function at `api/index.ts`, and Vite static output configuration. Import the GitHub repository into Vercel, select **pnpm** as the package manager if Vercel does not detect it, and add both `MONGODB_URI` and a randomly generated `JWT_SECRET` of at least 32 characters in **Project Settings → Environment Variables** for Production and Preview. Do not prefix either variable with `VITE_`; both must remain server-only.

Then add `ballotly.alliancedev.online` under **Project Settings → Domains**. Vercel will display the exact DNS target to use. Create the requested CNAME record for `ballotly` in the `alliancedev.online` DNS zone, wait for verification, and test a Preview Deployment before promoting the production deployment. Vercel Functions scale to zero when idle, so the MongoDB connection helper keeps one reusable connection per warm function instance. [1] [2]

Use a production MongoDB Atlas project with a dedicated database user, a strong generated password, IP/network access configured for the hosting service, regular backups, and monitoring enabled. Do not commit credentials or put the MongoDB URI in client-side code.

## References

[1]: https://vercel.com/kb/guide/using-express-with-vercel "Using Express.js with Vercel"
[2]: https://vercel.com/docs/frameworks/frontend/vite "Vite on Vercel"
