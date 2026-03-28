"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/sonner";

export function WorkspaceCreatedToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const created = searchParams.get("created") === "1";
    const joined = searchParams.get("joined") === "1";
    const alreadyJoined = searchParams.get("alreadyJoined") === "1";

    if (!created && !joined && !alreadyJoined) {
      return;
    }

    if (created) {
      toast.success("Workspace created successfully.");
    } else if (joined) {
      toast.success("Joined workspace successfully.");
    } else {
      toast.info("You are already a member of this workspace.");
    }

    const next = new URLSearchParams(searchParams.toString());
    next.delete("created");
    next.delete("joined");
    next.delete("alreadyJoined");

    const nextQuery = next.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl);
  }, [pathname, router, searchParams]);

  return null;
}
