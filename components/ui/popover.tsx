"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup> &
  Pick<React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Positioner>, "align" | "side" | "sideOffset">;

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(function PopoverContent(
  { align = "center", className, side = "right", sideOffset = 12, ...props },
  ref,
) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} side={side} sideOffset={sideOffset}>
        <PopoverPrimitive.Popup
          ref={ref}
          className={cn(
            "z-[75] w-72 rounded-2xl border border-white/10 bg-[rgba(15,18,24,0.96)] p-2 text-white shadow-[0_28px_70px_-32px_rgba(0,0,0,0.9)] backdrop-blur-xl outline-none motion-safe:transition-[opacity,transform] motion-safe:duration-150 data-[ending-style]:translate-x-1 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-1 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
});

export { Popover, PopoverContent, PopoverTrigger };