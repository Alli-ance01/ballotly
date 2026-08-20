# VoteBoard MVP Product Scope

## Product Positioning

VoteBoard is a multi-tenant SaaS platform for **private organizational elections**. An organization creates a workspace, appoints its election administrators, builds one or more election boards, enrolls voters, and publishes results according to its chosen schedule. Each organization operates in a logically isolated workspace and must never be able to view another organization's elections, voter roster, ballots, or results.

The initial release is intended for associations, clubs, schools, committees, unions, and companies conducting non-statutory internal elections. It is **not** presented as a certified system for public-government elections or other regulated elections without a separate security, accessibility, legal, and independent-audit program.

## MVP Roles

| Role | Scope | Primary capabilities |
|---|---|---|
| Platform owner | Entire platform | Review organizations and resolve operational issues without exposing ballot selections. |
| Organization owner | One organization | Configure organization settings, designate administrators, and manage billing readiness. |
| Election administrator | Assigned organization | Create elections, define ballot options, enroll voters, open and close elections, and view eligible results. |
| Voter | Assigned election | View election information and submit one ballot while the election is open. |

## Election Lifecycle

| Status | Meaning | Permitted administrative action |
|---|---|---|
| Draft | Election is being configured. | Edit election details, voter eligibility, candidates, and ballot questions. |
| Scheduled | Election has a fixed future opening time. | Review configuration and, if necessary, return to Draft. |
| Open | Eligible voters may vote. | Monitor turnout; ballot configuration is locked. |
| Closed | Voting has ended. | View and publish results according to the result-visibility setting. |
| Archived | Election is retained as a record. | Read-only access for authorized administrators. |

## Integrity and Privacy Requirements

The MVP uses an eligibility record to determine whether a voter may cast a ballot and a separate vote record to persist the selected option. A unique eligibility-to-vote relationship prevents duplicate votes. Administrative reporting uses turnout totals and aggregated candidate counts; it does not expose an individual voter's selection.

Every server-side operation must require an authenticated user, enforce organization membership, confirm the correct organization and election scope, and record sensitive administrative actions in an audit event. All stored timestamps use UTC, and result visibility is enforced server-side rather than solely through the interface.

## First Release Boundaries

The first production increment includes one single-choice ballot question per election, manual voter enrollment, organization-level branding fields, dashboard reporting, and in-app voter access. It deliberately excludes governmental-election certification, ranked-choice tallying, public voter registration, identity verification providers, payments, and custom domains. Those areas can be added after the tenant model and voting safeguards are proven through testing.
