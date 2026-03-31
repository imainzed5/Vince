"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toRelativeTime } from "@/lib/utils/time";

type ChatMessageProps = {
  content: string;
  displayName: string;
  timestamp: string | null;
  isCurrentUser: boolean;
  showMeta: boolean;
};

function initials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "?";
  }

  return trimmed.slice(0, 2).toUpperCase();
}

export function ChatMessage({ content, displayName, timestamp, isCurrentUser, showMeta }: ChatMessageProps) {
  return (
    <div className={cn("flex gap-2", isCurrentUser && "justify-end")}>
      {!isCurrentUser && showMeta ? (
        <Avatar size="sm">
          <AvatarFallback>{initials(displayName)}</AvatarFallback>
        </Avatar>
      ) : !isCurrentUser ? (
        <div className="size-7" />
      ) : null}

      <div
        className={cn(
          "max-w-[75%] rounded-xl border px-3 py-2",
          isCurrentUser
            ? "border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/15"
            : "surface-subpanel border-border",
        )}
      >
        {showMeta ? <p className="mb-1 text-xs font-semibold text-muted-foreground">{displayName}</p> : null}
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{content}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{toRelativeTime(timestamp)}</p>
      </div>
    </div>
  );
}
