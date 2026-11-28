-- Evaluate transaction-local identity once per statement, preserving each policy's
-- existing predicates, command, roles and fail-closed handling of missing context.
DO $$
DECLARE
  policy_row record;
  context_key text;
  existing_call text;
  cached_call text;
  next_using text;
  next_check text;
  clauses text;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual LIKE '%current_setting(%' OR with_check LIKE '%current_setting(%')
  LOOP
    next_using := policy_row.qual;
    next_check := policy_row.with_check;
    FOREACH context_key IN ARRAY ARRAY['app.store_id', 'app.user_id', 'app.invitation_digest']
    LOOP
      existing_call := format('current_setting(%L::text, true)', context_key);
      cached_call := format('(SELECT current_setting(%L::text, true))', context_key);
      -- Do not rewrite policies that already contain subqueries.
      IF position('SELECT' IN policy_row.qual) = 0 THEN
        next_using := replace(next_using, existing_call, cached_call);
      END IF;
      IF position('SELECT' IN policy_row.with_check) = 0 THEN
        next_check := replace(next_check, existing_call, cached_call);
      END IF;
    END LOOP;
    IF next_using IS DISTINCT FROM policy_row.qual OR next_check IS DISTINCT FROM policy_row.with_check THEN
      clauses := '';
      IF next_using IS NOT NULL THEN clauses := clauses || format(' USING (%s)', next_using); END IF;
      IF next_check IS NOT NULL THEN clauses := clauses || format(' WITH CHECK (%s)', next_check); END IF;
      EXECUTE format('ALTER POLICY %I ON %I.%I%s', policy_row.policyname, policy_row.schemaname, policy_row.tablename, clauses);
    END IF;
  END LOOP;
END;
$$;
