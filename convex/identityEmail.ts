/**
 * The signed-in person's email, for matching them to member records - but ONLY when the
 * login says the email is verified. An unverified email must never grant access, otherwise
 * someone could sign up with another person's address and be treated as them.
 * People are normally matched by their WorkOS user ID; this is a fallback.
 */
export function verifiedIdentityEmail(
  identity: { email?: string | null; emailVerified?: boolean | null } | null | undefined,
): string | undefined {
  if (!identity || identity.emailVerified !== true) return undefined;
  return identity.email?.trim().toLowerCase() || undefined;
}
