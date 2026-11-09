import {NextResponse} from 'next/server';
import {eaicSdkContract} from '@/features/eaic/02-unified-api/projects-validation/eaic-sdk-contract';

export function GET() {
  const connection=new Set(['host','port','backend','target','variant','dry_run','timeout','client_factory','native_executor','connect_kwargs','ssh_username','ssh_password','ssh_port','relay_url','relay_token','repository_root']);
  return NextResponse.json({version:eaicSdkContract.version,sdkRevision:eaicSdkContract.revision,
    contractHash:eaicSdkContract.hash,qualification:'Software command inventory; live SDK and booking admission still apply',
    commands:eaicSdkContract.entries.map(e=>({robot:e.robot,method:e.method,access:e.policy,
      reason:e.reason,effect:e.effect,parameters:e.parameters.filter(p=>!p.name.startsWith('_')&&!connection.has(p.name)).map(p=>({name:p.name,required:p.required,type:p.annotation})),varargs:e.varargs}))});
}
