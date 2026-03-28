export function getDisplayNameFromEmail(email: string | null | undefined): string {
  if (!email) {
    return "Unknown";
  }

  const localPart = email.split("@")[0] ?? "";
  if (!localPart) {
    return "Unknown";
  }

  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}
