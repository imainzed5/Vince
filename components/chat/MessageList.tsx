"use client";

import { ChatMessage } from "@/components/chat/ChatMessage";

export type ChatItem = {
  id: string;
  user_id: string;
  content: string;
  created_at: string | null;
  displayName: string;
  isOptimistic?: boolean;
};

type MessageListProps = {
  messages: ChatItem[];
  currentUserId: string | null;
};

export function MessageList({ messages, currentUserId }: MessageListProps) {
  if (!messages.length) {
    return (
      <div className="surface-panel flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No messages yet. Say hello.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const showMeta = !previous || previous.user_id !== message.user_id;

        return (
          <ChatMessage
            key={message.id}
            content={message.content}
            displayName={message.displayName}
            timestamp={message.created_at}
            isCurrentUser={currentUserId === message.user_id}
            showMeta={showMeta}
          />
        );
      })}
    </div>
  );
}
