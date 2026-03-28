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
          isCurrentUser ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white",
        )}
      >
        {showMeta ? <p className="mb-1 text-xs font-semibold text-slate-600">{displayName}</p> : null}
        <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{content}</p>
        <p className="mt-1 text-[11px] text-slate-500">{toRelativeTime(timestamp)}</p>
      </div>
    </div>
  );
}
