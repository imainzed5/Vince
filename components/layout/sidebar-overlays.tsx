"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type SidebarPaletteItem = {
  id: string;
  label: string;
  meta: string;
  onSelect: () => void;
};

type SidebarQuickSwitchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  items: SidebarPaletteItem[];
};

type CompactRailOnboardingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
};

export function SidebarQuickSwitchDialog({
  open,
  onOpenChange,
  inputRef,
  query,
  onQueryChange,
  items,
}: SidebarQuickSwitchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-[24px] border border-white/10 bg-[#0f1218] p-0 text-white shadow-[0_28px_60px_-28px_rgba(0,0,0,0.82)]">
        <DialogHeader className="border-b border-white/8 px-5 py-4">
          <DialogTitle>Quick switch</DialogTitle>
          <DialogDescription>Jump between workspaces, projects, and common actions.</DialogDescription>
        </DialogHeader>
        <div className="px-5 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/34" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search workspaces, projects, or actions"
              className="h-11 rounded-[16px] border-white/10 bg-white/6 pl-10 text-sm text-white placeholder:text-white/34 focus-visible:border-white/16 focus-visible:ring-white/20 dark:bg-white/6"
            />
          </div>
          <div className="mt-4 max-h-80 space-y-1 overflow-y-auto pr-1">
            {items.length > 0 ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onSelect}
                  className="flex w-full items-center justify-between rounded-[16px] border border-transparent bg-white/4 px-3 py-2.5 text-left text-white/82 transition-[background-color,border-color,color,transform] duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/24 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1218] hover:border-white/10 hover:bg-white/8 hover:text-white motion-safe:hover:-translate-y-px"
                >
                  <span className="truncate text-sm font-medium">{item.label}</span>
                  <span className="ml-3 shrink-0 text-[0.7rem] uppercase tracking-[0.16em] text-white/38">{item.meta}</span>
                </button>
              ))
            ) : (
              <div className="rounded-[18px] border border-dashed border-white/10 bg-white/4 px-3 py-5 text-sm text-white/54">
                No matches for that search.
              </div>
            )}
          </div>
          <p className="mt-3 text-[0.68rem] text-white/38">Shortcut: Ctrl/Cmd + K</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CompactRailOnboardingDialog({
  open,
  onOpenChange,
  onContinue,
}: CompactRailOnboardingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[24px] border border-white/10 bg-[#0f1218] text-white shadow-[0_28px_60px_-28px_rgba(0,0,0,0.82)]">
        <DialogHeader>
          <DialogTitle>Compact rail</DialogTitle>
          <DialogDescription>
            The collapsed sidebar keeps workspace and project switching one click away. Hover for labels, use the switchers for pinning, and press Ctrl/Cmd + K to jump faster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-white/74">
          <p>Workspace and project chips now surface recent and pinned items.</p>
          <p>Unread chat stays visible on the workspace chip in compact mode.</p>
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="mt-2 inline-flex h-10 items-center justify-center rounded-[16px] border border-white/10 bg-white/8 px-4 text-sm font-medium text-white transition-colors hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/28"
        >
          Continue
        </button>
      </DialogContent>
    </Dialog>
  );
}