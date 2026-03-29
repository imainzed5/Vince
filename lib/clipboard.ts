export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  if (!window.isSecureContext || !document.hasFocus() || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}