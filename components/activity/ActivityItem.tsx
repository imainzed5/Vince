"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RelativeTimeText } from "@/components/shared/RelativeTimeText";
import type { Json } from "@/types/database.types";

type ActivityItemData = {
  id: string;
  action: string;
  metadata: Json | null;
  actorName: string;
  created_at: string | null;
  referenceTime?: number;
};

const activityText: Record<string, (metadata: Record<string, unknown>) => string> = {
  "task.created": (m) => `created task ${String(m.identifier ?? "") } \"${String(m.title ?? "") }\"`,
  "task.status_changed": (m) =>
    `moved ${String(m.identifier ?? "") } from ${String(m.from ?? "") } to ${String(m.to ?? "") }`,
  "task.assigned": (m) => `assigned ${String(m.identifier ?? "") } to a teammate`,
  "task.blocked": (m) => `flagged ${String(m.identifier ?? "") } as blocked`,
  "task.updated": (m) => `updated task ${String(m.identifier ?? "") }`,
  "task.duplicated": (m) => `duplicated ${String(m.sourceIdentifier ?? "") } into ${String(m.identifier ?? "") }`,
  "task.deleted": (m) => `deleted task ${String(m.identifier ?? "") }`,
  "task.comment_added": (m) => `commented on ${String(m.identifier ?? "") }`,
  "task.attachment_added": (m) => `attached a file to ${String(m.identifier ?? "") }`,
  "task.dependency_added": (m) =>
    `marked ${String(m.blockedIdentifier ?? "") } as blocked by ${String(m.blockingIdentifier ?? "") }`,
  "task.dependency_removed": (m) =>
    `removed the dependency between ${String(m.blockedIdentifier ?? "") } and ${String(m.blockingIdentifier ?? "") }`,
  "note.created": (m) => `added a note \"${String(m.title ?? "") }\"`,
  "note.updated": (m) => `updated note \"${String(m.title ?? "") }\"`,
  "note.pinned": (m) => `pinned note \"${String(m.title ?? "") }\"`,
  "note.unpinned": (m) => `unpinned note \"${String(m.title ?? "") }\"`,
  "note.deleted": (m) => `deleted note \"${String(m.title ?? "") }\"`,
  "milestone.created": (m) => `added milestone \"${String(m.name ?? "") }\"`,
  "milestone.deleted": (m) => `removed milestone \"${String(m.name ?? "") }\"`,
  "standup.posted": () => "posted a standup update",
  "project.created": (m) => `created project \"${String(m.name ?? "") }\"`,
  "project.updated": (m) => `updated project \"${String(m.name ?? "") }\"`,
  "project.phase_changed": (m) =>
    `changed the project phase from ${String(m.from ?? "") } to ${String(m.to ?? "") }`,
  "project.archived": (m) => `archived project \"${String(m.name ?? "") }\"`,
  "project.restored": (m) => `restored project \"${String(m.name ?? "") }\"`,
  "project.deleted": (m) => `deleted project \"${String(m.name ?? "") }\"`,
  "project.prefix_updated": (m) =>
    `updated the project prefix from ${String(m.previousPrefix ?? "") } to ${String(m.nextPrefix ?? "") }`,
  "project.brief_updated": (m) => `updated the project brief (${String((m.fields as string[] | undefined)?.join(", ") ?? "details") })`,
  "project.share_created": () => "created a client share link",
  "project.share_revoked": () => "revoked a client share link",
  "workspace.updated": (m) => `updated workspace ${String(m.field ?? "settings")}`,
  "workspace.invite_code_regenerated": () => "regenerated the workspace invite code",
  "member.joined": () => "joined the workspace",
  "member.left": () => "left the workspace",
  "member.removed": () => "removed a member from the workspace",
  "member.role_changed": (m) =>
    `changed a teammate role from ${String(m.previousRole ?? "") } to ${String(m.nextRole ?? "") }`,
};

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function ActivityItem({
  id,
  action,
  metadata,
  actorName,
  created_at,
  referenceTime,
}: ActivityItemData) {
  const metadataObject = (metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : {}) as Record<string, unknown>;

  const textFactory = activityText[action];
  const text = textFactory ? textFactory(metadataObject) : action;

  return (
    <li key={id} className="flex items-start gap-3 rounded-lg border bg-white p-3">
      <Avatar size="sm">
        <AvatarFallback>{initials(actorName)}</AvatarFallback>
      </Avatar>
      <div className="text-sm text-slate-700">
        <p>
          <span className="font-semibold text-slate-900">{actorName}</span> {text}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <RelativeTimeText value={created_at} initialReferenceTime={referenceTime} />
        </p>
      </div>
    </li>
  );
}
