export async function signature(body: string) {
  const secret=process.env.LENDLOOP_WEBHOOK_SECRET;
  if (!secret) throw new Error("LENDLOOP_WEBHOOK_SECRET is missing");
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=await crypto.subtle.sign("HMAC",key,encoder.encode(body));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
}
export async function validSignature(body:string, actual:string|null) {
  if (!actual || !/^[a-f0-9]{64}$/.test(actual)) return false;
  const expected=await signature(body);
  let diff=0;
  for (let i=0;i<expected.length;i++) diff |= expected.charCodeAt(i)^actual.charCodeAt(i);
  return diff===0;
}
