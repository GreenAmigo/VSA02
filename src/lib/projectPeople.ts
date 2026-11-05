export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function getPersonInviteDraftError(displayName: string, email: string): string | null {
  const name = normalizePersonName(displayName);
  if (!name) {
    return "Full name is required.";
  }

  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    return "Email is required.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return "Enter a valid email address.";
  }

  return null;
}
