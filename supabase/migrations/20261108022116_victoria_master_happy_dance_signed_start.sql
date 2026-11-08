-- Victoria's signed Master booking authorizes playback of her verified Happy Dance package.
insert into public.agentech_master_booking_start_grants (profile_id, account_email)
select p.id, p.account_email
from public.agentech_account_profiles as p
where p.account_email = 'victoria_c@agent-tech.ai'
  and p.username = 'victoria'
  and p.profile_type = 'developer'
on conflict (profile_id) do nothing;
