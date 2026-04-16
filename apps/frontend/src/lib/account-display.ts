export type AccountDisplayIdentity = {
  fullName?: string | null;
  username?: string | null;
  firstName?: string | null;
  primaryEmailAddress?: { emailAddress: string | null } | null;
};

export function getAccountDisplayLabel(
  {
    fullName,
    username,
    firstName,
    primaryEmailAddress,
  }: AccountDisplayIdentity,
  fallback = "Account",
) {
  const fullNameLabel = fullName?.trim();

  if (fullNameLabel) {
    return fullNameLabel;
  }

  const usernameLabel = username?.trim();

  if (usernameLabel) {
    return usernameLabel;
  }

  const firstNameLabel = firstName?.trim();

  if (firstNameLabel) {
    return firstNameLabel;
  }

  const emailHandle = primaryEmailAddress?.emailAddress?.split("@")[0]?.trim();

  if (emailHandle) {
    return emailHandle;
  }

  return fallback;
}
