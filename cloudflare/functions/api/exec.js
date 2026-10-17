/** Cloudflare Pages Function: verifies LINE ID token then HMAC-signs the GAS request.
 * Never expose LINE_CHANNEL_ID, GAS_URL or GAS_SHARED_SECRET to the browser.
 */
const msg=(error,status=400)=>Response.json({ok:false,error},{status,headers:{'Cache-Control':'no-store'}});
// Translate LINE's public verification error categories into safe, actionable codes.
// Never return or log ID tokens, user IDs, JWT payloads, or LINE's raw response.
function lineVerifyError(status, payload) {
  const detail=String(payload && payload.error_description || '');
  if (/Invalid IdToken Audience/i.test(detail)) return 'LINE_AUDIENCE_MISMATCH';
  if (/IdToken expired/i.test(detail)) return 'LINE_ID_TOKEN_EXPIRED';
  if (/Invalid IdToken Issuer/i.test(detail)) return 'LINE_ID_TOKEN_ISSUER_INVALID';
  if (/Invalid IdToken Nonce/i.test(detail)) return 'LINE_ID_TOKEN_NONCE_INVALID';
  if (/Invalid IdToken Subject Identifier/i.test(detail)) return 'LINE_ID_TOKEN_SUBJECT_INVALID';
  if (/Invalid IdToken/i.test(detail)) return 'LINE_ID_TOKEN_REJECTED';
  return 'LINE_VERIFY_HTTP_'+String(status);
}
const enc = new TextEncoder();
async function hmac(secret,data) {
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const b=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(data)));
  return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
export async function onRequestPost({request,env}) {
  if(!env.LINE_CHANNEL_ID||!env.GAS_URL||!env.GAS_SHARED_SECRET) return msg('SERVER_NOT_CONFIGURED',503);
  if(env.GAS_SHARED_SECRET.length<32)return msg('SECRET_TOO_SHORT',503);
  const length=Number(request.headers.get('content-length')||0);
  if(length>20000)return msg('REQUEST_TOO_LARGE',413);
  const auth=request.headers.get('authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token||token.length>10000)return msg('LOGIN_REQUIRED',401);
  let input;
  try { const raw=await request.text();if(raw.length>20000)return msg('REQUEST_TOO_LARGE',413);input=JSON.parse(raw); }
  catch {return msg('INVALID_JSON');}
  if(typeof input.action!=='string'||!input.action||typeof input.data!=='object'||input.data===null||Array.isArray(input.data))return msg('INVALID_REQUEST');
  let verified;
  try {
    const form=new URLSearchParams({id_token:token,client_id:env.LINE_CHANNEL_ID});
    const vr=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',body:form,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
    if(!vr.ok){
      const problem=await vr.json().catch(()=>({}));
      return msg(lineVerifyError(vr.status,problem),401);
    }
    verified=await vr.json();
    if(String(verified.aud||'')!==String(env.LINE_CHANNEL_ID))return msg('LINE_AUDIENCE_MISMATCH',401);
    if(!/^U[0-9a-f]{32}$/i.test(String(verified.sub||'')))return msg('LINE_USER_ID_FORMAT_UNEXPECTED',401);
  } catch {return msg('LINE_VERIFY_UNAVAILABLE',503);}
  // Always sign ASCII-only JSON to avoid Unicode decoding/encoding differences
  // between Cloudflare WebCrypto and Apps Script e.postData.contents.
  // JSON.parse on the GAS side restores the exact same Chinese/emoji strings.
  const body=JSON.stringify({action:input.action,data:input.data,actor:{uid:verified.sub,name:verified.name||''}})
    .replace(/[\u007f-\uffff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
  const ts=Date.now().toString(),nonce=crypto.randomUUID();
  const sig=await hmac(env.GAS_SHARED_SECRET,`${ts}\n${nonce}\n${body}`);
  // Independent proof to classify key/runtime mismatch vs. payload mismatch.
  // This value is sent only server-to-server. It never exposes the secret.
  const proof=await hmac(env.GAS_SHARED_SECRET,`GUPPY_HMAC_PROOF_V1\n${ts}\n${nonce}`);
  try {
    const r=await fetch(env.GAS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ts,nonce,body,sig,proof}),redirect:'follow'});
    if(!r.ok)return msg('GAS_UNAVAILABLE_'+r.status,502);
    const responseText=await r.text();
    let data;
    try {data=JSON.parse(responseText);}catch{return msg('GAS_INVALID_RESPONSE',502);}
    if(typeof data.ok!=='boolean')return msg('GAS_INVALID_RESPONSE',502);
    return Response.json(data,{headers:{'Cache-Control':'no-store'}});
  }catch{return msg('GAS_NETWORK_ERROR',502);}
}
