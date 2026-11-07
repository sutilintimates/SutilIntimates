/*
# Public advertiser counter

1. New Functions
- `get_public_advertiser_count()` returns the number of advertiser profiles currently visible in the public feed
  (status = 'active', not an admin account). Read-only aggregate, exposes no individual profile data.

2. Security
- SECURITY DEFINER with fixed search_path = public.
- EXECUTE revoked from PUBLIC, granted to anon and authenticated so visitors can see the counter without signing in.
*/

CREATE OR REPLACE FUNCTION get_public_advertiser_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint FROM profiles WHERE status = 'active' AND is_admin = false;
$$;

REVOKE EXECUTE ON FUNCTION get_public_advertiser_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_advertiser_count() TO anon, authenticated;
