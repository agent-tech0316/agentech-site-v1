create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'agentech-desktop-session-cleanup',
  '17 * * * *',
  'select public.desktop_session_cleanup();'
);
