# Ballotly Production-Readiness Scope

## Intended Operating Scope

Ballotly is being hardened for **private organizational elections**: associations, clubs, committees, unions, educational communities, and companies that need an accountable election workflow. Its operating model is multi-tenant: every organization owns its workspace, governance roles, elections, voter roster, audit records, and results.

| Area | Production-oriented commitment | Explicit boundary |
|---|---|---|
| Identity | Native email/password accounts, signed secure cookies, generic login failures, and future email-verification and recovery readiness. | No identity proofing, government ID validation, or legal voter-roll certification. |
| Organization governance | Owner/admin/member access, server-side tenant checks, audited role changes, and invitation states. | No cross-organization delegation or external SSO in this release. |
| Elections | Controlled lifecycle, locked privacy choice after setup, eligibility enforcement, one ballot per voter, and results controls. | Single-choice elections only; no ranked-choice or proportional representation tallying. |
| Ballot privacy | Anonymous mode separates eligibility from vote records; attributable mode clearly informs voters before submission. | This is not cryptographic end-to-end verifiability and does not claim governmental-election certification. |
| Operations | Audit events, exports, safety checks, production runbook, tests, and Vercel deployment validation. | A formal external penetration test and jurisdiction-specific legal review remain required before any regulated use. |

> Ballotly must not be represented as a certified system for public-government or legally regulated elections. Such deployments require independent security assessment, accessibility evaluation, applicable legal advice, and a purpose-built verifiable voting protocol.

## Trust Boundaries

Every protected server action must authenticate the account, resolve the organization relationship, validate that relationship against the requested election or record, and deny access if no explicit permission applies. This follows OWASP guidance to enforce authorization on every request and deny access by default. [1]

Ballotly uses HTTP-only session cookies with explicit expiration and a server-side database lookup for the account. Passwords are hashed rather than stored in reversible form. Account UX must avoid revealing whether an email address exists during sign-in or recovery attempts, and privileged election actions should be auditable. These practices align with OWASP authentication, session-management, and logging guidance. [2] [3] [4]

For anonymous elections, the system records voter eligibility separately from candidate selection. Administrative reporting is limited to turnout and aggregated candidate totals. Audit records must never contain a selected candidate, a session token, a password, or other secrets; logs should contain only the minimum data needed to investigate a policy-relevant event. [4]

## Release Priorities

The hardening release prioritizes account protections, organization governance, voter-invitation controls, immutable election review, lifecycle guardrails, audit export, error recovery, and responsive accessible UX. Any feature that weakens voter privacy, permits cross-tenant access, or changes ballot configuration after voting setup is rejected by default.

## References

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html "OWASP Authorization Cheat Sheet"
[2]: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html "OWASP Authentication Cheat Sheet"
[3]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html "OWASP Session Management Cheat Sheet"
[4]: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html "OWASP Logging Cheat Sheet"
