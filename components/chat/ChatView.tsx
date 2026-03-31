"use client";

import { useEffect, useRef } from "react";

import { MessageInput } from "@/components/chat/MessageInput";
import { MessageList } from "@/components/chat/MessageList";
import { RelativeTimeText } from "@/components/shared/RelativeTimeText";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useChat } from "@/hooks/useChat";

type ChatViewProps = {
  workspaceId: string;
  projectId?: string | null;
  readOnly?: boolean;
  memberNames?: Record<string, string>;
};

export function ChatView({
  workspaceId,
  projectId = null,
  readOnly = false,
  memberNames = {},
}: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { messages, isLoading, currentUserId, errorMessage, sendMessage, lastReadAt, connected } = useChat({
    workspaceId,
    projectId,
    memberNames,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <main className="flex h-[calc(100vh-8rem)] flex-col gap-3 p-6">
      {readOnly ? (
        <Alert>
          <AlertDescription>
            This project is archived. Its chat history is still visible, but new messages are disabled until the project is restored.
          </AlertDescription>
        </Alert>
      ) : null}

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-200">{errorMessage}</div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{projectId ? "Project chat" : "Workspace chat"}</Badge>
          <span>Use @name to mention teammates.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span>{connected ? "Live" : "Reconnecting"}</span>
          {lastReadAt ? (
            <span className="inline-flex items-center gap-1">
              <span>Marked read</span>
              <RelativeTimeText value={lastReadAt} />
            </span>
          ) : null}
        </div>
      </div>

      <div className="surface-panel flex-1 overflow-y-auto rounded-xl border p-3">
        {isLoading ? (
          <div className="space-y-2">
            <div className="surface-subpanel h-12 animate-pulse rounded border" />
            <div className="surface-subpanel h-12 animate-pulse rounded border" />
            <div className="surface-subpanel h-12 animate-pulse rounded border" />
          </div>
        ) : (
          <MessageList messages={messages} currentUserId={currentUserId} />
        )}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        onSend={sendMessage}
        disabled={isLoading || readOnly}
        placeholder={readOnly ? "Archived projects are read-only" : "Write a message..."}
        helperText={
          readOnly
            ? "Restore the project to resume project chat."
            : "Use @name to mention teammates. Enter to send, Shift+Enter for newline"
        }
      />
    </main>
  );
}
