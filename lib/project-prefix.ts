const PROJECT_PREFIX_MIN_LENGTH = 2;
const PROJECT_PREFIX_MAX_LENGTH = 6;

function tokenizeProjectName(name: string): string[] {
  return name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeProjectPrefix(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, PROJECT_PREFIX_MAX_LENGTH);
}

export function deriveProjectPrefix(name: string): string {
  const words = tokenizeProjectName(name);

  if (words.length >= 2) {
    const acronym = words
      .slice(0, 4)
      .map((word) => word[0])
      .join("");

    if (acronym.length >= PROJECT_PREFIX_MIN_LENGTH) {
      return acronym;
    }
  }

  const compact = normalizeProjectPrefix(words.join(""));

  if (compact.length >= PROJECT_PREFIX_MIN_LENGTH) {
    return compact.slice(0, Math.min(4, compact.length));
  }

  return "PRJ";
}

export function makeUniqueProjectPrefix(basePrefix: string, existingPrefixes: string[]): string {
  const normalizedBase = normalizeProjectPrefix(basePrefix) || "PRJ";
  const existing = new Set(existingPrefixes.map((prefix) => normalizeProjectPrefix(prefix)));

  if (!existing.has(normalizedBase)) {
    return normalizedBase;
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = String(index);
    const headLength = Math.max(PROJECT_PREFIX_MIN_LENGTH, PROJECT_PREFIX_MAX_LENGTH - suffix.length);
    const candidate = `${normalizedBase.slice(0, headLength)}${suffix}`;

    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  return `${normalizedBase.slice(0, PROJECT_PREFIX_MAX_LENGTH - 1)}9`;
}

export function isValidProjectPrefix(value: string): boolean {
  return /^[A-Z0-9]{2,6}$/.test(value);
}