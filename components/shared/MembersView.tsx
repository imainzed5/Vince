"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/sonner";

import {
  removeWorkspaceMemberAction,
  updateWorkspaceMemberRoleAction,
} from "@/app/(app)/workspace/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export type MemberListItem = {
  id: string;
  userId: string;
  role: string;
  displayName: string;
  joinedDateLabel: string;
};

type MembersViewProps = {
  workspaceId: string;
  inviteCode: string;
  currentUserId: string;
  currentUserRole: string;
  members: MemberListItem[];
};

function initials(value: string): string {
  return value.slice(0, 2).toUpperCase();
}

export function MembersView({
  workspaceId,
  inviteCode,
  currentUserId,
  currentUserRole,
  members,
}: MembersViewProps) {
  const router = useRouter();
  const isOwner = currentUserRole === "owner";
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const [copied, setCopied] = useState(false);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const copyInviteCode = async () => {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    toast.success("Invite code copied.");
    window.setTimeout(() => setCopied(false), 1500);
  };

  const removeMember = (member: MemberListItem) => {
    const confirmed = window.confirm(`Remove ${member.displayName} from this workspace?`);

    if (!confirmed) {
      return;
    }

    setPendingActionKey(`${member.userId}:remove`);

    startTransition(async () => {
      const result = await removeWorkspaceMemberAction({
        workspaceId,
        memberUserId: member.userId,
      });

      setPendingActionKey(null);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  };

  const changeRole = (member: MemberListItem, nextRole: MemberListItem["role"]) => {
    const actionLabel = nextRole === "owner" ? "grant owner access to" : "change the role for";
    const confirmed = window.confirm(`Do you want to ${actionLabel} ${member.displayName}?`);

    if (!confirmed) {
      return;
    }

    setPendingActionKey(`${member.userId}:${nextRole}`);

    startTransition(async () => {
      const result = await updateWorkspaceMemberRoleAction({
        workspaceId,
        memberUserId: member.userId,
        role: nextRole,
      });

      setPendingActionKey(null);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  };

  return (
    <main className="space-y-4 p-6">
      <section className="rounded-xl border bg-white p-4">
        <p className="text-sm text-muted-foreground">Invite code</p>
        <div className="mt-2 flex items-center gap-3">
          <p className="text-2xl font-semibold tracking-wide">{inviteCode}</p>
          <Button type="button" variant="outline" onClick={() => void copyInviteCode()}>
            {copied ? "Copied!" : "Copy invite code"}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h1 className="mb-3 text-xl font-semibold">Members</h1>

        {isOwner ? (
          <p className="mb-3 text-sm text-muted-foreground">
            Owners can promote members, step down co-owners, and remove members. At least one owner must remain.
          </p>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">
            You can view members here, but only owners can remove people from the workspace.
          </p>
        )}

        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members found.</p>
        ) : (
          <ul className="space-y-2">
            {members.map((member) => {
              const isCurrent = member.userId === currentUserId;
              const displayName = isCurrent ? `${member.displayName} (You)` : member.displayName;
              const memberIsOwner = member.role === "owner";
              const canDemote = memberIsOwner && ownerCount > 1;
              const removeDisabled = !isOwner || memberIsOwner || isCurrent || isPending;
              const isRemoving = pendingActionKey === `${member.userId}:remove`;
              const isPromoting = pendingActionKey === `${member.userId}:owner`;
              const isDemoting = pendingActionKey === `${member.userId}:member`;

              return (
                <li key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(displayName)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{displayName}</p>
                      <p className="text-xs text-muted-foreground">Joined {member.joinedDateLabel}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium">
                      {memberIsOwner ? "Owner" : "Member"}
                    </span>
                    {isOwner ? (
                      memberIsOwner ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canDemote || isPending}
                          onClick={() => changeRole(member, "member")}
                        >
                          {isDemoting ? "Updating..." : isCurrent ? "Step down" : "Make member"}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => changeRole(member, "owner")}
                        >
                          {isPromoting ? "Updating..." : "Make owner"}
                        </Button>
                      )
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={removeDisabled}
                      onClick={() => removeMember(member)}
                    >
                      {isRemoving ? "Removing..." : "Remove member"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
