alter table public.user_profiles
add column if not exists sidebar_preferences jsonb not null default jsonb_build_object(
  'pinnedWorkspaceIds', jsonb_build_array(),
  'recentWorkspaceIds', jsonb_build_array(),
  'pinnedProjectIdsByWorkspace', jsonb_build_object(),
  'recentProjectIdsByWorkspace', jsonb_build_object(),
  'hasSeenCompactRailOnboarding', false
);