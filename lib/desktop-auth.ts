import {createHash,createHmac,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {isValidAccountIdentifier,normalizeEmail} from '@/lib/prototype-auth';
import {verifyAccountCredentials} from '@/lib/verify-account-credentials';
import {createSession,findActiveSession,revokeSession,consumeLoginAttempt} from '@/lib/desktop-session-store';

const headers={'Cache-Control':'no-store'};
function reply(status:number,error:string){return Response.json({error},{status,headers});}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function token(request:Request){const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')||'');return match?.[1]||null;}
async function readBody(request:Request) {
 const reader=request.body?.getReader(); if(!reader)throw new Error('invalid-body');
 let length=0;const chunks:Uint8Array[]=[];
 try {for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>8192)throw new Error('body-too-large');chunks.push(part.value);}}
 finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function bucket(value:string){
 const secret=process.env.AGENTECH_SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret)throw new Error('Unavailable');
 return createHmac('sha256',secret).update(value).digest('hex');
}
function trustedClient(request:Request){
 // Vercel overwrites this header. Never trust arbitrary x-forwarded-for.
 const ip=process.env.VERCEL==='1'?request.headers.get('x-vercel-forwarded-for')?.trim():null;
 return ip&&isIP(ip)?ip:'unidentified';
}
export async function desktopSignIn(request:Request):Promise<Response>{
 let payload;
 try{payload=await readBody(request);}catch(e){return reply(e instanceof Error&&e.message==='body-too-large'?413:400,'Enter your account and password.');}
 const identifier=normalizeEmail(payload?.identifier),password=payload?.password;
 if(identifier.length>320||!isValidAccountIdentifier(identifier)||typeof password!=='string'||!password||password.length>1024)return reply(400,'Enter your account and password.');
 try{
  const limits=await Promise.all([consumeLoginAttempt(bucket('account:'+identifier),5),consumeLoginAttempt(bucket('ip:'+trustedClient(request)),30)]);
  if(limits.some(l=>!l.allowed))return Response.json({error:'Too many sign-in attempts. Please try again later.'},{status:429,headers:{...headers,'Retry-After':String(Math.max(...limits.filter(l=>!l.allowed).map(l=>l.retryAfter)))}});
  const account=await verifyAccountCredentials(identifier,password);
  if(!account)return reply(401,'Account or password is incorrect.');
  const sessionToken=randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+30*86400000).toISOString();
  await createSession(hash(sessionToken),account.email,expiresAt);
  return Response.json({token:sessionToken,email:account.email,expiresAt},{headers});
 }catch{return reply(503,'Sign-in is temporarily unavailable. Please try again.');}
}
export async function desktopSession(request:Request):Promise<Response>{
 const value=token(request);if(!value)return reply(401,'Sign in to your Agentech account.');
 try{
  const account=await findActiveSession(hash(value));
  if(!account||Date.parse(account.expiresAt)<=Date.now())return reply(401,'Your session has expired. Sign in again.');
  return Response.json(account,{headers});
 }catch{return reply(503,'Account verification is temporarily unavailable. Please retry.');}
}
export async function desktopSignOut(request:Request):Promise<Response>{
 const value=token(request);if(!value)return reply(401,'Sign in to your Agentech account.');
 try{await revokeSession(hash(value));return new Response(null,{status:204,headers});}
 catch{return reply(503,'Sign-out could not reach the account service.');}
}
