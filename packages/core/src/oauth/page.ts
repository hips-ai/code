// Branded HTML pages for local OAuth callback servers.
//
// These are served by the loopback HTTP servers that finish an OAuth exchange
// (MCP, Codex/ChatGPT, xAI, Snowflake, DigitalOcean, ...). The functions return
// a fully self-contained HTML string with no external assets, so they work
// offline and drop into any transport (`res.end(...)`, Effect `response.end`,
// etc.).
//
// The visual language mirrors the HIPS Code app: the design tokens are a curated
// subset of the OC-2 semantic tokens in `packages/ui/src/styles/theme.css`, and
// the lockup is the same geometry as `packages/ui/src/components/logo.tsx`.
// Keep this file in sync with those sources when the brand changes.

export interface CallbackPageOptions {
  /** Friendly integration name shown as a subtitle, e.g. "xAI", "Snowflake", "MCP". */
  provider?: string
  /** Attempt to close the window shortly after success. Defaults to true. */
  autoClose?: boolean
}

export function success(options?: CallbackPageOptions) {
  const provider = options?.provider
  return renderDocument({
    title: "Authorization successful",
    body: renderCard({
      status: "success",
      headline: "Authorization successful",
      message: provider ? `HIPS Code is now connected to ${escapeHtml(provider)}.` : "HIPS Code is now authorized.",
      footnote: "You can close this window.",
    }),
    script: options?.autoClose === false ? undefined : AUTO_CLOSE_SCRIPT,
  })
}

export function error(detail: string, options?: CallbackPageOptions) {
  const provider = options?.provider
  return renderDocument({
    title: "Authorization failed",
    body: renderCard({
      status: "error",
      headline: "Authorization failed",
      message: provider
        ? `HIPS Code couldn't finish connecting to ${escapeHtml(provider)}.`
        : "HIPS Code couldn't complete authorization.",
      detail,
      footnote: "Close this window and try again from HIPS Code.",
    }),
  })
}

export interface BootstrapOptions {
  /** Same-origin path the in-browser script POSTs the parsed callback to. */
  tokenPath: string
  provider?: string
}

// For flows where the credential arrives in the URL fragment (implicit grant),
// the browser must relay it back to the loopback server. This renders a pending
// page whose script reads the fragment, POSTs it to `tokenPath`, then resolves
// to the success or error state in place.
export function bootstrap(options: BootstrapOptions) {
  return renderDocument({
    title: "Finishing sign-in",
    body: renderCard({
      status: "pending",
      headline: "Finishing sign-in",
      message: options.provider
        ? `Completing your ${escapeHtml(options.provider)} authorization.`
        : "Completing authorization.",
      footnote: "You can close this window once sign-in finishes.",
    }),
    script: bootstrapScript(options),
  })
}

export * as OauthCallbackPage from "./page.js"

type Status = "pending" | "success" | "error"

function renderCard(input: { status: Status; headline: string; message: string; detail?: string; footnote: string }) {
  const detail = input.detail?.trim()
  return `<main class="card" id="oc-card" data-status="${input.status}" role="status" aria-live="polite">
      <div class="brand">${LOCKUP}</div>
      <div class="status" aria-hidden="true">
        <span class="icon icon-pending">${ICON_SPINNER}</span>
        <span class="icon icon-success">${ICON_CHECK}</span>
        <span class="icon icon-error">${ICON_CROSS}</span>
      </div>
      <h1 class="headline" id="oc-headline">${escapeHtml(input.headline)}</h1>
      <p class="message" id="oc-message">${input.message}</p>
      <pre class="detail" id="oc-detail"${detail ? "" : " hidden"}>${detail ? escapeHtml(detail) : ""}</pre>
      <p class="footnote" id="oc-footnote">${escapeHtml(input.footnote)}</p>
    </main>`
}

function renderDocument(input: { title: string; body: string; script?: string }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${escapeHtml(input.title)} · HIPS Code</title>
    <style>${STYLES}</style>
  </head>
  <body>
    ${input.body}${input.script ? `\n    <script>${input.script}</script>` : ""}
  </body>
</html>`
}

const AUTO_CLOSE_SCRIPT = `setTimeout(function(){try{window.close()}catch(e){}},2500)`

function bootstrapScript(options: BootstrapOptions) {
  return `var PROVIDER=${scriptString(options.provider ?? "")};
var TOKEN_URL=new URL(${scriptString(options.tokenPath)},window.location.origin).href;
(function(){
  var card=document.getElementById("oc-card"),headline=document.getElementById("oc-headline"),message=document.getElementById("oc-message"),detail=document.getElementById("oc-detail"),footnote=document.getElementById("oc-footnote");
  function fail(text){card.dataset.status="error";headline.textContent="Authorization failed";message.textContent=PROVIDER?("HIPS Code couldn't finish connecting to "+PROVIDER+"."):"HIPS Code couldn't complete authorization.";if(text){detail.textContent=text;detail.hidden=false}footnote.textContent="Close this window and try again from HIPS Code."}
  function ok(){card.dataset.status="success";headline.textContent="Authorization successful";message.textContent=PROVIDER?("HIPS Code is now connected to "+PROVIDER+"."):"HIPS Code is now authorized.";detail.hidden=true;footnote.textContent="You can close this window.";setTimeout(function(){try{window.close()}catch(e){}},2500)}
  try{
    var hash=new URLSearchParams((window.location.hash||"").slice(1));
    var search=new URLSearchParams(window.location.search||"");
    var err=hash.get("error")||search.get("error");
    var errDescription=hash.get("error_description")||search.get("error_description");
    var body=err?{error:err,error_description:errDescription||""}:{access_token:hash.get("access_token")||"",expires_in:hash.get("expires_in")||"0",state:hash.get("state")||""};
    fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(res){
      if(!res.ok)return res.text().catch(function(){return""}).then(function(t){throw new Error(t||("callback failed ("+res.status+")"))});
      if(err){fail(errDescription||err);return}
      ok();
    }).catch(function(e){fail(String(e&&e.message?e.message:e))});
  }catch(e){fail(String(e&&e.message?e.message:e))}
})()`
}

function scriptString(value: string) {
  return JSON.stringify(value).replaceAll("<", "\\u003c")
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

// Curated subset of OC-2 tokens (packages/ui/src/styles/theme.css). Default is
// light; dark applies via prefers-color-scheme. The [data-theme] selectors let a
// host force a scheme without changing the default.
const LIGHT_VARS = `
    --oc-bg: #f8f8f8;
    --oc-card: #fcfcfc;
    --oc-text-strong: #171717;
    --oc-text-base: #6f6f6f;
    --oc-text-weak: #8f8f8f;
    --oc-border-weak: #e5e5e5;
    --oc-icon-strong: #171717;
    --oc-icon-base: #8f8f8f;
    --oc-icon-weak: #dbdbdb;
    --oc-hips-letters: #007DBB;
    --oc-success: #2dba26;
    --oc-error: #ed4831;
    --oc-detail-bg: #fff8f6;
    --oc-detail-border: #fdc3b7;
    --oc-shadow: 0 16px 48px -6px rgba(0,0,0,.10), 0 6px 12px -2px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.06);`

const DARK_VARS = `
    --oc-bg: #101010;
    --oc-card: #161616;
    --oc-text-strong: rgba(255,255,255,.936);
    --oc-text-base: rgba(255,255,255,.618);
    --oc-text-weak: rgba(255,255,255,.422);
    --oc-border-weak: #282828;
    --oc-icon-strong: #ededed;
    --oc-icon-base: #7e7e7e;
    --oc-icon-weak: #343434;
    --oc-hips-letters: #0089DD;
    --oc-success: #12c905;
    --oc-error: #fc533a;
    --oc-detail-bg: #28110c;
    --oc-detail-border: #6a1206;
    --oc-shadow: 0 16px 48px -6px rgba(0,0,0,.55), 0 6px 12px -2px rgba(0,0,0,.35), 0 1px 2px rgba(0,0,0,.4);`

const STYLES = `
  :root { color-scheme: light dark;${LIGHT_VARS}
    --oc-font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --oc-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${DARK_VARS} } }
  :root[data-theme="dark"] {${DARK_VARS} }
  :root[data-theme="light"] {${LIGHT_VARS} }

  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--oc-bg);
    color: var(--oc-text-base);
    font-family: var(--oc-font-sans);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .card {
    width: min(100%, 28rem);
    padding: 2.25rem 2rem 1.75rem;
    background: var(--oc-card);
    border: 1px solid var(--oc-border-weak);
    border-radius: 14px;
    box-shadow: var(--oc-shadow);
    text-align: center;
  }
  .brand { display: flex; justify-content: center; margin-bottom: 1.75rem; }
  .brand svg { height: 24px; width: auto; }
  .status { display: flex; justify-content: center; margin-bottom: 1.125rem; }
  .icon { display: none; line-height: 0; }
  .icon svg { display: block; }
  .card[data-status="pending"] .icon-pending,
  .card[data-status="success"] .icon-success,
  .card[data-status="error"] .icon-error { display: block; }
  .icon-success { color: var(--oc-success); }
  .icon-error { color: var(--oc-error); }
  .icon-pending { color: var(--oc-text-weak); }
  .headline { margin: 0; font-size: 1.1875rem; font-weight: 500; line-height: 1.3; letter-spacing: -0.012em; color: var(--oc-text-strong); }
  .message { margin: 0.5rem 0 0; font-size: 0.9375rem; color: var(--oc-text-base); }
  .detail {
    margin: 1.25rem 0 0;
    padding: 0.75rem 0.875rem;
    text-align: left;
    font-family: var(--oc-font-mono);
    font-size: 0.8125rem;
    line-height: 1.55;
    color: var(--oc-text-strong);
    background: var(--oc-detail-bg);
    border: 1px solid var(--oc-detail-border);
    border-radius: 8px;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 9.5rem;
    overflow: auto;
  }
  .detail[hidden] { display: none; }
  .footnote { margin: 1.5rem 0 0; font-size: 0.8125rem; color: var(--oc-text-weak); }
  .spinner { animation: oc-spin 0.8s linear infinite; transform-origin: center; }
  @keyframes oc-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
`

// HIPS Code lockup: the same geometry as `LockupShapes` in packages/ui/src/components/logo.tsx.
const LOCKUP = `<svg class="wordmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 129" fill="none" aria-label="HIPS Code" role="img">
        <g transform="translate(-20.567 -16.138) scale(1.7139)" shape-rendering="crispEdges">
          <path d="M47 10H51V11H53V13H54V17H53V19H51V20H47V19H45V17H44V13H45V11H47Z" fill="#81BD41" />
          <path d="M54 22H68V24H70V26H72V28H74V42H76V53H78V55H80V57H82V59H85V65H83V67H78V65H76V63H74V67H72V69H70V71H68V73H66V75H62V81H60V84H56V81H54V78H52V75H45V78H43V81H41V84H37V81H35V75H33V73H31V71H29V69H27V67H25V63H23V65H21V67H14V65H12V59H14V57H16V55H18V53H20V40H22V38H24V36H26V34H28V32H30V30H32V28H34V26H54Z" fill="#00547E" />
          <path d="M54 22H68V24H70V26H72V28H74V42H76V53H78V55H80V57H82V59H85V63H78V61H76V59H74V67H72V69H70V71H68V73H39V71H37V69H35V67H33V65H31V46H29V36H31V34H33V32H35V30H37V26H54ZM18 53H22V55H24V59H22V61H20V63H12V59H14V57H16V55H18ZM35 75H43V79H41V81H37V79H35ZM54 75H62V79H60V81H56V79H54Z" fill="#007DBB" />
          <path d="M40 46H45V56H40ZM58 46H63V56H58Z" fill="#EDF3F5" />
        </g>
        <g transform="translate(142.163 -13.892) scale(1.182)">
          <path d="M81.3,96.7c0.1,0.4-0.2,0.8-0.6,0.8c-0.1,0-0.1,0-0.2,0h-12c-0.2,0-0.4-0.1-0.5-0.2c-0.2-0.1-0.3-0.4-0.2-0.6 v-59c0-0.2,0.1-0.4,0.2-0.6c0.1-0.2,0.3-0.3,0.5-0.2h12c0.4-0.1,0.8,0.2,0.8,0.6c0,0.1,0,0.1,0,0.2L81.3,96.7z M136,67.1 c0-10.1-8.1-18.2-18.2-18.3c-4.9,0-9.5,1.9-12.9,5.4c-7.1,7.1-7.1,18.6,0,25.8c7.1,7.1,18.7,7.1,25.8,0 C134.1,76.6,136,71.9,136,67.1L136,67.1z M117.8,35.3c8.4-0.1,16.6,3.3,22.4,9.3c6.1,5.9,9.4,14,9.3,22.4c0.1,8.4-3.3,16.6-9.3,22.4 c-5.9,6.1-14,9.4-22.4,9.3c-6.1,0.1-12.1-1.9-16.9-5.6v26.1c0,0.4-0.2,0.8-0.6,0.8c-0.1,0-0.1,0-0.2,0h-12c-0.2,0.1-0.5,0-0.7-0.2 c-0.2-0.1-0.3-0.4-0.2-0.6V65.6c-0.3-6.6,1.7-13.1,5.7-18.3C98.8,39.6,108.1,35.2,117.8,35.3z M153.4,79.8c1.4,1,2.8,2,4.4,2.7 c4,2,8.3,3,12.7,2.9c3,0.2,5.9-0.3,8.6-1.5c0.9-0.6,1.7-1.5,2.1-2.5c0.4-1,0.4-2.1,0-3.1c-0.7-1.4-2-2.6-3.5-3.1l-15.7-6.9 c-5.6-2-9.8-6.9-10.9-12.8c-0.5-3.1-0.1-6.2,1.2-9c0.2-0.3,0.4-0.8,0.7-1.4c1.2-2.1,2.8-3.9,4.7-5.3c3.6-2.4,7.7-3.9,12-4.2 c1.7-0.2,3.3-0.3,5-0.3c5.5,0,11,1,16.1,2.9c0.3,0.1,0.6,0.4,0.5,0.7V52c0,0.3-0.2,0.6-0.4,0.7c-0.2,0.1-0.5,0.1-0.8,0 c-1-0.5-2-1-3-1.4c-4-1.6-8.2-2.5-12.5-2.5c-1.2,0-2.5,0-3.7,0.2c-1.9,0.1-3.7,0.7-5.4,1.6c-1.1,0.6-1.6,1.9-1.1,3.1 c0.4,0.8,1,1.4,1.9,1.6l16.9,7.5c4.6,1.8,8.3,5.4,10.2,10c1.6,3.6,1.9,7.6,0.9,11.4c-1,3.8-3.1,7.2-6.2,9.6c-2.1,1.7-4.6,3-7.2,3.8 c-1.8,0.5-3.7,0.8-5.5,1c-1.7,0.2-3.3,0.2-5,0.2c-4.8,0-9.6-0.9-14.1-2.5c-2.7-0.8-4.4-3.3-4.3-6.1v-10c0-0.3,0.2-0.6,0.4-0.7 C152.9,79.6,153.1,79.6,153.4,79.8z M7.6,14.9c-0.1-0.4,0.2-0.7,0.6-0.8c0.1,0,0.1,0,0.2,0h12c0.4-0.1,0.8,0.2,0.8,0.6 c0,0.1,0,0.1,0,0.2v23.8c4.5-2.3,9.5-3.4,14.6-3.3c6.3-0.2,12.5,1.7,17.7,5.3c5.3,3.6,8.4,9.8,8.2,16.2v39.9 c0.1,0.4-0.2,0.8-0.6,0.8c-0.1,0-0.1,0-0.2,0h-8c-2.6,0-4.8-2.1-4.8-4.8v-36c0.1-2-0.8-4-2.5-5.2c-3.2-2-7-3-10.8-2.7 c-3.8-0.3-7.6,0.7-10.8,2.7c-1.7,1.2-2.6,3.2-2.5,5.2v39.9c0.1,0.4-0.2,0.8-0.6,0.8c-0.1,0-0.1,0-0.2,0H8.4 c-0.4,0.1-0.8-0.2-0.8-0.6c0-0.1,0-0.2,0-0.2V14.9z" fill="var(--oc-hips-letters)" />
          <path d="M74.5,12.7c2.3,0,4.4,0.9,6,2.5c1.6,1.6,2.5,3.7,2.5,6c0,2.2-0.9,4.4-2.5,6c-3.3,3.3-8.6,3.3-11.8,0.1 c0,0,0,0-0.1-0.1c-1.6-1.6-2.5-3.7-2.5-6c0-2.3,0.9-4.4,2.5-6C70.1,13.5,72.3,12.6,74.5,12.7" fill="#81BD41" />
        </g>
        <path d="M453.71 102.95Q440.04 102.95 429.75 96.41Q419.46 89.87 413.72 78.36Q407.98 66.84 407.98 51.97Q407.98 36.97 413.69 25.46Q419.39 13.94 429.71 7.4Q440.04 0.87 453.71 0.87Q461.47 0.87 468.28 3.19Q475.08 5.51 480.49 9.93Q485.9 14.34 489.48 20.51Q493.07 26.69 494.46 34.45H482.25Q481.05 29.07 478.47 24.89Q475.88 20.71 472.16 17.82Q468.44 14.94 463.76 13.48Q459.09 12.02 453.71 12.02Q443.29 12.02 435.72 17.09Q428.15 22.17 424.04 31.17Q419.92 40.16 419.92 51.97Q419.92 63.72 424.04 72.68Q428.15 81.64 435.72 86.72Q443.29 91.8 453.71 91.8Q459.09 91.8 463.73 90.34Q468.38 88.88 472.09 86.02Q475.81 83.17 478.43 79.02Q481.05 74.87 482.32 69.5H494.46Q493.13 77.2 489.52 83.37Q485.9 89.54 480.49 93.92Q475.08 98.3 468.28 100.63Q461.47 102.95 453.71 102.95ZM537.47 102.95Q527.78 102.95 520.45 98.27Q513.11 93.59 509.03 85.36Q504.95 77.13 504.95 66.44Q504.95 55.69 509.03 47.39Q513.11 39.1 520.45 34.38Q527.78 29.67 537.47 29.67Q547.23 29.67 554.53 34.38Q561.83 39.1 565.91 47.39Q570 55.69 570 66.44Q570 77.13 565.91 85.36Q561.83 93.59 554.53 98.27Q547.23 102.95 537.47 102.95ZM537.47 92.73Q544.11 92.73 548.82 89.47Q553.53 86.22 556.06 80.28Q558.58 74.34 558.58 66.44Q558.58 58.41 556.06 52.47Q553.53 46.53 548.82 43.21Q544.11 39.89 537.47 39.89Q530.9 39.89 526.16 43.18Q521.41 46.46 518.89 52.44Q516.37 58.41 516.37 66.44Q516.37 74.41 518.89 80.32Q521.41 86.22 526.12 89.47Q530.83 92.73 537.47 92.73ZM609.95 102.68Q600.86 102.68 593.99 98.07Q587.12 93.46 583.34 85.26Q579.55 77.06 579.55 66.31Q579.55 55.49 583.34 47.29Q587.12 39.1 593.99 34.52Q600.86 29.94 609.95 29.94Q614.53 29.94 618.68 31.23Q622.83 32.53 626.21 35.11Q629.6 37.7 631.86 41.62H631.99V2.46H643.27V101.36H632.25V90.74H632.12Q629.6 94.78 626.15 97.44Q622.7 100.09 618.61 101.39Q614.53 102.68 609.95 102.68ZM611.68 92.53Q618.18 92.53 622.96 89.28Q627.74 86.02 630.33 80.12Q632.92 74.21 632.92 66.31Q632.92 58.35 630.33 52.44Q627.74 46.53 622.96 43.28Q618.18 40.03 611.68 40.03Q605.64 40.03 600.96 43.01Q596.28 46 593.62 51.84Q590.97 57.68 590.97 66.31Q590.97 74.87 593.62 80.71Q596.28 86.55 600.96 89.54Q605.64 92.53 611.68 92.53ZM688.94 102.95Q678.65 102.95 671.38 98.24Q664.11 93.52 660.26 85.26Q656.41 77 656.41 66.44Q656.41 55.76 660.46 47.46Q664.51 39.16 671.68 34.42Q678.85 29.67 688.14 29.67Q695.44 29.67 701.32 32.33Q707.19 34.98 711.37 39.89Q715.55 44.81 717.78 51.54Q720 58.28 720 66.44V69.56H667.56Q667.83 75.87 670.09 80.85Q672.54 86.42 677.32 89.57Q682.1 92.73 688.94 92.73Q693.92 92.73 697.7 91.17Q701.48 89.61 703.97 86.82Q706.46 84.03 707.52 80.38H718.81Q717.48 87.09 713.3 92.16Q709.11 97.24 702.84 100.09Q696.57 102.95 688.94 102.95ZM667.7 59.87H708.72Q708.25 54.83 706.33 50.78Q703.74 45.54 699.09 42.65Q694.45 39.76 688.14 39.76Q681.9 39.76 677.29 42.65Q672.68 45.54 670.15 50.78Q668.16 54.83 667.7 59.87Z" fill="var(--oc-icon-strong)" />
      </svg>`

const ICON_CHECK = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.4 2.4 4.6-5.4" /></svg>`

const ICON_CROSS = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></svg>`

const ICON_SPINNER = `<svg class="spinner" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity="0.2" /><path d="M21 12a9 9 0 0 0-9-9" /></svg>`
