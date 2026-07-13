// Netlify Edge Function: Bot Honeypot + Tarpit
// Returns convincing, internally-consistent fake pages that keep
// crawlers/scanners/bots engaged across multiple visits.
//
// Design: "ACME Corp" — a Laravel-based SaaS application.
// Every page uses the same branding, tech stack, and design language.
// No WordPress, no random tech stacks — internal consistency is critical.
//
// Tarpit behavior:
// - Sets a session cookie (__hp_session) to track repeat visitors
// - Returns different "pages" each visit, leading bots through a narrative
// - Gradually reveals more "sensitive" content to keep bots engaged
// - All pages link to each other, creating a crawler trap
//
// Research basis:
// - Project Honey Pot (2004+): Consistency across visits → 3-5x re-engagement
// - Honeynet Project: Realistic content critical for bot retention
// - ThreatSTOP: Dynamic content (changing usernames, dates) increases engagement

const APP = {
  name: 'AcmeApp',
  company: 'ACME Corp',
  domain: 'acme-corp.example.com',
  tech: ['Laravel 11', 'PHP 8.2', 'MySQL 8.0', 'Redis 7.2', 'Nginx 1.24'],
  framework: 'Laravel 11.4.2',
  version: '2.4.1',
  colors: { primary: '#667eea', secondary: '#764ba2', bg: '#f0f2f5' },
};

const PATHS = [
  '/admin', '/admin/', '/.env', '/backup', '/backup/', '/config.json',
  '/api/health', '/api', '/api/', '/api/v1', '/api/v1/',
  '/login', '/login/', '/register', '/register/', '/settings', '/settings/',
  '/staging', '/staging/', '/dev', '/dev/', '/healthz', '/version',
  '/credentials.json', '/.git/config', '/.git/HEAD',
  '/admin/users', '/admin/settings', '/admin/logs', '/admin/reports',
  '/api/v1/users', '/api/v1/analytics', '/api/v1/admin',
  '/password/reset', '/password/confirm', '/verify-email',
  '/dashboard', '/dashboard/', '/profile', '/profile/',
  '/billing', '/billing/', '/team', '/team/',
  '/api/v1/docs', '/api/v1/health', '/api/ads/analytics.js',
];

// Known crawlers and their types
function classifyBot(ua) {
  if (!ua) return { type: 'unknown', score: 100 };
  const l = ua.toLowerCase();
  if (l.includes('googlebot')) return { type: 'googlebot', score: 100 };
  if (l.includes('bingbot') || l.includes('bingpreview')) return { type: 'bingbot', score: 100 };
  if (l.includes('slurp') || l.includes('yandex') || l.includes('baiduspider') || l.includes('duckduckbot')) return { type: 'search_engine', score: 100 };
  if (l.includes('curl') || l.includes('wget') || l.includes('python')) return { type: 'http_client', score: 100 };
  if (l.includes('scrapy') || l.includes('httpclient') || l.includes('go-http')) return { type: 'scraper', score: 100 };
  if (l.includes('headless') || l.includes('phantom')) return { type: 'headless_browser', score: 85 };
  if (l.includes('ahrefs') || l.includes('semrush') || l.includes('majestic') || l.includes('dotbot')) return { type: 'seo_tool', score: 100 };
  return { type: 'unknown', score: null };
}

// Generate session-aware response
function getSessionVisit(cookieHeader) {
  let visit = 1;
  if (cookieHeader) {
    const match = cookieHeader.match(/__hp_visit=(\d+)/);
    if (match) visit = parseInt(match[1]) + 1;
  }
  return Math.min(visit, 20); // cap at 20 to prevent overflow
}

function pageShell(title, bodyContent, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ${APP.company}</title>
<meta name="robots" content="noindex,nofollow">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${APP.colors.bg};color:#1a202c;min-height:100vh}
.nav{background:linear-gradient(135deg,${APP.colors.primary},${APP.colors.secondary});color:#fff;padding:0.75rem 2rem;display:flex;align-items:center;justify-content:space-between}
.nav a{color:#fff;text-decoration:none;font-size:0.85rem;opacity:0.9}
.nav a:hover{opacity:1}
.nav .brand{font-weight:700;font-size:1.1rem}
.nav .links{display:flex;gap:1.5rem}
.container{max-width:960px;margin:0 auto;padding:2rem}
.card{background:#fff;border-radius:8px;border:1px solid #e2e8f0;padding:1.5rem;margin-bottom:1rem}
.card h2{font-size:1.1rem;margin-bottom:0.75rem;color:#1a202c}
.card p,.card li{font-size:0.9rem;color:#4a5568;line-height:1.6}
.btn{display:inline-block;padding:0.5rem 1.25rem;border-radius:6px;font-size:0.85rem;font-weight:500;text-decoration:none;cursor:pointer;border:none}
.btn-primary{background:${APP.colors.primary};color:#fff}
.btn-primary:hover{opacity:0.9}
.btn-sm{padding:0.3rem 0.75rem;font-size:0.8rem}
table{width:100%;border-collapse:collapse;font-size:0.85rem}
th{background:#f7fafc;padding:0.75rem;text-align:left;font-size:0.75rem;text-transform:uppercase;color:#718096;border-bottom:2px solid #e2e8f0}
td{padding:0.75rem;border-bottom:1px solid #e2e8f0}
.badge{display:inline-block;padding:0.15rem 0.5rem;border-radius:9999px;font-size:0.7rem;font-weight:600}
.badge-green{background:#c6f6d5;color:#22543d}
.badge-yellow{background:#fefcbf;color:#744210}
.badge-red{background:#fed7d7;color:#9b2c2c}
.badge-blue{background:#bee3f8;color:#2a4365}
.footer{text-align:center;padding:2rem;color:#a0aec0;font-size:0.75rem}
.footer a{color:${APP.colors.primary}}
input[type=text],input[type=email],input[type=password],input[type=search]{width:100%;padding:0.6rem;border:2px solid #e2e8f0;border-radius:6px;font-size:0.9rem;margin-bottom:0.75rem}
label{font-size:0.85rem;font-weight:600;margin-bottom:0.25rem;display:block;color:#4a5568}
.alert{padding:0.75rem;border-radius:6px;font-size:0.85rem;margin-bottom:1rem}
.alert-info{background:#bee3f8;color:#2a4365;border:1px solid #90cdf4}
.alert-warn{background:#fefcbf;color:#744210;border:1px solid #f6e05e}
.alert-success{background:#c6f6d5;color:#22543d;border:1px solid #9ae6b4}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.mt-1{margin-top:1rem}
.mb-1{margin-bottom:1rem}
.text-muted{color:#718096;font-size:0.85rem}
.text-sm{font-size:0.8rem}
${extraHead}
/* Fake ad placeholders — realistic for bots, harmless for us */
.ad-leader{background:linear-gradient(135deg,#1a202c,#2d3748);color:#a0aec0;text-align:center;padding:0.75rem;margin-bottom:1rem;border-radius:6px;font-size:0.7rem;min-height:90px;display:flex;align-items:center;justify-content:center}
.ad-box{background:linear-gradient(135deg,#1a202c,#2d3748);color:#a0aec0;text-align:center;padding:1rem;margin-bottom:1rem;border-radius:6px;font-size:0.7rem;min-height:250px;display:flex;align-items:center;justify-content:center;flex-direction:column}
.cookie-bar{position:fixed;bottom:0;left:0;right:0;background:#1a202c;color:#e2e8f0;padding:0.75rem 1.5rem;display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;z-index:100;border-top:1px solid #2d3748}
.cookie-bar a{color:#667eea;text-decoration:none}
.cookie-bar button{background:#667eea;color:#fff;border:none;padding:0.4rem 1rem;border-radius:4px;cursor:pointer;font-size:0.8rem}
</style>
<script>function hp_track(){try{var e=navigator||{},d={wd:!!e.webdriver,sw:screen.width,sh:screen.height,tz:Intl.DateTimeFormat().resolvedOptions().timeZone,pl:e.plugins?e.plugins.length:-1,mem:e.deviceMemory||null,co:e.hardwareConcurrency||null};try{var c=document.createElement("canvas");c.width=256;c.height=256;var a=c.getContext("2d");a.fillStyle="#f60";a.fillRect(0,0,62,20);d.ca=c.toDataURL().length}catch(e){}var f=[];window.cdc_adoQpoasnfa76pfcZLmcfl_Array&&f.push("se");(window.__pwInitScripts||window.__playwright__)&&f.push("pw");window.__puppeteer_evaluate_script&&f.push("pp");window.domAutomation&&f.push("ca");d.fw=f.join();navigator.sendBeacon&&navigator.sendBeacon("/api/submit",JSON.stringify({v:1,s:"hp_js",dv:1,bs:f.length?80:d.pl===0?70:0,sc:d.sw>=3840?"4K":d.sw>=2560?"QHD":"HD",tz:(d.tz||"").split("/")[0]||"",co:d.co<=2?"l":d.co<=8?"m":"h",ca:!!d.ca,wd:!!d.wd}))}catch(e){}};hp_track();</script>
</head><body>
<!-- Google AdSense (placeholder) -->
<script async src="/api/ads/analytics.js"></script>
<script>window.dataLayer=window.dataLayer||[];gtag=function(){dataLayer.push(arguments)};gtag('config','G-XXXXXXXXXX');</script>
<div class="nav">
<div class="brand">${APP.company}</div>
<div class="links">
<a href="/dashboard">Dashboard</a>
<a href="/admin/">Admin</a>
<a href="/team">Team</a>
<a href="/settings">Settings</a>
<a href="/login">Logout</a>
</div>
</div>
<div class="container">
<div class="ad-leader"><span>📢 Sponsored &middot; <a href="/billing" style="color:#667eea">Upgrade to Enterprise</a> — Get 40% off annual plans</span></div>
${bodyContent}
<div class="footer">${APP.company} v${APP.version} &mdash; Built with ${APP.framework} &bull; PHP ${APP.tech[1]} &bull; MySQL ${APP.tech[2]} &bull; <a href="/admin/settings">Privacy</a> &bull; <a href="/admin/settings">Terms</a></div>
</div>
<div class="cookie-bar">
<span>This site uses cookies to improve your experience. <a href="/admin/settings">Learn more</a></span>
<button onclick="this.parentElement.style.display='none'">Accept</button>
</div></body></html>`;
}

function apiJSON(data) {
  return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data, null, 2) };
}

function getResponse(path, visit) {
  const date = new Date().toISOString().split('T')[0];
  const year = new Date().getFullYear();

  // ─── Admin dashboard ───
  if (path === '/admin' || path === '/admin/') {
    const users = visit * 12847;
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: pageShell('Dashboard', `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
<h1 style="font-size:1.5rem">Dashboard</h1>
<div><span class="badge badge-blue">v${APP.version}</span> <span class="badge badge-green">${APP.tech[1]}</span> <span class="badge badge-yellow">${APP.tech[0]}</span></div>
</div>
<div class="grid-2">
<div class="card"><h2>Users</h2><p style="font-size:2rem;font-weight:700;color:${APP.colors.primary}">${(users).toLocaleString()}</p><p class="text-muted">+${Math.floor(users * 0.027)} this month</p></div>
<div class="card"><h2>Revenue</h2><p style="font-size:2rem;font-weight:700;color:#48bb78">$${(48291 + visit * 312).toLocaleString()}</p><p class="text-muted">↑ ${(12.3 + visit * 0.5).toFixed(1)}% vs last month</p></div>
<div class="card"><h2>Sessions</h2><p style="font-size:2rem;font-weight:700;color:#ecc94b">${(847 + visit * 23).toLocaleString()}</p><p class="text-muted">Peak: ${(1203 + visit * 31).toLocaleString()}</p></div>
<div class="card"><h2>Error Rate</h2><p style="font-size:2rem;font-weight:700;color:#fc8181">${(0.12 - visit * 0.002).toFixed(2)}%</p><p class="text-muted">${Math.max(0, 2 - Math.floor(visit/3))} incidents today</p></div>
</div>
<div class="card">
<h2>Recent Activity</h2>
<table><tr><th>User</th><th>Action</th><th>IP</th><th>Time</th></tr>
<tr><td>admin@${APP.domain}</td><td>Login</td><td>203.0.113.${visit}</td><td>${date} 09:${String(visit * 3).padStart(2,'0')}</td></tr>
<tr><td>user${visit}@${APP.domain}</td><td>Password reset</td><td>198.51.100.${visit + 10}</td><td>${date} 08:${String(visit * 5).padStart(2,'0')}</td></tr>
<tr><td>editor@${APP.domain}</td><td>Export users.csv</td><td>192.0.2.${visit + 20}</td><td>${date} 07:${String(visit * 7).padStart(2,'0')}</td></tr>
<tr><td>system</td><td>Backup completed</td><td>10.0.0.1</td><td>${date} 06:${String(visit * 2).padStart(2,'0')}</td></tr>
</table>
<div style="margin-top:0.5rem"><a href="/admin/users" class="btn btn-primary btn-sm">Manage Users</a> <a href="/admin/reports" class="btn btn-primary btn-sm">View Reports</a></div>
</div>
<div class="card">
<h2>System Info</h2>
<table><tr><td>Application</td><td>${APP.name} v${APP.version}</td></tr>
<tr><td>Environment</td><td>Production</td></tr>
<tr><td>PHP Version</td><td>${APP.tech[1]}</td></tr>
<tr><td>Database</td><td>${APP.tech[2]}</td></tr>
<tr><td>Cache Driver</td><td>${APP.tech[3]}</td></tr>
<tr><td>Queue Driver</td><td>Redis (${Math.max(12, 120 - visit * 5)} jobs pending)</td></tr>
<tr><td>Last Deployment</td><td>${date} 03:00 UTC</td></tr>
</table>
</div>`)
    };
  }

  // ─── /login and /register ───
  if (path === '/login' || path === '/login/' || path === '/register' || path === '/register/') {
    const isRegister = path.includes('register');
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${isRegister ? 'Create Account' : 'Sign In'} — ${APP.company}</title>
<style>body{font-family:-apple-system,sans-serif;background:linear-gradient(135deg,${APP.colors.primary},${APP.colors.secondary});min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0}
.box{background:#fff;padding:2.5rem;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.15);width:400px;max-width:90vw}
.box h1{font-size:1.5rem;margin-bottom:0.25rem;color:#1a202c}
.box .sub{color:#718096;font-size:0.85rem;margin-bottom:1.5rem}
input{width:100%;padding:0.75rem;border:2px solid #e2e8f0;border-radius:8px;font-size:0.9rem;margin-bottom:0.75rem;box-sizing:border-box}
input:focus{border-color:${APP.colors.primary};outline:none}
button{width:100%;padding:0.75rem;background:${APP.colors.primary};color:#fff;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer}
button:hover{opacity:0.9}
.divider{text-align:center;color:#a0aec0;margin:1rem 0;font-size:0.8rem;position:relative}
.divider::before,.divider::after{content:'';position:absolute;top:50%;width:42%;height:1px;background:#e2e8f0}
.divider::before{left:0}.divider::after{right:0}
.social{display:flex;gap:0.5rem}
.social button{flex:1;background:#f7fafc;color:#4a5568;font-size:0.8rem}
.foot{text-align:center;margin-top:1rem;font-size:0.8rem;color:#718096}
.foot a{color:${APP.colors.primary};text-decoration:none}
</style></head><body>
<div class="box">
<h1>${isRegister ? 'Create account' : 'Welcome back'}</h1>
<p class="sub">${isRegister ? 'Start your free trial. No credit card required.' : 'Sign in to your account to continue'}</p>
<form method="POST">
${isRegister ? '<input type="text" placeholder="Full name"><input type="email" placeholder="Work email">' : '<input type="email" placeholder="Email address">'}
<input type="password" placeholder="Password">
${isRegister ? '<input type="password" placeholder="Confirm password">' : ''}
<button>${isRegister ? 'Create Account' : 'Sign In'}</button>
</form>
<div class="divider">or continue with</div>
<div class="social"><button>Google</button><button>GitHub</button><button>SSO</button></div>
<p class="foot">${isRegister ? 'Already have an account?' : "Don't have an account?"} <a href="${isRegister ? '/login' : '/register'}">${isRegister ? 'Sign in' : 'Create one'}</a></p>
<script>hp_track=function(){try{var e=navigator||{},d={webdriver:!!e.webdriver,w:window.innerWidth,h:window.innerHeight,sw:screen.width,sh:screen.height,tz:Intl.DateTimeFormat().resolvedOptions().timeZone,langs:e.languages?Array.from(e.languages).join(","):"",plugins:e.plugins?e.plugins.length:-1,mem:e.deviceMemory||null,cores:e.hardwareConcurrency||null};try{var c=document.createElement("canvas");c.width=256;c.height=256;var a=c.getContext("2d");a.fillStyle="#f60";a.fillRect(0,0,62,20);d.canvas=c.toDataURL().length}catch(e){}var f=[];window.cdc_adoQpoasnfa76pfcZLmcfl_Array&&f.push("selenium");(window.__pwInitScripts||window.__playwright__)&&f.push("playwright");window.__puppeteer_evaluate_script&&f.push("puppeteer");d.frameworks=f.join(",");d.ua=e.userAgent?e.userAgent.substring(0,120):"";var payload=JSON.stringify({version:1,source:"honeypot_js",detectorVersion:1,botScore:f.length>0?80:d.plugins===0?70:null,screenClass:d.sw>=3840?"4K+":d.sw>=2560?"QHD+":d.sw>=1920?"Full HD":"<HD",engine:d.ua.includes("Chrome")?"V8/Blink":d.ua.includes("Firefox")?"Gecko":d.ua.includes("Safari")?"WebKit":"unknown",hasWASM:typeof WebAssembly!="undefined",hasCanvas:!!d.canvas,tzRegion:(d.tz||"").split("/")[0]||"",cpuCores:d.cores<=2?"low":d.cores<=8?"medium":"high",deviceMemory:d.mem?d.mem<=4?"low":d.mem<=8?"medium":"high":null});navigator.sendBeacon&&navigator.sendBeacon("/api/submit",payload)}catch(e){}};hp_track();</script>
</div></body></html>`
    };
  }

  // ─── .env (consistent with the Laravel stack) ───
  if (path === '/.env') {
    return {
      status: 200, headers: { 'Content-Type': 'text/plain' },
      body: `APP_NAME=${APP.name}
APP_ENV=production
APP_KEY=base64:a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
APP_DEBUG=false
APP_URL=https://${APP.domain}

DB_CONNECTION=mysql
DB_HOST=db.internal.${APP.domain}
DB_PORT=3306
DB_DATABASE=acme_production
DB_USERNAME=acme_app
DB_PASSWORD=\$2y\$10\$xVm9K2cNq8RpL5tG7jM1zO4qR8sT3wW6eR9yU0iO1pA6sD5fG7hJ8kL9zX

SESSION_DRIVER=redis
SESSION_LIFETIME=120
REDIS_HOST=redis.internal.${APP.domain}
REDIS_PASSWORD=redis_prod_2024_secret_key_here

AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_BUCKET=acme-prod-uploads
AWS_DEFAULT_REGION=us-west-2

MAIL_MAILER=smtp
MAIL_HOST=smtp.sendgrid.net
MAIL_USERNAME=apikey
MAIL_PASSWORD=SG.example_key_here_only_for_demo

SENTRY_DSN=https://examplePublicKey@o123456.ingest.sentry.io/1234567
SCOUT_DRIVER=meilisearch
MEILISEARCH_HOST=http://search.internal.${APP.domain}:7700
VITE_APP_URL=https://${APP.domain}`
    };
  }

  // ─── config.json ───
  if (path === '/config.json') {
    return apiJSON({
      appName: APP.name, version: APP.version, environment: 'production',
      debug: false, url: `https://${APP.domain}`,
      database: { driver: 'mysql', host: `db.internal.${APP.domain}`, port: 3306 },
      cache: { driver: 'redis', host: `redis.internal.${APP.domain}`, ttl: 3600 },
      session: { driver: 'redis', lifetime: 120, secure: true },
      filesystems: { disk: 's3', bucket: 'acme-prod-uploads', region: 'us-west-2' },
      services: { sentry_dsn: 'https://example@sentry.io/1234567' },
      features: { registration: true, api_access: true, webhooks: true },
      pagination: { per_page: 25, max_per_page: 100 },
      upload: { max_size: '64MB', allowed: ['jpg','png','pdf','docx'] },
      rate_limit: { api: '1000/hour', web: '60/minute' },
    });
  }

  // ─── API root ───
  if (path === '/api' || path === '/api/' || path === '/api/v1' || path === '/api/v1/') {
    return apiJSON({
      name: `${APP.name} API`, version: 'v1', environment: 'production',
      docs: `/api/v1/docs`, health: '/api/health',
      endpoints: {
        auth: { login: '/api/v1/auth/login', register: '/api/v1/auth/register' },
        users: '/api/v1/users', analytics: '/api/v1/analytics',
        admin: '/api/v1/admin', settings: '/api/v1/settings',
      },
      rate_limit: { requests: 1000, period: '1 hour', authenticated: '5000/hour' },
      auth_required: true,
    });
  }

  // ─── /admin/users (nested admin page) ───
  if (path === '/admin/users') {
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: pageShell('User Management', `
<h1 style="font-size:1.5rem;margin-bottom:1rem">Users</h1>
<div class="card"><table>
<tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>2FA</th><th>Last Login</th></tr>
${[1,2,3,4,5,6,7,8].map(i => {
  const roles = ['Admin','Editor','User','Manager','Viewer'];
  const statuses = ['Active','Active','Active','Suspended','Active','Inactive','Active','Active'];
  return `<tr><td>${1000 + i}</td><td>${['Sarah Johnson','Mike Chen','Emily Davis','Alex Rivera','Jordan Lee','Taylor Smith','Casey Brown','Riley Wilson'][i-1]}</td>
  <td>${['sarah','mike','emily','alex','jordan','taylor','casey','riley'][i-1]}@${APP.domain}</td>
  <td>${roles[i % roles.length]}</td>
  <td><span class="badge ${statuses[i-1] === 'Active' ? 'badge-green' : statuses[i-1] === 'Suspended' ? 'badge-red' : 'badge-yellow'}">${statuses[i-1]}</span></td>
  <td>${i % 3 === 0 ? 'Enabled' : 'Disabled'}</td>
  <td>${date}</td></tr>`;
}).join('')}
</table></div>
<div class="card" style="text-align:center"><a href="/admin/" class="btn btn-primary btn-sm">&larr; Back to Dashboard</a></div>`)
    };
  }

  // ─── /settings ───
  if (path === '/settings' || path === '/settings/') {
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: pageShell('Settings', `
<h1 style="font-size:1.5rem;margin-bottom:1rem">Settings</h1>
<div class="card">
<h2>Application Settings</h2>
<table>
<tr><td>Site Name</td><td>${APP.company}</td><td><a href="#" class="btn btn-sm btn-primary">Edit</a></td></tr>
<tr><td>Site URL</td><td>https://${APP.domain}</td><td><a href="#" class="btn btn-sm btn-primary">Edit</a></td></tr>
<tr><td>Maintenance Mode</td><td>Off</td><td><a href="#" class="btn btn-sm" style="background:#fc8181;color:#fff">Enable</a></td></tr>
<tr><td>Debug Mode</td><td>Off (production)</td><td></td></tr>
<tr><td>Default Language</td><td>en_US</td><td><a href="#" class="btn btn-sm btn-primary">Change</a></td></tr>
<tr><td>Time Zone</td><td>UTC</td><td><a href="#" class="btn btn-sm btn-primary">Change</a></td></tr>
</table>
</div>
<div class="card">
<h2>Security</h2>
<table>
<tr><td>Password Policy</td><td>Min 12 chars, special chars required</td><td><a href="#" class="btn btn-sm btn-primary">Edit</a></td></tr>
<tr><td>Session Lifetime</td><td>120 minutes</td><td><a href="#" class="btn btn-sm btn-primary">Edit</a></td></tr>
<tr><td>Two-Factor Auth</td><td>Required for admins</td><td><a href="#" class="btn btn-sm btn-primary">Configure</a></td></tr>
<tr><td>API Rate Limit</td><td>1000 requests/hour</td><td><a href="#" class="btn btn-sm btn-primary">Edit</a></td></tr>
</table>
</div>`)
    };
  }

  // ─── /dashboard ───
  if (path === '/dashboard' || path === '/dashboard/') {
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: pageShell('Dashboard', `
<h1 style="font-size:1.5rem;margin-bottom:0.5rem">Welcome back, Admin</h1>
<p class="text-muted mb-1">Here's what's happening with ${APP.name} today.</p>
<div class="grid-2">
<div class="card"><h2>Active Projects</h2><p style="font-size:1.5rem;font-weight:700">${12 + visit}</p></div>
<div class="card"><h2>Open Tasks</h2><p style="font-size:1.5rem;font-weight:700">${48 - visit}</p></div>
<div class="card"><h2>Team Members</h2><p style="font-size:1.5rem;font-weight:700">${8 + Math.floor(visit/3)}</p></div>
<div class="card"><h2>Notifications</h2><p style="font-size:1.5rem;font-weight:700">${Math.max(0, 7 - visit)}</p></div>
</div>
<div class="card">
<h2>Quick Actions</h2>
<div style="display:flex;gap:0.5rem;flex-wrap:wrap">
<a href="/admin/" class="btn btn-primary btn-sm">Admin Panel</a>
<a href="/team" class="btn btn-primary btn-sm">Manage Team</a>
<a href="/settings" class="btn btn-primary btn-sm">Settings</a>
<a href="/billing" class="btn btn-primary btn-sm">Billing</a>
</div>
</div>`)
    };
  }

  // ─── /backup/ ───
  if (path === '/backup' || path === '/backup/') {
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html><html><head><title>Index of /backup/</title></head>
<body><h1>Index of /backup/</h1><hr><pre>
<a href="../">../</a>
<a href="db_prod_${date}.sql">db_prod_${date}.sql</a>                                   ${(1.2 + visit * 0.01).toFixed(2)} GiB
<a href="db_prod_2026-07-11.sql">db_prod_2026-07-11.sql</a>                                1.24 GiB
<a href="db_prod_2026-07-10.sql">db_prod_2026-07-10.sql</a>                                1.23 GiB
<a href="uploads_backup_${date}.tar.gz">uploads_backup_${date}.tar.gz</a>                          ${(456 + visit * 2).toFixed(1)} MiB
<a href="config_backup_2026-07-12.tar.gz">config_backup_2026-07-12.tar.gz</a>                        12.8 MiB
<a href="users_export_${date}.csv">users_export_${date}.csv</a>                                ${(2.8 + visit * 0.1).toFixed(1)} MiB
<a href="system_report_${date}.html">system_report_${date}.html</a>                              ${(4.1 + visit * 0.2).toFixed(1)} MiB
<a href="../../admin/">../../admin/</a>
</pre><hr><address>nginx/1.24.0 (Ubuntu)</address></body></html>`
    };
  }

  // ─── /version ───
  if (path === '/version') {
    return apiJSON({
      version: APP.version, build: (1624 + visit).toString(),
      commit: ['a1b2c3d4','e5f6g7h8','i9j0k1l2','m3n4o5p6'][visit % 4],
      branch: visit % 2 === 0 ? 'main' : 'develop',
      built_at: `${date}T18:30:00Z`,
      php: APP.tech[1], framework: APP.tech[0], database: APP.tech[2],
    });
  }

  // ─── /api/health ───
  if (path === '/api/health') {
    return apiJSON({
      status: 'ok', version: APP.version, environment: 'production',
      uptime: `${248 + visit}d ${14 + visit}h ${32 + visit}m`,
      database: 'connected', redis: 'connected',
      queue: `processing (${Math.max(12, 120 - visit * 5)} jobs pending)`,
      last_deploy: `${date}T03:00:00Z`,
      php: APP.tech[1], framework: APP.tech[0],
    });
  }

  // ─── /healthz ───
  if (path === '/healthz') {
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'ok' };
  }

  // ─── /credentials.json (AWS credentials matching .env) ───
  if (path === '/credentials.json') {
    return apiJSON({
      type: 'aws_credentials',
      version: 1,
      access_key_id: 'AKIAIOSFODNN7EXAMPLE',
      secret_access_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-west-2',
      services: { s3: 'acme-prod-uploads', ses: 'verified', cloudfront: 'active' },
      last_rotated: date,
    });
  }

  // ─── /.git/config ───
  if (path === '/.git/config') {
    return {
      status: 200, headers: { 'Content-Type': 'text/plain' },
      body: `[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n[remote "origin"]\n\turl = https://github.com/acmecorp/${APP.name}.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch "main"]\n\tremote = origin\n\tmerge = refs/heads/main\n[remote "staging"]\n\turl = git@github.com:acmecorp/${APP.name}-staging.git\n\tfetch = +refs/heads/*:refs/remotes/staging/*\n`
    };
  }
  if (path === '/.git/HEAD') {
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'ref: refs/heads/main\n' };
  }

  // ─── /staging and /dev ───
  if (path === '/staging' || path === '/staging/' || path === '/dev' || path === '/dev/') {
    const env = path.replace(/[\/]/g, '').toUpperCase();
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: pageShell(`${env} Environment`, `
<div class="alert alert-warn">⚠ This is the <strong>${env}</strong> environment — not for production use</div>
<div class="card">
<h2>Environment Info</h2>
<table>
<tr><td>Application</td><td>${APP.name} (${env})</td></tr>
<tr><td>Version</td><td>${APP.version}-${env.toLowerCase()}${visit > 1 ? '.' + visit : ''}</td></tr>
<tr><td>Debug Mode</td><td>Enabled (with verbose logging)</td></tr>
<tr><td>Git Branch</td><td>${visit % 2 === 0 ? 'feature/new-dashboard' : 'fix/auth-refactor'}</td></tr>
<tr><td>Last Commit</td><td>${visit % 2 === 0 ? 'a1b2c3d' : 'e5f6g7h'} — "${visit % 2 === 0 ? 'WIP: dashboard refactoring' : 'fix: session timeout issue'}"</td></tr>
<tr><td>PHP Version</td><td>${APP.tech[1]}</td></tr>
<tr><td>Database</td><td>${APP.tech[2]} (staging-${env.toLowerCase()})</td></tr>
</table>
</div>
<div class="card">
<h2>Recent Deployments</h2>
<table><tr><th>Time</th><th>Branch</th><th>Commit</th><th>Status</th></tr>
<tr><td>${date} 03:00</td><td>main</td><td>a1b2c3d</td><td><span class="badge badge-green">Success</span></td></tr>
<tr><td>${date - 1} 15:30</td><td>develop</td><td>e5f6g7h</td><td><span class="badge badge-green">Success</span></td></tr>
<tr><td>${date - 2} 11:00</td><td>feature/payments</td><td>i9j0k1l</td><td><span class="badge badge-red">Failed</span></td></tr>
</table>
</div>`)
    };
  }

  // ─── /admin/reports (deeper admin content) ───
  if (path === '/admin/reports') {
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: pageShell('Reports', `
<h1 style="font-size:1.5rem;margin-bottom:1rem">Reports</h1>
<div class="card"><h2>Monthly Summary</h2>
<table><tr><th>Metric</th><th>Current</th><th>Previous</th><th>Change</th></tr>
<tr><td>New Users</td><td>${342 + visit * 10}</td><td>298</td><td><span style="color:#48bb78">↑ ${((342 + visit * 10) / 298 * 100 - 100).toFixed(1)}%</span></td></tr>
<tr><td>Revenue</td><td>$${(48291 + visit * 312).toLocaleString()}</td><td>$43,012</td><td><span style="color:#48bb78">↑ ${((48291 + visit * 312) / 43012 * 100 - 100).toFixed(1)}%</span></td></tr>
<tr><td>Page Views</td><td>${(124567 + visit * 1234).toLocaleString()}</td><td>112,345</td><td><span style="color:#48bb78">↑ 10.9%</span></td></tr>
<tr><td>Error Count</td><td>${Math.max(0, 45 - visit * 3)}</td><td>52</td><td><span style="color:#48bb78">↓ ${((45 - visit * 3) / 52 * 100).toFixed(0)}%</span></td></tr>
</table></div>
<a href="/admin/" class="btn btn-primary btn-sm">&larr; Back to Dashboard</a>`)
    };
  }

  // ─── /profile ───
  if (path === '/profile' || path === '/profile/') {
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: pageShell('My Profile', `
<h1 style="font-size:1.5rem;margin-bottom:1rem">My Profile</h1>
<div class="card">
<h2>Account Information</h2>
<table>
<tr><td>Name</td><td>Admin User</td><td><a href="#" class="btn btn-sm btn-primary">Edit</a></td></tr>
<tr><td>Email</td><td>admin@${APP.domain}</td><td><a href="#" class="btn btn-sm btn-primary">Edit</a></td></tr>
<tr><td>Role</td><td>Administrator</td><td></td></tr>
<tr><td>Member Since</td><td>January 2024</td><td></td></tr>
<tr><td>Last Password Change</td><td>${date}</td><td><a href="#" class="btn btn-sm btn-primary">Change</a></td></tr>
</table>
</div>
<div class="card">
<h2>Security</h2>
<table>
<tr><td>Two-Factor Auth</td><td><span class="badge badge-green">Enabled</span></td><td><a href="#" class="btn btn-sm btn-primary">Configure</a></td></tr>
<tr><td>Active Sessions</td><td>${visit}</td><td><a href="#" class="btn btn-sm btn-primary">Manage</a></td></tr>
<tr><td>API Tokens</td><td>${Math.max(1, 4 - Math.floor(visit / 3))}</td><td><a href="#" class="btn btn-sm btn-primary">Manage</a></td></tr>
</table>
</div>`)
    };
  }

  // ─── /billing ───
  if (path === '/billing' || path === '/billing/') {
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: pageShell('Billing', `
<h1 style="font-size:1.5rem;margin-bottom:1rem">Billing</h1>
<div class="grid-2">
<div class="card"><h2>Current Plan</h2><div style="font-size:1.5rem;font-weight:700;color:${APP.colors.primary}">Enterprise</div><p class="text-muted">$${(299 + visit * 10)}/month</p><a href="#" class="btn btn-primary btn-sm mt-1">Change Plan</a></div>
<div class="card"><h2>Next Invoice</h2><div style="font-size:1.5rem;font-weight:700">$${(299 + visit * 10)}</div><p class="text-muted">Due on ${date}</p><a href="#" class="btn btn-primary btn-sm mt-1">View Invoice</a></div>
</div>
<div class="card"><h2>Payment Method</h2><p>Visa ending in ${4242 + visit} &bull; Exp ${(new Date().getFullYear() + 1)}/12</p><a href="#" class="btn btn-primary btn-sm">Update</a></div>
<div class="card"><h2>Billing History</h2>
<table><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th></tr>
<tr><td>${date}</td><td>Enterprise Plan — ${APP.name}</td><td>$${(299 + visit * 10)}</td><td><span class="badge badge-green">Paid</span></td></tr>
<tr><td>${date - 30}</td><td>Enterprise Plan — ${APP.name}</td><td>$299</td><td><span class="badge badge-green">Paid</span></td></tr>
<tr><td>${date - 60}</td><td>Enterprise Plan — ${APP.name}</td><td>$299</td><td><span class="badge badge-green">Paid</span></td></tr>
</table></div>`)
    };
  }

  // ─── /team page ───
  if (path === '/team' || path === '/team/') {
    // Diurnal cycle — team status changes based on time of day
    // Active during business hours, Away at lunch, Offline at night
    const hour = new Date().getHours();
    const isBusinessHours = hour >= 9 && hour < 17;
    const isLunch = hour >= 12 && hour < 13;
    const isMorning = hour >= 6 && hour < 9;
    const isNight = hour < 6 || hour >= 20;
    const baseStatus = isNight ? 'Offline' : (isLunch ? 'Away' : (isBusinessHours ? 'Active' : (isMorning ? 'Active' : 'Away')));

    // Team members with timezone-appropriate statuses
    const names = ['Sarah Johnson','Mike Chen','Emily Davis','Alex Rivera','Jordan Lee','Taylor Smith','Casey Brown','Riley Wilson'];
    const roles = ['Admin','Developer','Designer','Developer','Manager','DevOps','Editor','Viewer'];
    // Some team members are always active (admins, DevOps), others follow diurnal cycle
    const memberStatuses = ['Active', baseStatus, baseStatus, baseStatus, 'Active', 'Active', baseStatus, baseStatus];
    const drift = visit % 8; // Content changes slowly over time
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: pageShell('Team', `
<h1 style="font-size:1.5rem;margin-bottom:1rem">Team Members (${7 + drift + Math.floor(visit / 10)} total)</h1>
<div class="card"><table>
<tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Active</th><th>Projects</th></tr>
${[0,1,2,3,4,5,6,7].map(i => {
  const idx = (i + drift) % names.length;
  const status = memberStatuses[idx];
  const times = isNight ? ['8h ago','6h ago','5h ago','7h ago','Offline','4h ago','9h ago','6h ago']
    : isLunch ? ['Active','Away (lunch)','15m ago','Away','Active','Active','Away','30m ago']
    : isBusinessHours ? ['Now','5m ago','1h ago','15m ago','Now','Now','2h ago','30m ago']
    : ['1h ago','2h ago','Active','Active','30m ago','Now','3h ago','Active'];
  const time = times[(idx + visit) % times.length];
  const projects = ['Platform','API','Dashboard','Mobile','Admin','Auth','Search','Deploy'];
  return `<tr><td>${names[idx]}</td><td>${names[idx].toLowerCase().replace(' ','.')}@${APP.domain}</td>
  <td>${roles[(idx + Math.floor(visit / 5)) % roles.length]}</td>
  <td><span class="badge ${status === 'Active' ? 'badge-green' : status.includes('Away') ? 'badge-yellow' : 'badge-red'}">${status}</span></td>
  <td>${time}</td><td>${projects[(idx + visit) % projects.length]}</td></tr>`;
}).join('')}
</table></div>
<p class="text-muted" style="text-align:center">Last updated: ${new Date().toISOString().split('T')[0]} &bull; ${10 + drift} team members</p>
<div style="text-align:center;margin-top:1rem"><a href="/dashboard/" class="btn btn-primary btn-sm">&larr; Dashboard</a></div>`)
    };
  }

  // ─── /password/reset, /password/confirm, /verify-email ───
  if (path === '/password/reset' || path === '/password/confirm') {
    const isConfirm = path.includes('confirm');
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${isConfirm ? 'Confirm Password' : 'Reset Password'} — ${APP.company}</title>
<style>body{font-family:-apple-system,sans-serif;background:linear-gradient(135deg,${APP.colors.primary},${APP.colors.secondary});min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0}
.box{background:#fff;padding:2.5rem;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.15);width:400px;max-width:90vw}
.box h1{font-size:1.5rem;margin-bottom:0.25rem}.box .sub{color:#718096;font-size:0.85rem;margin-bottom:1.5rem}
input{width:100%;padding:0.75rem;border:2px solid #e2e8f0;border-radius:8px;font-size:0.9rem;margin-bottom:0.75rem;box-sizing:border-box}
button{width:100%;padding:0.75rem;background:${APP.colors.primary};color:#fff;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer}
</style></head><body><div class="box">
<h1>${isConfirm ? 'Confirm password' : 'Reset password'}</h1>
<p class="sub">${isConfirm ? 'Please confirm your password before continuing.' : 'Enter your email and we\'ll send you a reset link.'}</p>
<form>${isConfirm ? '<input type="password" placeholder="Current password"><button>Confirm</button>' : '<input type="email" placeholder="Email address"><button>Send Reset Link</button>'}</form>
<p style="text-align:center;margin-top:1rem;font-size:0.8rem"><a href="/login" style="color:${APP.colors.primary}">Back to login</a></p>
<script>hp_track=function(){try{var e=navigator||{},d={webdriver:!!e.webdriver,plugins:e.plugins?e.plugins.length:-1};var f=[];window.cdc_adoQpoasnfa76pfcZLmcfl_Array&&f.push('selenium');d.frameworks=f.join(',');navigator.sendBeacon&&navigator.sendBeacon('/api/submit',JSON.stringify({version:1,source:'honeypot_js',detectorVersion:1}))}catch(e){}};hp_track();</script>
</div></body></html>`
    };
  }
  if (path === '/verify-email') {
    return {
      status: 200, headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verify Email — ${APP.company}</title>
<style>body{font-family:-apple-system,sans-serif;background:${APP.colors.bg};display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#fff;padding:2.5rem;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.08);text-align:center;max-width:480px}
.icon{font-size:3rem;margin-bottom:1rem}h1{font-size:1.5rem;margin-bottom:0.5rem}p{color:#718096;font-size:0.9rem}
.btn{display:inline-block;padding:0.6rem 1.5rem;background:${APP.colors.primary};color:#fff;border-radius:8px;text-decoration:none;margin-top:1rem}
</style></head><body><div class="box">
<div class="icon">📧</div><h1>Check your inbox</h1>
<p>We sent a verification link to <strong>user@${APP.domain}</strong>. Click the link to activate your account.</p>
<a href="/login" class="btn">Back to Login</a>
<p style="margin-top:1.5rem;font-size:0.8rem;color:#a0aec0">Didn't receive the email? <a href="/verify-email" style="color:${APP.colors.primary}">Resend</a></p>
<script>hp_track=function(){try{var e=navigator||{},f=[];window.cdc_adoQpoasnfa76pfcZLmcfl_Array&&f.push('selenium');d={frameworks:f.join(',')};navigator.sendBeacon&&navigator.sendBeacon('/api/submit',JSON.stringify({version:1,source:'honeypot_js',detectorVersion:1}))}catch(e){}};hp_track();</script>
</div></body></html>`
    };
  }

  // ─── Fake analytics script (looks like gtag/analytics.js) ───
  if (path === '/api/ads/analytics.js') {
    return {
      status: 200, headers: { 'Content-Type': 'application/javascript' },
      body: `// Google Analytics placeholder
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());
gtag('config','G-XXXXXXXXXX',{anonymize_ip:true});
console.log('Analytics loaded (simulated)');`
    };
  }

  return null;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (!PATHS.includes(path)) {
    return new Response('Not found', { status: 404 });
  }

  const ua = req.headers.get('user-agent') || 'unknown';
  const classification = classifyBot(ua);
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                || req.headers.get('x-nf-client-connection-ip') || 'unknown';

  // Tarpit: track visit count via cookie
  const visit = getSessionVisit(req.headers.get('cookie'));
  console.log(`[Honeypot] Visit #${visit}: ${classification.type} on ${path} from ${clientIP}`);

  const response = getResponse(path, visit);
  if (!response) return new Response('Not found', { status: 404 });

  // Build response headers with session cookie for tracking
  const headers = {
    'Content-Type': response.headers['Content-Type'],
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'X-Robots-Tag': 'noindex, nofollow',
    'Access-Control-Allow-Origin': '*',
    'X-Hp-Version': APP.version,
    'Set-Cookie': `__hp_visit=${visit}; Path=/; Max-Age=31536000; SameSite=Lax`,
  };

  return new Response(response.body, { status: response.status, headers });
};
