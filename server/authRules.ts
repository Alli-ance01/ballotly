export function assertPasswordPolicy(password: string) {
  if (password.length < 12) throw new Error("Use at least 12 characters for your password.");
  if (password.length > 72) throw new Error("Use no more than 72 characters for your password.");
}

export function normalizeAccountEmail(email: string) {
  return email.trim().toLowerCase();
}
