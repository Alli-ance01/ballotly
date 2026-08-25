# Ballotly Operations Runbook

## Required Production Configuration

| Setting | Requirement |
|---|---|
| `MONGODB_URI` | A dedicated MongoDB Atlas database user limited to the `ballotly` database. Use a replica-set cluster because ballot submission uses a transaction. |
| `JWT_SECRET` | A randomly generated secret of at least 32 characters, configured in both Vercel Production and Preview environments. Rotate it after a suspected compromise. |
| Domain | `ballotly.alliancedev.online` verified in Vercel with HTTPS enabled. |
| Vercel | Production branch protected; Preview deployments used for every proposed release. |

## Election Release Checklist

Before opening an election, an administrator should confirm the organization, candidate roster, eligible-voter roster, ballot privacy mode, election schedule, and administrator results setting. Ballotly blocks opening until at least two candidates and one eligible voter exist, and it locks roster/configuration changes after opening.

After closing, export the election record from the election desk and retain it according to the organization’s policy. The export contains configuration, results, and administrative audit events. It deliberately does not include a voter-to-selection link for anonymous ballots.

## Monitoring and Incident Response

Review Vercel Runtime Errors and MongoDB Atlas alerts after every production release and before opening a high-participation election. Treat unexpected permission errors, repeated failed sign-ins, vote-cast errors, unexpected election status changes, and results inconsistencies as incidents.

If an incident occurs during an open election, do not alter ballot configuration or delete audit records. Capture the error time, election ID, affected account, and relevant audit events; restrict administrator access if credentials may be compromised; preserve the election record; and seek independent security review before deciding whether to close, archive, or rerun the election.

## Backup and Retention

Enable MongoDB Atlas continuous cloud backups or scheduled snapshots before using the system for real elections. Test a restoration into a non-production database. Retain exports and audit records only for the period required by the organization’s policy and applicable privacy obligations; remove temporary test organizations and stale voter data promptly.

## Email-Dependent Controls

Ballotly currently supports pending organization invitations that activate when the invited email address signs in or creates an account. Account-email delivery uses the **Hostinger Mail API**, rather than mailbox SMTP. In Vercel, add `MAIL_API_KEY` in both Production and Preview environments and add `MAILBOX_RESOURCE_ID` for the Hostinger mailbox resource that owns the `ballotly@alliancedev.online` alias. Retain `APP_BASE_URL=https://ballotly.alliancedev.online` for future account-action links. Never commit a Mail API key or expose it with a `VITE_` prefix.

The sender should display as `Ballotly <ballotly@alliancedev.online>` and replies should be handled at `hello@alliancedev.online`. Delivery remains disabled until `MAIL_API_KEY` exists. After adding it, redeploy `main` and validate the account-email health check before representing automated verification or recovery email as available.
