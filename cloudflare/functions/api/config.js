export async function onRequestGet({env}) {
  return Response.json({liffId:env.LIFF_ID||'',brand:'Guppy HR',version:'1.0.0'},{headers:{'Cache-Control':'no-store'}});
}
