# VoteBoard MVP Architecture

VoteBoard is structured as a tenant-aware application. Every organization-owned record is linked to an `organizationId`, and every protected operation begins by resolving the signed-in user's membership for that organization. An election belongs to one organization; candidates, voter-eligibility records, votes, and audit events in turn belong to that election or organization.

The platform uses a relational database rather than MongoDB because the core security property is reliable tenant isolation across highly related records. Unique database constraints reinforce the application rules: a user may join an organization once, an email may be enrolled in an election once, and one eligibility record may be used to create at most one vote.

| Layer | Responsibility |
|---|---|
| React client | Public product pages, authenticated workspace flows, and accessible ballot presentation. |
| Express and tRPC server | Authentication boundary, input validation, role checks, tenant scoping, and server-enforced election rules. |
| Relational database | Organization data, memberships, election configuration, voter eligibility, ballots, and audit records. |
| Audit stream | Records sensitive administrative actions and ballot-cast events without including the selected candidate in audit metadata. |

The MVP prevents duplicate ballots and hides selections from administrative reporting. It does not claim cryptographic end-to-end verifiability or legal certification; these require a separately designed, independently audited voting protocol.
