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
