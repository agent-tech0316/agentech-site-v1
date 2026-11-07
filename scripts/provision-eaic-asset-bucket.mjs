// Run with the server's Supabase credentials before enabling exempt uploads.
const base = process.env.SUPABASE_URL?.replace(/\/$/, "").replace(/\/rest\/v1$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error("Supabase server credentials required");
const bucket = "eaic-account-assets";
const endpoint = base + "/storage/v1/bucket";
const headers = { apikey:key, authorization:`Bearer ${key}`, "content-type":"application/json" };
const existing = await fetch(`${endpoint}/${bucket}`, {headers});
if (!existing.ok) {
  const error = await existing.json();
  if (Number(error.statusCode ?? existing.status) !== 404) throw new Error("Could not inspect asset bucket");
  const create = await fetch(endpoint, {method:"POST", headers, body:JSON.stringify({id:bucket,name:bucket,public:false})});
  if (!create.ok) throw new Error("Could not create private asset bucket");
}
const verify = await fetch(`${endpoint}/${bucket}`, {headers});
const config = await verify.json();
if (!verify.ok || config.id !== bucket || config.public !== false) throw new Error("Asset bucket must be private");
console.log("Verified private bucket " + bucket);
