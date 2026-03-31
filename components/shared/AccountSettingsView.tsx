"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, KeyRound, LogOut, MoonStar, SunMedium, UserRound } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import {
  changePasswordAction,
  updateUserProfileAction,
} from "@/app/(app)/settings/actions";
import { logoutAction } from "@/app/(auth)/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_USER_TIMEZONE } from "@/lib/supabase/user-profiles";
import { useUIStore } from "@/stores/uiStore";
import type { AppearanceMode } from "@/lib/appearance";
import type { UserNotificationPreferences } from "@/types";

type AccountSettingsViewProps = {
  email: string | null;
  initialDisplayName: string;
  initialNotificationPreferences: UserNotificationPreferences;
  initialTimezone: string;
};

const TIMEZONE_OPTIONS = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

function PreferenceToggle({
  checked,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border px-4 py-3">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function AppearanceButton({
  active,
  label,
  mode,
  onSelect,
}: {
  active: boolean;
  label: string;
  mode: AppearanceMode;
  onSelect: (mode: AppearanceMode) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
        active
          ? "border-primary bg-primary/6 text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {mode === "light" ? <SunMedium className="size-4" /> : <MoonStar className="size-4" />}
        {label}
      </span>
    </button>
  );
}

export function AccountSettingsView({
  email,
  initialDisplayName,
  initialNotificationPreferences,
  initialTimezone,
}: AccountSettingsViewProps) {
  const router = useRouter();
  const appearance = useUIStore((state) => state.appearance);
  const setAppearance = useUIStore((state) => state.setAppearance);

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [notificationPreferences, setNotificationPreferences] =
    useState<UserNotificationPreferences>(initialNotificationPreferences);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingProfile, startSavingProfile] = useTransition();
  const [isSavingPassword, startSavingPassword] = useTransition();

  const profileChanged =
    displayName.trim() !== initialDisplayName
    || timezone !== initialTimezone
    || notificationPreferences.chatMentions !== initialNotificationPreferences.chatMentions
    || notificationPreferences.taskReminders !== initialNotificationPreferences.taskReminders;

  const submitProfile = () => {
    startSavingProfile(async () => {
      const result = await updateUserProfileAction({
        displayName,
        notificationPreferences,
        timezone,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  };

  const submitPassword = () => {
    startSavingPassword(async () => {
      const result = await changePasswordAction({
        password,
        confirmPassword,
      });

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      setPassword("");
      setConfirmPassword("");
      toast.success(result.message);
    });
  };

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-2">
        <Badge variant="outline">Account settings</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Manage your Vince account</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Update the identity your teammates see, control your own preferences, and handle session security without mixing those changes into workspace administration.
        </p>
      </header>

      <Alert>
        <AlertTitle>Workspace controls stay separate</AlertTitle>
        <AlertDescription>
          Workspace invite codes, task fields, and workspace-level rules still live under workspace settings. Use the workspace navigation when you need to change team-wide configuration.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4" />
              Profile
            </CardTitle>
            <CardDescription>
              This is how your account appears across activity, chat, task assignment labels, and workspace member lists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={60}
                placeholder="Alex Carter"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email ?? "No email available"} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={(value) => setTimezone(value ?? DEFAULT_USER_TIMEZONE)}>
                <SelectTrigger className="h-10 w-full rounded-xl px-3">
                  <SelectValue placeholder="Choose a timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={submitProfile} disabled={isSavingProfile || !profileChanged}>
                {isSavingProfile ? "Saving..." : "Save account settings"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" />
              Security
            </CardTitle>
            <CardDescription>
              Change the password on your current session or leave the app from here if you are done.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                placeholder="Re-enter the new password"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              If you are locked out instead, use the password recovery flow from the sign-in page.
            </p>
            <div className="flex flex-wrap justify-between gap-3">
              <form action={logoutAction}>
                <Button type="submit" variant="outline">
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </form>
              <Button
                type="button"
                onClick={submitPassword}
                disabled={isSavingPassword || password.length < 8 || confirmPassword.length < 8}
              >
                {isSavingPassword ? "Updating..." : "Update password"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="size-4" />
              Preferences
            </CardTitle>
            <CardDescription>
              These settings control what the app surfaces to you today. They do not imply email delivery or digests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <PreferenceToggle
              checked={notificationPreferences.chatMentions}
              description="Keep mention-driven chat notifications visible in your inbox surfaces."
              label="Chat mentions"
              onCheckedChange={(checked) =>
                setNotificationPreferences((current) => ({ ...current, chatMentions: checked }))
              }
            />
            <PreferenceToggle
              checked={notificationPreferences.taskReminders}
              description="Show due, overdue, and stale blocked-task reminders in your inbox surfaces."
              label="Task reminders"
              onCheckedChange={(checked) =>
                setNotificationPreferences((current) => ({ ...current, taskReminders: checked }))
              }
            />
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={submitProfile} disabled={isSavingProfile || !profileChanged}>
                {isSavingProfile ? "Saving..." : "Save preferences"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SunMedium className="size-4" />
              Appearance
            </CardTitle>
            <CardDescription>
              Theme is still stored locally for now, so it follows this browser and device rather than the database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <AppearanceButton active={appearance === "light"} label="Light mode" mode="light" onSelect={setAppearance} />
              <AppearanceButton active={appearance === "dark"} label="Dark mode" mode="dark" onSelect={setAppearance} />
            </div>
            <p className="text-sm text-muted-foreground">
              Want workspace-level controls instead? Those still live under each workspace’s admin settings.
            </p>
            <Link href="/dashboard" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Back to your workspaces
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}