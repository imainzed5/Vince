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

export function getDisplayName(value: string | null | undefined, fallback = "Unknown"): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return fallback;
  }

  return normalizedValue;
}

export function getMemberDisplayName(value: string | null | undefined): string {
  return getDisplayName(value, "Unknown member");
}
