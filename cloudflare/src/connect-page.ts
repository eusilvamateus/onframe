type ConnectionPageOptions = {
  title: string;
  eyebrow: string;
  heading: string;
  description: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

type ResultPageOptions = {
  title: string;
  eyebrow: string;
  heading: string;
  message: string;
  tone: 'success' | 'danger';
};

type HostedPageConfig =
  | (ConnectionPageOptions & { kind: 'connection' })
  | (ResultPageOptions & { kind: 'result' })
  | { kind: 'invitation'; title: string; extensionUrl: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function scriptValue(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
}

function supabaseOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('Supabase URL must use HTTPS.');
    return url.origin;
  } catch {
    throw new Error('Supabase URL is invalid.');
  }
}

export function interactivePageCsp(supabaseUrl = ''): string {
  const connectSource = supabaseUrl ? ` 'self' ${supabaseOrigin(supabaseUrl)}` : " 'self'";
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `connect-src${connectSource}`,
    "font-src 'self'",
    "img-src 'self' data:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'"
  ].join('; ');
}

export function captchaPageCsp(): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    'connect-src https://challenges.cloudflare.com',
    'frame-src https://challenges.cloudflare.com',
    "script-src 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'unsafe-inline'"
  ].join('; ');
}

function hostedPage(config: HostedPageConfig): string {
  const serialized = escapeHtml(JSON.stringify(config));
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><link rel="icon" href="data:,"><title>${escapeHtml(config.title)}</title><script src="/security/theme-init.js"></script><link rel="stylesheet" href="/security/hosted.css"><script src="/security/hosted.js" defer></script></head>
<body><div id="root" data-page-config="${serialized}"></div></body></html>`;
}

export function captchaPage(siteKey: string): string {
  const config = scriptValue({ siteKey });
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confirmação de segurança</title><style>html,body{margin:0;background:transparent}#turnstile{min-height:65px}</style></head>
<body><div id="turnstile"></div><script>
const config=${config};
const params=new URLSearchParams(location.search);
const nonce=params.get('nonce')||'';
const parentOrigin=params.get('parentOrigin')||'';
const validParent=/^chrome-extension:\\/\\/[a-p]{32}$/.test(parentOrigin)||parentOrigin===location.origin;
function publish(status,token){if(validParent&&nonce)window.parent.postMessage({type:'onframe:turnstile',status,nonce,token:token||''},parentOrigin);}
let widgetId=null;
window.addEventListener('message',(event)=>{if(!validParent||event.origin!==parentOrigin||event.source!==window.parent||event.data?.type!=='onframe:turnstile:execute'||event.data.nonce!==nonce||widgetId===null)return;window.turnstile.execute(widgetId);});
window.onTurnstileLoad=()=>{if(!validParent||!nonce||!window.turnstile)return;widgetId=window.turnstile.render('#turnstile',{sitekey:config.siteKey,theme:'light',appearance:'interaction-only',execution:'execute',callback:(token)=>publish('success',token),'expired-callback':()=>publish('expired'),'error-callback':()=>publish('error'),'before-interactive-callback':()=>publish('interaction'),'after-interactive-callback':()=>publish('idle')});publish('ready');};
</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit" async defer></script></body></html>`;
}

export function connectionPage(options: ConnectionPageOptions): string {
  return hostedPage({ kind: 'connection', ...options });
}

export function resultPage(options: ResultPageOptions): string {
  return hostedPage({ kind: 'result', ...options });
}

export function invitationPage(extensionUrl: string): string {
  return hostedPage({
    kind: 'invitation',
    title: 'Convite para o OnFrame',
    extensionUrl
  });
}
