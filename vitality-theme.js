/* ============================================================================
 * vitality-theme.js  —  the entire "Vitality" look in ONE drop-in file.
 *
 *   <script src="vitality-theme.js"></script>
 *
 * Adding that one line to any static HTML page injects:
 *   1. Google Fonts (Inter · Newsreader serif · JetBrains Mono)
 *   2. A <style> with the Vitality design tokens + base look + glass cards +
 *      mint buttons/inputs + grain/aurora/mountains/particles CSS
 *   3. The backdrop DOM (#vt-backdrop — aurora · mountains · mist · particles)
 *      behind your content, plus the tiny JS that spawns drifting particles.
 *
 * Design sourced from this repo's canonical Vitality files:
 *   tokens / grain ............ app/globals.css
 *   aurora · mountains · mist · particles ... background/mountains-background.html
 *
 * SAFETY CONTRACT
 *   - Vanilla JS, no dependencies, no build step, runs once (idempotent).
 *   - Only ADDS styling + a backdrop layer. Never touches your page's JS,
 *     data, IDs, event handlers, or markup.
 *   - Element re-styles (cards, buttons, inputs, headings, links) use :where()
 *     so they are ZERO-specificity defaults — ANY rule your page already has
 *     wins. Naked pages get the full look; styled pages keep their layout.
 *   - The backdrop is position:fixed; z-index:-1; pointer-events:none, so it
 *     sits behind everything and can never intercept a click.
 *   - Opt out per element with [data-no-vitality] (see bottom of the CSS).
 * ========================================================================== */
(function () {
  'use strict';

  if (window.__VITALITY_THEME__) return;       // run once even if included twice
  window.__VITALITY_THEME__ = '1.0';

  var head = function () { return document.head || document.documentElement; };

  /* ---- 1. Google Fonts ---------------------------------------------------- */
  var FONTS_HREF =
    'https://fonts.googleapis.com/css2?' +
    'family=Inter:wght@400;500;600;700&' +
    'family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&' +
    'family=JetBrains+Mono:wght@400;500&display=swap';

  function addFonts() {
    if (document.getElementById('vt-fonts')) return;
    var pre1 = document.createElement('link');
    pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
    var pre2 = document.createElement('link');
    pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com';
    pre2.crossOrigin = 'anonymous';
    var link = document.createElement('link');
    link.id = 'vt-fonts'; link.rel = 'stylesheet'; link.href = FONTS_HREF;
    head().appendChild(pre1); head().appendChild(pre2); head().appendChild(link);
  }

  /* ---- 2. The stylesheet -------------------------------------------------- */
  var GRAIN =
    "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' " +
    "xmlns='http://www.w3.org/2000/svg'><filter id='vtn'><feTurbulence " +
    "type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>" +
    "</filter><rect width='100%25' height='100%25' filter='url(%23vtn)'/></svg>\")";

  var CSS = [
    /* ----- design tokens (verbatim from app/globals.css) ----- */
    ':root{',
    '--bg:#000000;--bg-elevated:#0a0a0a;--fg:#ffffff;',
    '--mint:#6EE7B7;--mint-hover:#5dd6a6;--mint-deep:#1f4d3d;',
    '--mint-glow:rgba(110,231,183,.4);--mint-ink:#042a1c;--mint-soft:#a7f3d0;',
    '--amber:#F59E0B;--amber-warm:#d97706;--wine:#7c2d12;--red:#EF4444;',
    '--muted:rgba(255,255,255,.5);--muted-strong:rgba(255,255,255,.7);',
    '--border:rgba(255,255,255,.08);--border-strong:rgba(255,255,255,.16);',
    '--card:rgba(255,255,255,.02);--card-elevated:rgba(255,255,255,.04);',
    '--glass-shadow:0 1px 0 0 rgba(255,255,255,.06) inset,0 12px 40px rgba(0,0,0,.45),0 1px 2px rgba(0,0,0,.25);',
    '--space-1:.25rem;--space-2:.5rem;--space-3:.75rem;--space-4:1rem;--space-5:1.25rem;',
    '--space-6:1.5rem;--space-8:2rem;--space-10:2.5rem;--space-12:3rem;--space-16:4rem;',
    '--radius-sm:6px;--radius-md:8px;--radius-lg:12px;--radius-pill:999px;',
    '--text-xs:.75rem;--text-sm:.875rem;--text-base:1rem;--text-lg:1.125rem;',
    '--text-xl:1.375rem;--text-2xl:1.75rem;--text-3xl:2.5rem;',
    '--ease:cubic-bezier(.2,.8,.2,1);--ease-premium:cubic-bezier(.16,1,.3,1);',
    '--ease-out-soft:cubic-bezier(.32,.72,0,1);',
    '--duration-fast:120ms;--duration:180ms;--duration-lift:480ms;',
    /* font tokens — also re-declare the names globals.css uses so its utility
       classes resolve if a ported page relies on them */
    "--font-inter:'Inter';--font-serif:'Newsreader';",
    "--vt-sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;",
    "--vt-serif:'Newsreader','Times New Roman',Georgia,serif;",
    "--vt-mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace;",
    'color-scheme:dark;}',

    /* ----- global atmosphere (normal specificity; the Vitality "feel") ----- */
    'html{background:var(--bg);}',
    'body{background:transparent;color:var(--fg);font-family:var(--vt-sans);',
    'font-size:var(--text-base);line-height:1.5;-webkit-font-smoothing:antialiased;',
    '-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;accent-color:var(--mint);}',
    '::selection{background:rgba(110,231,183,.25);}',
    '::-moz-selection{background:rgba(110,231,183,.25);}',
    'input,textarea,select,[contenteditable]{caret-color:var(--mint);}',
    /* thin mint scrollbars */
    '*{scrollbar-width:thin;scrollbar-color:rgba(110,231,183,.3) transparent;}',
    '::-webkit-scrollbar{width:10px;height:10px;}',
    '::-webkit-scrollbar-track{background:transparent;}',
    '::-webkit-scrollbar-thumb{background:rgba(110,231,183,.22);border-radius:999px;border:2px solid transparent;background-clip:content-box;}',
    '::-webkit-scrollbar-thumb:hover{background:rgba(110,231,183,.4);background-clip:content-box;}',

    /* ----- backdrop layer ----- */
    '#vt-backdrop{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;background:var(--bg);}',
    '#vt-backdrop .wb-atmosphere{position:absolute;inset:0;pointer-events:none;background:' +
      'radial-gradient(60% 50% at 50% 40%,rgba(110,231,183,.18) 0%,rgba(110,231,183,.06) 32%,rgba(110,231,183,0) 66%),' +
      'radial-gradient(34% 26% at 50% 44%,rgba(255,226,181,.08) 0%,rgba(255,226,181,0) 72%),' +
      'radial-gradient(130% 90% at 50% 120%,rgba(14,38,30,.85) 0%,rgba(0,0,0,1) 72%);}',
    '#vt-backdrop .wb-mountains{position:absolute;left:0;right:0;bottom:0;height:42vh;min-height:240px;pointer-events:none;}',
    '#vt-backdrop .wb-mountains svg{width:100%;height:100%;display:block;}',
    '#vt-backdrop .wb-mist{position:absolute;left:0;right:0;bottom:30vh;height:24vh;pointer-events:none;' +
      'background:linear-gradient(to top,rgba(0,0,0,0) 0%,rgba(110,231,183,.06) 40%,rgba(0,0,0,0) 100%);filter:blur(8px);}',
    '#vt-backdrop .wb-particles{position:absolute;inset:0;pointer-events:none;}',
    '#vt-backdrop .wb-particles span{position:absolute;width:1.5px;height:1.5px;' +
      'background:rgba(233,239,233,.55);border-radius:50%;box-shadow:0 0 4px rgba(167,243,208,.35);' +
      'animation:vtDrift linear infinite;}',
    '@keyframes vtDrift{0%{transform:translate3d(0,0,0);opacity:0;}8%{opacity:.7;}92%{opacity:.5;}' +
      '100%{transform:translate3d(var(--dx,12px),var(--dy,-100vh),0);opacity:0;}}',
    /* film grain over everything (very subtle, never blocks clicks) */
    '#vt-grain{position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:.05;' +
      'mix-blend-mode:overlay;background-image:' + GRAIN + ';background-size:200px 200px;}',
    '@media (prefers-reduced-motion:reduce){#vt-backdrop .wb-particles span{animation:none;}}',

    /* ----- editorial headings: serif italic is where the personality lives ----- */
    ':where(h1,h2,h3):not([data-no-vitality]){font-family:var(--vt-serif);font-style:italic;' +
      'font-weight:400;letter-spacing:-0.01em;line-height:1.1;color:var(--fg);}',
    ':where(h4,h5,h6):not([data-no-vitality]){font-weight:600;letter-spacing:-0.01em;line-height:1.2;}',

    /* ----- glassmorphism cards / panels / sections ----- */
    ':where(.card,section,article,[class*="card"],[class*="Card"],[class*="panel"],[class*="Panel"])' +
      ':not([data-no-vitality]){background:var(--card-elevated);border:1px solid var(--border);' +
      'border-radius:var(--radius-lg);-webkit-backdrop-filter:blur(16px) saturate(1.3);' +
      'backdrop-filter:blur(16px) saturate(1.3);box-shadow:var(--glass-shadow);}',

    /* ----- buttons (broad, mint accent) ----- */
    ':where(button,.btn,[role="button"],input[type="button"],input[type="reset"])' +
      ':not([data-no-vitality]){font-family:var(--vt-sans);font-size:var(--text-sm);font-weight:600;' +
      'line-height:1;display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);' +
      'padding:.6875rem var(--space-4);border-radius:var(--radius-md);border:1px solid var(--border);' +
      'background:var(--card-elevated);color:var(--fg);cursor:pointer;' +
      'transition:background var(--duration) var(--ease),border-color var(--duration) var(--ease),' +
      'color var(--duration) var(--ease),transform var(--duration-fast) var(--ease);}',
    ':where(button,.btn,[role="button"]):not([data-no-vitality]):hover{border-color:var(--mint);background:rgba(110,231,183,.08);}',
    ':where(button,.btn,[role="button"]):not([data-no-vitality]):active{transform:translateY(1px);}',
    ':where(button,.btn):not([data-no-vitality]):disabled{opacity:.5;cursor:not-allowed;}',
    /* primary actions get the solid mint fill */
    ':where(button[type="submit"],input[type="submit"],.btn-primary)' +
      ':not([data-no-vitality]){background:var(--mint);color:var(--mint-ink);border-color:transparent;}',
    ':where(button[type="submit"],input[type="submit"],.btn-primary)' +
      ':not([data-no-vitality]):hover{background:var(--mint-hover);border-color:transparent;}',

    /* ----- inputs (excludes toggles/sliders so they keep native behaviour) ----- */
    ':where(input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox])' +
      ':not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=image]),' +
      'select,textarea):not([data-no-vitality]){font-family:var(--vt-sans);font-size:var(--text-sm);' +
      'color:var(--fg);background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);' +
      'padding:.6875rem var(--space-3);outline:none;' +
      'transition:border-color var(--duration) var(--ease),background var(--duration) var(--ease);}',
    ':where(input,textarea,select):not([data-no-vitality])::placeholder{color:var(--muted);}',
    ':where(input,select,textarea):not([data-no-vitality]):hover{border-color:var(--border-strong);}',
    ':where(input,select,textarea):not([data-no-vitality]):focus{border-color:var(--mint);background:rgba(110,231,183,.04);}',

    /* ----- links + helpers ----- */
    ':where(a):not([data-no-vitality]){color:inherit;text-decoration:none;transition:color var(--duration) var(--ease);}',
    ':where(a.link,.link):not([data-no-vitality]){color:var(--mint);font-weight:500;}',
    ':where(a.link,.link):not([data-no-vitality]):hover{color:var(--mint-hover);}',
    ':where(code,kbd,samp,pre,.mono):not([data-no-vitality]){font-family:var(--vt-mono);}',

    /* ----- opt-in utility classes (normal specificity, additive) ----- */
    '.serif{font-family:var(--vt-serif);font-weight:400;letter-spacing:-0.01em;}',
    '.serif-italic{font-family:var(--vt-serif);font-style:italic;font-weight:400;letter-spacing:-0.01em;}',
    '.text-muted{color:var(--muted);}.text-muted-strong{color:var(--muted-strong);}',
    '.vt-mint{color:var(--mint);}'
  ].join('\n');

  function addStyle() {
    var s = document.getElementById('vt-style');
    if (!s) { s = document.createElement('style'); s.id = 'vt-style'; s.textContent = CSS; }
    head().appendChild(s);   // (re)append — keep theme as the last stylesheet
  }

  /* ---- 3. Backdrop DOM + particles --------------------------------------- */
  var MOUNTAINS =
    '<svg viewBox="0 0 1600 420" preserveAspectRatio="none">' +
      '<defs>' +
        '<linearGradient id="vt-mt-far" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#0d1a17" stop-opacity="0"/>' +
          '<stop offset="55%" stop-color="#0d1a17" stop-opacity=".55"/>' +
          '<stop offset="100%" stop-color="#0d1a17" stop-opacity=".95"/>' +
        '</linearGradient>' +
        '<linearGradient id="vt-mt-near" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#050a09" stop-opacity=".4"/>' +
          '<stop offset="60%" stop-color="#050a09" stop-opacity=".95"/>' +
          '<stop offset="100%" stop-color="#050a09" stop-opacity="1"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 ' +
        'L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#vt-mt-far)"/>' +
      '<path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 ' +
        'L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#vt-mt-near)"/>' +
    '</svg>';

  function spawnParticles(root) {
    if (!root) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var N = window.innerWidth < 640 ? 10 : 18;
    for (var i = 0; i < N; i++) {
      var s = document.createElement('span');
      var dur = 18 + Math.random() * 22;
      var size = 1 + Math.random() * 1.2;
      s.style.left = (Math.random() * 100) + '%';
      s.style.top = (60 + Math.random() * 40) + 'vh';
      s.style.width = s.style.height = size + 'px';
      s.style.animationDuration = dur + 's';
      s.style.animationDelay = (-Math.random() * dur) + 's';
      s.style.setProperty('--dx', (Math.random() * 30 - 15) + 'px');
      s.style.setProperty('--dy', (-(60 + Math.random() * 50)) + 'vh');
      root.appendChild(s);
    }
  }

  function addBackdrop() {
    if (document.getElementById('vt-backdrop') || !document.body) return;
    var bd = document.createElement('div');
    bd.id = 'vt-backdrop';
    bd.setAttribute('aria-hidden', 'true');
    bd.innerHTML =
      '<div class="wb-atmosphere"></div>' +
      '<div class="wb-mountains">' + MOUNTAINS + '</div>' +
      '<div class="wb-mist"></div>' +
      '<div class="wb-particles"></div>';
    document.body.insertBefore(bd, document.body.firstChild);   // behind content

    var grain = document.createElement('div');
    grain.id = 'vt-grain';
    grain.setAttribute('aria-hidden', 'true');
    document.body.appendChild(grain);

    spawnParticles(bd.querySelector('.wb-particles'));
  }

  /* ---- boot -------------------------------------------------------------- */
  addFonts();
  addStyle();

  if (document.body) addBackdrop();
  else document.addEventListener('DOMContentLoaded', addBackdrop);

  // If our <script> sat above the page's own <style>/<link>, re-append at ready
  // so the theme is the last sheet (ties go to theme; :where keeps page rules safe).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addStyle);
  }
})();
