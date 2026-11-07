/*
# Enforce safe defaults when a profile is created

1. Summary
The profile creation form still sends a starting balance and status. The previous
audit migration removed the right to write those columns, which blocked sign-up.
This migration restores the insert permission for those two columns and makes the
database itself force the safe values, so the client cannot choose them.

2. Changes
- profiles: new BEFORE INSERT trigger sets credits_balance to 0 and status to
  'exhausted' on every new profile, whatever the client sends.
- profiles: the signed-in role may insert credits_balance and status (required for
  the form to reference them). Values are overwritten by the trigger.

3. Important notes
- Credits can only increase through the payment webhook (service role) or the
  one-time welcome credit function, which records a transaction.
- Existing profiles are not modified.
*/

GRANT INSERT (credits_balance) ON profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_new_profile_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
NEW.credits_balance := 0;
NEW.status := 'exhausted';
RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_new_profile_defaults ON profiles;
CREATE TRIGGER enforce_new_profile_defaults
BEFORE INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_new_profile_defaults();
