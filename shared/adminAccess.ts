export function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

export function getAdminEmailAllowlist(configuredEmails = "") {
  return Array.from(new Set(configuredEmails
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean)));
}

export function isAdminEmail(email: string | null | undefined, configuredEmails = "") {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  return getAdminEmailAllowlist(configuredEmails).includes(normalizedEmail);
}
