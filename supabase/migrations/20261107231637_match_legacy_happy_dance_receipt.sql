-- Older receipts can have a NULL motion name even after the owner identifies
-- the matching policy and WAV. The original archive digest binds both files.
create or replace function public.agentech_happy_dance_asset(p_email text, p_asset uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1
    from public.agentech_account_asset_submissions a
    join public.agentech_code_review_exemptions e using (email)
    where a.email = p_email and a.id = p_asset
      and a.robot_model = 'Master' and a.asset_kind = 'Package'
      and a.approval_basis = 'account-certification-exemption'
      and a.byte_size = 5164116
      and a.sha256 = '9096c47b127490112a23074e50623f472f2602a562ed3e87bf65a2e6ab2107db'
      and (a.native_motion_name is null or a.native_motion_name = 'linkcraft_resource_onnx_ffkuaile_0.0.1')
  )
$$;
