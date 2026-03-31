"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

type TooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Popup> &
  Pick<React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Positioner>, "align" | "side" | "sideOffset">;

const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(function TooltipContent(
  { align = "center", className, side = "right", sideOffset = 12, ...props },
  ref,
) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner align={align} side={side} sideOffset={sideOffset}>
        <TooltipPrimitive.Popup
          ref={ref}
          className={cn(
            "z-[80] max-w-64 rounded-xl border border-white/10 bg-[rgba(15,18,24,0.96)] px-3 py-1.5 text-[0.72rem] font-medium tracking-[0.01em] text-white shadow-[0_20px_45px_-28px_rgba(0,0,0,0.85)] backdrop-blur-md motion-safe:transition-[opacity,transform] motion-safe:duration-150 data-[ending-style]:translate-x-1 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:translate-x-1 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
});

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };