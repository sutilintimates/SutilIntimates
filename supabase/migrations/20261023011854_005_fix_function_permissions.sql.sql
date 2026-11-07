/*
# Fix SECURITY DEFINER Function Permissions

## Overview
The database linter found that several SECURITY DEFINER functions were callable
by the anon (public) role. This happened because Postgres grants EXECUTE to PUBLIC
by default on every function, and REVOKE FROM anon only removes the explicit anon
grant — anon still inherits EXECUTE through PUBLIC.

## Security Changes

### add_credits (CRITICAL — must only be callable by the webhook edge function)
- REVOKE EXECUTE FROM PUBLIC, anon, authenticated
- GRANT EXECUTE TO service_role only
- An authenticated user could otherwise call add_credits with their own ID
  and arbitrary amounts to get unlimited free credits.

### Management functions (must require authentication, use auth.uid())
- delete_profile, toggle_profile_pause, get_dashboard_stats,
  get_admin_stats, get_admin_profiles
- REVOKE EXECUTE FROM PUBLIC (closes the inheritance loophole)
- Keep GRANT TO authenticated (already present)

### Public functions (visitors without accounts must call them)
- get_public_feed, process_contact_click, record_profile_view, submit_review
- Already correctly granted to anon, authenticated — no change needed.
*/

-- add_credits: service_role ONLY (called by asaas-webhook edge function)
REVOKE EXECUTE ON FUNCTION add_credits(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION add_credits(uuid, numeric) TO service_role;

-- Management functions: authenticated only, close PUBLIC loophole
REVOKE EXECUTE ON FUNCTION delete_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_profile() TO authenticated;

REVOKE EXECUTE ON FUNCTION toggle_profile_pause() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION toggle_profile_pause() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_dashboard_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_dashboard_stats(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_admin_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_admin_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_admin_profiles() TO authenticated;