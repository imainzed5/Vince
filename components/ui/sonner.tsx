"use client";

import { useEffect, useState } from "react";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

type ToastVariant = "success" | "error" | "info" | "warning" | "loading";

type ToastOptions = {
  id?: string;
  duration?: number;
};

type ToastRecord = {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
};

export type ToasterProps = {
  maxVisible?: number;
};

const DEFAULT_DURATION = 3500;
const toastListeners = new Set<(toasts: ToastRecord[]) => void>();
const toastTimeouts = new Map<string, number>();
let toastQueue: ToastRecord[] = [];

function notifyListeners() {
  const next = [...toastQueue];

  for (const listener of toastListeners) {
    listener(next);
  }
}

function clearToastTimeout(toastId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const timeoutId = toastTimeouts.get(toastId);

  if (timeoutId) {
    window.clearTimeout(timeoutId);
    toastTimeouts.delete(toastId);
  }
}

function dismissToast(toastId?: string) {
  if (!toastId) {
    for (const activeToast of toastQueue) {
      clearToastTimeout(activeToast.id);
    }

    toastQueue = [];
    notifyListeners();
    return;
  }

  clearToastTimeout(toastId);
  toastQueue = toastQueue.filter((toastItem) => toastItem.id !== toastId);
  notifyListeners();
}

function scheduleToastRemoval(toastId: string, duration: number) {
  clearToastTimeout(toastId);

  if (duration === Number.POSITIVE_INFINITY || typeof window === "undefined") {
    return;
  }

  const timeoutId = window.setTimeout(() => {
    dismissToast(toastId);
  }, duration);

  toastTimeouts.set(toastId, timeoutId);
}

function createToast(variant: ToastVariant, message: string, options?: ToastOptions) {
  const toastId = options?.id ?? `${variant}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const duration = options?.duration ?? (variant === "loading" ? Number.POSITIVE_INFINITY : DEFAULT_DURATION);
  const nextToast: ToastRecord = {
    id: toastId,
    message,
    variant,
    duration,
  };
  const existingIndex = toastQueue.findIndex((toastItem) => toastItem.id === toastId);

  if (existingIndex >= 0) {
    toastQueue = toastQueue.map((toastItem, index) => (index === existingIndex ? nextToast : toastItem));
  } else {
    toastQueue = [nextToast, ...toastQueue];
  }

  notifyListeners();
  scheduleToastRemoval(toastId, duration);

  return toastId;
}

export const toast = {
  success(message: string, options?: ToastOptions) {
    return createToast("success", message, options);
  },
  error(message: string, options?: ToastOptions) {
    return createToast("error", message, options);
  },
  info(message: string, options?: ToastOptions) {
    return createToast("info", message, options);
  },
  warning(message: string, options?: ToastOptions) {
    return createToast("warning", message, options);
  },
  loading(message: string, options?: ToastOptions) {
    return createToast("loading", message, options);
  },
  dismiss(toastId?: string) {
    dismissToast(toastId);
  },
};

function getToastStyles(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return {
        containerClassName: "border-emerald-200 bg-emerald-50 text-emerald-900",
        icon: <CircleCheckIcon className="size-4 text-emerald-600" />,
      };
    case "error":
      return {
        containerClassName: "border-red-200 bg-red-50 text-red-900",
        icon: <OctagonXIcon className="size-4 text-red-600" />,
      };
    case "warning":
      return {
        containerClassName: "border-amber-200 bg-amber-50 text-amber-900",
        icon: <TriangleAlertIcon className="size-4 text-amber-600" />,
      };
    case "loading":
      return {
        containerClassName: "border-slate-200 bg-white text-slate-900",
        icon: <Loader2Icon className="size-4 animate-spin text-slate-600" />,
      };
    case "info":
    default:
      return {
        containerClassName: "border-slate-200 bg-white text-slate-900",
        icon: <InfoIcon className="size-4 text-slate-600" />,
      };
  }
}

export function Toaster({ maxVisible = 4 }: ToasterProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  useEffect(() => {
    const listener = (nextToasts: ToastRecord[]) => {
      setToasts(nextToasts);
    };

    toastListeners.add(listener);
    listener(toastQueue);

    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
      {toasts.slice(0, maxVisible).map((toastItem) => {
        const { containerClassName, icon } = getToastStyles(toastItem.variant);

        return (
          <div
            key={toastItem.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${containerClassName}`}
            role="status"
            aria-live="polite"
          >
            <div className="mt-0.5 shrink-0">{icon}</div>
            <p className="flex-1 text-sm font-medium">{toastItem.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toastItem.id)}
              className="shrink-0 rounded-md p-1 text-current/70 transition hover:bg-black/5 hover:text-current"
              aria-label="Dismiss notification"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
