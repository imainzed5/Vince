"use client";

import { useEffect, useState } from "react";

import { toRelativeTime } from "@/lib/utils/time";

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
  const [label, setLabel] = useState(() =>
    toRelativeTime(value, initialReferenceTime),
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