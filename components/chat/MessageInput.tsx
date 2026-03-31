"use client";

import { useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";

type MessageInputProps = {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  helperText?: string;
  placeholder?: string;
};

export function MessageInput({
  onSend,
  disabled,
  helperText = "Enter to send, Shift+Enter for newline",
  placeholder = "Write a message...",
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);

  const trimmed = value.trim();

  const submit = async () => {
    if (!trimmed || isSending || disabled) {
      return;
    }

    setIsSending(true);

    try {
      await onSend(trimmed);
      setValue("");
    } finally {
      setIsSending(false);
    }
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await submit();
    }
  };

  return (
    <div className="surface-panel sticky bottom-0 rounded-lg border p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          className="surface-subpanel min-h-[40px] max-h-32 flex-1 resize-none rounded-md border border-border p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button type="button" disabled={!trimmed || disabled || isSending} onClick={() => void submit()}>
          Send
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{helperText}</p>
    </div>
  );
}
