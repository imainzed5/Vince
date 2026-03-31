"use client";

import { useEffect, useState } from "react";

import { formatTimestamp, toRelativeTime } from "@/lib/utils/time";

type RelativeTimeTextProps = {
  value: string | null | undefined;
  initialReferenceTime?: number;
  className?: string;
};

export function RelativeTimeText({
  value,
  initialReferenceTime,
  className,
}: RelativeTimeTextProps) {
  const getInitialLabel = () => {
    if (typeof initialReferenceTime === "number") {
      return toRelativeTime(value, initialReferenceTime);
    }

    return formatTimestamp(value, { fallback: "just now" });
  };

  const [label, setLabel] = useState(() =>
    getInitialLabel(),
  );

  useEffect(() => {
    setLabel(toRelativeTime(value));

    const intervalId = window.setInterval(() => {
      setLabel(toRelativeTime(value));
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [value]);

  return (
    <time className={className} dateTime={value ?? undefined}>
      {label}
    </time>
  );
}