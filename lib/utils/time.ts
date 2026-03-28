const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const shortCalendarDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fullCalendarDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

type RelativeTimeReference = Date | number | string | null | undefined;
type CalendarDateOptions = {
  fallback?: string;
  includeYear?: boolean;
};

function toCalendarDate(value: string): Date | null {
  const calendarDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (calendarDateMatch) {
    const [, year, month, day] = calendarDateMatch;

    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function diffInSeconds(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 1000);
}

function toReferenceDate(referenceTime?: RelativeTimeReference): Date {
  if (referenceTime instanceof Date) {
    return referenceTime;
  }

  if (typeof referenceTime === "number" || typeof referenceTime === "string") {
    const date = new Date(referenceTime);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return new Date();
}

export function formatCalendarDate(
  value: string | null | undefined,
  options: CalendarDateOptions = {},
): string {
  const fallback = options.fallback ?? "Unknown";

  if (!value) {
    return fallback;
  }

  const date = toCalendarDate(value);

  if (!date) {
    return fallback;
  }

  return options.includeYear
    ? fullCalendarDateFormatter.format(date)
    : shortCalendarDateFormatter.format(date);
}

export function toRelativeTime(
  value: string | null | undefined,
  referenceTime?: RelativeTimeReference,
): string {
  if (!value) {
    return "just now";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const seconds = Math.max(0, diffInSeconds(date, toReferenceDate(referenceTime)));

  if (seconds < 60) {
    return rtf.format(-seconds, "second");
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return rtf.format(-minutes, "minute");
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return rtf.format(-hours, "hour");
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return rtf.format(-days, "day");
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return rtf.format(-weeks, "week");
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return rtf.format(-months, "month");
  }

  const years = Math.floor(days / 365);
  return rtf.format(-years, "year");
}
