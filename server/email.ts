import { AccountApi, Configuration, SendApi } from "hostinger-mail-api-sdk";

const HOSTINGER_MAIL_API = "https://api.mail.hostinger.com";
const DEFAULT_MAILBOX_RESOURCE_ID = "ACad23488cc893e90c508568b05252";

export type AccountEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function getMailConfiguration() {
  const apiKey = process.env.MAIL_API_KEY;
  return apiKey ? new Configuration({ accessToken: apiKey, basePath: HOSTINGER_MAIL_API }) : null;
}

function getMailboxResourceId() {
  return process.env.MAILBOX_RESOURCE_ID || DEFAULT_MAILBOX_RESOURCE_ID;
}

export function isAccountEmailConfigured() {
  return Boolean(getMailConfiguration());
}

export async function getAccountEmailHealth() {
  const configuration = getMailConfiguration();
  if (!configuration) return { ready: false, reason: "MAIL_API_KEY is not configured" as const };
  try {
    const account = await new AccountApi(configuration).getCurrentAccount();
    const mailboxes = (account as any)?.data?.mailboxes ?? (account as any)?.mailboxes ?? [];
    return { ready: true, mailboxFound: mailboxes.some((mailbox: any) => mailbox.resourceId === getMailboxResourceId()) };
  } catch {
    return { ready: false, reason: "Hostinger Mail API authentication failed" as const };
  }
}

export async function sendAccountEmail(message: AccountEmail) {
  const configuration = getMailConfiguration();
  if (!configuration) return { delivered: false, reason: "MAIL_API_KEY is not configured" as const };
  try {
    const payload = {
      to: [message.to], cc: [], bcc: [], displayName: "Ballotly", subject: message.subject, text: message.text, html: message.html, attachments: [],
      // Hostinger's standalone send endpoint accepts omitted reply/forward fields;
      // SDK 1.18 types them as required despite the API's established behavior.
      inReplyTo: undefined,
      forwardOf: undefined,
    } as any;
    await new SendApi(configuration).sendEmail(getMailboxResourceId(), payload, {});
    return { delivered: true as const };
  } catch (error) {
    console.error("[account-email] Hostinger API delivery failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return { delivered: false, reason: "Hostinger Mail API delivery failed" as const };
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);

function accountEmailHtml(input: { heading: string; body: string; actionLabel: string; actionUrl: string; expiry: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f6f0e5;color:#12383e;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;background:#fffaf0;border:1px solid #d8caaf;padding:36px"><p style="letter-spacing:2px;font-size:11px;font-weight:700;color:#a34d3d">BALLOTLY ACCOUNT SECURITY</p><h1 style="font-family:Georgia,serif;font-weight:400">${input.heading}</h1><p style="line-height:1.6">${input.body}</p><p><a href="${input.actionUrl}" style="display:inline-block;background:#114b54;color:#fff9ec;padding:14px 20px;text-decoration:none;font-weight:bold">${input.actionLabel}</a></p><p style="font-size:12px;line-height:1.5;color:#607277">This secure link expires in ${input.expiry} and can only be used once. If you did not request it, you can safely ignore this message.</p></main></body></html>`;
}

export async function sendVerificationEmail(input: { email: string; name: string | null; token: string }) {
  const baseUrl = process.env.APP_BASE_URL || "https://ballotly.alliancedev.online";
  const actionUrl = `${baseUrl}/account/verify?token=${encodeURIComponent(input.token)}`;
  return sendAccountEmail({ to: input.email, subject: "Verify your Ballotly email address", text: `Verify your Ballotly account: ${actionUrl}`, html: accountEmailHtml({ heading: "Verify your email", body: `Hi ${escapeHtml(input.name || "there")}, confirm your email address to activate your Ballotly account.`, actionLabel: "Verify email", actionUrl, expiry: "24 hours" }) });
}

export async function sendPasswordRecoveryEmail(input: { email: string; name: string | null; token: string }) {
  const baseUrl = process.env.APP_BASE_URL || "https://ballotly.alliancedev.online";
  const actionUrl = `${baseUrl}/account/reset-password?token=${encodeURIComponent(input.token)}`;
  return sendAccountEmail({ to: input.email, subject: "Reset your Ballotly password", text: `Reset your Ballotly password: ${actionUrl}`, html: accountEmailHtml({ heading: "Reset your password", body: `Hi ${escapeHtml(input.name || "there")}, use this one-time link to set a new Ballotly password.`, actionLabel: "Reset password", actionUrl, expiry: "30 minutes" }) });
}
