-- Phase 4.2: undo in a study session.
-- A student may take back their own answer shortly after giving it (the "Z" key). Older review
-- logs stay as written, so the history used for statistics cannot be rewritten later.

grant delete on public.review_logs to authenticated;

create policy "review_logs: undo own recent" on public.review_logs for delete to authenticated
  using (user_id = (select auth.uid()) and reviewed_at > now() - interval '1 hour');
