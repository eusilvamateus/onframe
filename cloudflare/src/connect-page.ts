const BRAND_LOGO_URL = 'https://onblide-design-system.vercel.app/img/marca/png/onblide-horizontal-primary.png';

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

export function interactivePageCsp(supabaseUrl: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `connect-src 'self' ${supabaseOrigin(supabaseUrl)}`,
    'img-src data: https://onblide-design-system.vercel.app',
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'"
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

function pageStyles(): string {
  return `
    :root { --ob-blue:#0a4ee4; --ob-blue-100:#e0eaff; --ob-green:#779e3d; --ob-green-100:#ecf3da; --ob-red:#d23838; --ob-red-100:#fde2e2; --ob-cream:#f2f0e8; --ob-ink:#545454; --ob-ink-strong:#2a2a2a; --ob-ink-soft:#7a7a7a; --ob-ink-mute:#a8a8a8; --ob-line:#ececec; --ob-surface:#fff; --ob-border:var(--ob-line); --ob-focus-ring:rgba(10,78,228,.32); --ob-font:Poppins,system-ui,-apple-system,"Segoe UI",sans-serif; --ob-font-serif:"Playfair Display",Georgia,serif; --ob-font-mono:"JetBrains Mono",ui-monospace,monospace; --ob-s-2:8px; --ob-s-3:12px; --ob-s-4:16px; --ob-s-5:24px; --ob-s-6:32px; --ob-s-7:48px; --ob-r-sm:8px; --ob-r-md:12px; --ob-shadow-md:0 4px 12px rgba(20,20,20,.06),0 1px 3px rgba(20,20,20,.04); }
    * { box-sizing:border-box; }
    html,body { min-height:100%; margin:0; background:var(--ob-surface); color:var(--ob-ink); font-family:var(--ob-font); }
    .page { display:grid; grid-template-rows:auto minmax(0,1fr) auto; min-height:100vh; }
    .topbar { display:flex; align-items:center; justify-content:space-between; min-height:68px; padding:var(--ob-s-4) max(var(--ob-s-5),calc((100vw - 1120px)/2)); border-bottom:1px solid var(--ob-border); }
    .brand { display:inline-flex; align-items:center; gap:var(--ob-s-3); color:var(--ob-ink-strong); text-decoration:none; }
    .brand img { display:block; width:auto; height:28px; }
    .brand-separator { width:1px; height:20px; background:var(--ob-border); }
    .brand-product,.top-note,.footer { color:var(--ob-ink-mute); font-family:var(--ob-font-mono); font-size:12px; font-weight:500; letter-spacing:.04em; }
    .brand-product { font-weight:600; text-transform:uppercase; }
    .content { display:grid; place-items:center; padding:var(--ob-s-7) var(--ob-s-5); }
    .auth-card { width:min(100%,472px); padding:20px; border-radius:var(--ob-r-md); background:var(--ob-surface); box-shadow:var(--ob-shadow-md); }
    .eyebrow { margin:0 0 var(--ob-s-3); color:var(--ob-blue); font-family:var(--ob-font-mono); font-size:12px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; }
    h1 { margin:0; color:var(--ob-ink-strong); font-size:28px; font-weight:600; line-height:1.2; }
    h1 em { font-family:var(--ob-font-serif); font-style:italic; font-weight:400; }
    .description { margin:var(--ob-s-3) 0 0; color:var(--ob-ink-soft); font-size:14px; line-height:1.45; }
    .alert { display:flex; gap:12px; margin-top:var(--ob-s-5); padding:14px 16px; border:1px solid color-mix(in srgb,var(--ob-green) 28%,transparent); border-radius:var(--ob-r-md); background:var(--ob-green-100); color:var(--ob-ink); font-size:14px; line-height:1.45; }
    .alert[data-tone="danger"] { border-color:color-mix(in srgb,var(--ob-red) 28%,transparent); background:var(--ob-red-100); }
    .alert[hidden],.reset-form[hidden] { display:none; }
    .reset-form { display:grid; gap:var(--ob-s-3); margin-top:var(--ob-s-5); }
    label { color:var(--ob-ink-strong); font-size:12px; font-weight:600; }
    input { width:100%; min-height:44px; margin-top:6px; padding:0 14px; border:1.5px solid var(--ob-border); border-radius:var(--ob-r-sm); color:var(--ob-ink-strong); font:500 14px/1.2 var(--ob-font); }
    input:focus { border-color:var(--ob-blue); box-shadow:0 0 0 4px var(--ob-focus-ring); outline:0; }
    button { width:max-content; padding:10px 18px; border:0; border-radius:var(--ob-r-sm); background:var(--ob-blue); color:#fff; cursor:pointer; font:600 14px/1.2 var(--ob-font); }
    button:disabled { cursor:not-allowed; opacity:.5; }
    .footer { padding:var(--ob-s-4) var(--ob-s-5) var(--ob-s-5); text-align:center; }
    @media (max-width:480px) { .topbar { min-height:60px; padding:var(--ob-s-3) var(--ob-s-4); } .top-note { display:none; } .content { align-items:start; padding:var(--ob-s-5) var(--ob-s-4); } }
  `;
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
const validParent=/^chrome-extension:\\\/\\\/[a-p]{32}$/.test(parentOrigin);
function publish(status,token){if(validParent&&nonce)window.parent.postMessage({type:'onframe:turnstile',status,nonce,token:token||''},parentOrigin);}
window.onTurnstileLoad=()=>{if(!validParent||!nonce||!window.turnstile)return;window.turnstile.render('#turnstile',{sitekey:config.siteKey,theme:'light',callback:(token)=>publish('success',token),'expired-callback':()=>publish('expired'),'error-callback':()=>publish('error')});};
</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit" async defer></script></body></html>`;
}

export function connectionPage(options: ConnectionPageOptions): string {
  const config = scriptValue({
    supabaseUrl: options.supabaseUrl,
    supabasePublishableKey: options.supabasePublishableKey
  });
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><link rel="icon" href="data:,"><title>${escapeHtml(options.title)}</title><style>${pageStyles()}</style></head>
<body><div class="page"><header class="topbar"><a class="brand" href="/connect" aria-label="OnFrame"><img src="${BRAND_LOGO_URL}" alt="Onblide"><span class="brand-separator" aria-hidden="true"></span><span class="brand-product">OnFrame</span></a><span class="top-note">ACESSO SEGURO</span></header><main class="content"><section class="auth-card" aria-live="polite"><p class="eyebrow">${escapeHtml(options.eyebrow)}</p><h1>${options.heading}</h1><p class="description">${escapeHtml(options.description)}</p><div class="alert" id="feedback" hidden></div><form class="reset-form" id="reset-form" hidden><label for="password">Nova senha<input id="password" type="password" autocomplete="new-password" placeholder="Crie uma nova senha"></label><label for="confirmation">Confirme a nova senha<input id="confirmation" type="password" autocomplete="new-password" placeholder="Repita a nova senha"></label><button id="reset-submit" type="submit">Atualizar senha</button></form></section></main><footer class="footer">ONBLIDE · ONFRAME</footer></div><script>
const config=${config};const flow=new URL(location.href).searchParams.get('flow')||'';const hash=new URLSearchParams(location.hash.slice(1));const accessToken=hash.get('access_token')||'';const type=hash.get('type')||'';const feedback=document.getElementById('feedback');const resetForm=document.getElementById('reset-form');const password=document.getElementById('password');const confirmation=document.getElementById('confirmation');
function message(text,tone){feedback.textContent=text;feedback.dataset.tone=tone||'success';feedback.hidden=false;}
function clearHash(){history.replaceState(null,document.title,location.pathname+location.search);}
async function complete(){const response=await fetch('/v1/extension-auth-flows/'+encodeURIComponent(flow),{method:'POST',headers:{authorization:'Bearer '+accessToken}});if(!response.ok)throw new Error('flow');clearHash();message('Acesso confirmado. Volte à extensão para continuar.','success');}
async function reset(event){event.preventDefault();if(!password.value){password.focus();message('Crie uma nova senha.','danger');return;}if(password.value!==confirmation.value){confirmation.focus();message('As senhas não coincidem.','danger');return;}const button=document.getElementById('reset-submit');button.disabled=true;try{const response=await fetch(config.supabaseUrl+'/auth/v1/user',{method:'PUT',headers:{apikey:config.supabasePublishableKey,authorization:'Bearer '+accessToken,'content-type':'application/json'},body:JSON.stringify({password:password.value})});if(!response.ok)throw new Error('reset');await complete();resetForm.hidden=true;}catch(_){message('Não foi possível atualizar a senha. Solicite um novo link.','danger');}finally{button.disabled=false;}}
resetForm.addEventListener('submit',reset);if(!flow||!accessToken){message('Abra a extensão OnFrame para iniciar o acesso.','danger');}else if(type==='recovery'){clearHash();resetForm.hidden=false;password.focus();}else{complete().catch(()=>message('Não foi possível concluir o acesso. Solicite um novo link pela extensão.','danger'));}
</script></body></html>`;
}

export function resultPage(options: ResultPageOptions): string {
  const tone = options.tone === 'success' ? 'success' : 'danger';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(options.title)}</title><style>${pageStyles()}</style></head>
<body><div class="page"><header class="topbar"><a class="brand" href="/connect" aria-label="OnFrame"><img src="${BRAND_LOGO_URL}" alt="Onblide"><span class="brand-separator" aria-hidden="true"></span><span class="brand-product">OnFrame</span></a></header><main class="content"><section class="auth-card"><p class="eyebrow">${escapeHtml(options.eyebrow)}</p><h1>${escapeHtml(options.heading)}</h1><div class="alert" data-tone="${tone === 'danger' ? 'danger' : 'success'}">${escapeHtml(options.message)}</div></section></main><footer class="footer">ONBLIDE · ONFRAME</footer></div></body></html>`;
}
