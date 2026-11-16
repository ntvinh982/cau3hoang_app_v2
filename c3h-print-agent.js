{\rtf1\ansi\ansicpg1252\cocoartf2709
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 #!/usr/bin/env node\
/* =====================================================================\
   c3h-print-agent.js \'97 ch\uc0\u7841 y tr\'ean M\'c1Y POS Android trong ti\u7879 m (qua Termux).\
   Vi\uc0\u7879 c l\'e0m: c\u7913  2 gi\'e2y h\u7887 i Supabase xem c\'f3 l\u7879 nh in m\u7899 i kh\'f4ng; c\'f3 th\'ec g\u7917 i t\u7899 i m\'e1y in qua m\u7841 ng LAN (IP:9100).\
   Ch\uc0\u7841 y th\u7917  m\'e1y in (kh\'f4ng c\u7847 n Supabase):   node c3h-print-agent.js --test\
   Ch\uc0\u7841 y th\u7853 t:                              node c3h-print-agent.js\
   C\uc0\u7845 u h\'ecnh: s\u7917 a kh\u7889 i CONFIG b\'ean d\u432 \u7899 i, ho\u7863 c \u273 \u7863 t bi\u7871 n m\'f4i tr\u432 \u7901 ng c\'f9ng t\'ean (PRINTER_IP, AGENT_USER, AGENT_PASS...).\
   ===================================================================== */\
const net = require("net");\
\
const CONFIG = \{\
  PRINTER_IP: process.env.PRINTER_IP || "192.168.1.100",         // <-- IP t\uc0\u297 nh c\u7911 a m\'e1y in bill\
  PRINTER_PORT: Number(process.env.PRINTER_PORT || 9100),\
  SUPABASE_URL: process.env.SUPABASE_URL || "https://jtegdsliizbssugentox.supabase.co",\
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZWdkc2xpaXpic3N1Z2VudG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMzg1OTAsImV4cCI6MjEwNTcxNDU5MH0.DlmPySH2sn709Rkd1EaNnKVplB94gdkgyCgOFBLnYnk",\
  EMAIL_DOMAIN: process.env.EMAIL_DOMAIN || "giatsaycau3hoang.com",   // ph\uc0\u7843 i gi\u7889 ng AUTH_EMAIL_DOMAIN trong index.html\
  AGENT_USER: process.env.AGENT_USER || "maypos",                 // t\'ean \uc0\u273 \u259 ng nh\u7853 p c\u7911 a t\'e0i kho\u7843 n nh\'e2n vi\'ean d\'e0nh ri\'eang cho m\'e1y POS\
  AGENT_PASS: process.env.AGENT_PASS || "",                       // <-- m\uc0\u7853 t kh\u7849 u c\u7911 a t\'e0i kho\u7843 n \u273 \'f3\
  POLL_MS: Number(process.env.POLL_MS || 2000),\
  MAX_ATTEMPTS: 3,\
\};\
\
const log = (...a) => console.log(new Date().toLocaleTimeString("vi-VN"), ...a);\
\
// ---------- G\uc0\u7917 i byte t\u7899 i m\'e1y in ----------\
function sendToPrinter(buf, ip = CONFIG.PRINTER_IP, port = CONFIG.PRINTER_PORT) \{\
  return new Promise((resolve, reject) => \{\
    const sock = new net.Socket();\
    let done = false;\
    const finish = (err) => \{ if (done) return; done = true; sock.destroy(); err ? reject(err) : resolve(); \};\
    sock.setTimeout(10000, () => finish(new Error(`H\uc0\u7871 t th\u7901 i gian ch\u7901  m\'e1y in $\{ip\}:$\{port\}`)));\
    sock.on("error", (e) => finish(new Error(`Kh\'f4ng k\uc0\u7871 t n\u7889 i \u273 \u432 \u7907 c m\'e1y in $\{ip\}:$\{port\} ($\{e.code || e.message\})`)));\
    sock.connect(port, ip, () => \{\
      sock.write(buf, (err) => \{\
        if (err) return finish(err);\
        // ch\uc0\u7901  m\'e1y in nh\u7853 n h\u7871 t d\u7919  li\u7879 u r\u7891 i m\u7899 i \u273 \'f3ng\
        sock.end();\
        sock.on("close", () => finish());\
        setTimeout(() => finish(), 3000);\
      \});\
    \});\
  \});\
\}\
\
// ---------- Ch\uc0\u7871  \u273 \u7897  in th\u7917  ----------\
async function testPrint() \{\
  const text = Buffer.from("\\n*** IN THU C3H ***\\nMay in hoat dong tot\\n\\n", "ascii");\
  const buf = Buffer.concat([Buffer.from([0x1b, 0x40]), text, Buffer.from([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00])]);\
  log(`In th\uc0\u7917  t\u7899 i $\{CONFIG.PRINTER_IP\}:$\{CONFIG.PRINTER_PORT\} ...`);\
  await sendToPrinter(buf);\
  log("\uc0\u272 \'e3 g\u7917 i. N\u7871 u gi\u7845 y ra d\'f2ng 'IN THU C3H' l\'e0 m\'e1y in v\'e0 IP \u273 \'fang.");\
\}\
\
// ---------- \uc0\u272 \u259 ng nh\u7853 p Supabase ----------\
let session = null; // \{access_token, refresh_token, exp\}\
async function authCall(grant, body) \{\
  const res = await fetch(`$\{CONFIG.SUPABASE_URL\}/auth/v1/token?grant_type=$\{grant\}`, \{\
    method: "POST",\
    headers: \{ apikey: CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" \},\
    body: JSON.stringify(body),\
  \});\
  const j = await res.json().catch(() => (\{\}));\
  if (!res.ok) \{ const e = new Error(j.msg || j.error_description || j.error_code || ("l\uc0\u7895 i " + res.status)); e.status = res.status; throw e; \}\
  session = \{ access_token: j.access_token, refresh_token: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 \};\
\}\
async function login() \{\
  if (!CONFIG.AGENT_PASS) throw new Error("Ch\uc0\u432 a \u273 \u7863 t m\u7853 t kh\u7849 u AGENT_PASS cho t\'e0i kho\u7843 n " + CONFIG.AGENT_USER);\
  const email = CONFIG.AGENT_USER.includes("@") ? CONFIG.AGENT_USER : `$\{CONFIG.AGENT_USER.toLowerCase()\}@$\{CONFIG.EMAIL_DOMAIN\}`;\
  await authCall("password", \{ email, password: CONFIG.AGENT_PASS \});\
  log("\uc0\u272 \'e3 \u273 \u259 ng nh\u7853 p Supabase v\u7899 i t\'e0i kho\u7843 n", CONFIG.AGENT_USER);\
\}\
async function token() \{\
  if (!session) await login();\
  else if (Date.now() > session.exp - 120000) \{\
    try \{ await authCall("refresh_token", \{ refresh_token: session.refresh_token \}); \}\
    catch (e) \{ session = null; await login(); \}\
  \}\
  return session.access_token;\
\}\
async function rest(path, opts = \{\}) \{\
  const run = async () => fetch(`$\{CONFIG.SUPABASE_URL\}/rest/v1/$\{path\}`, \{\
    ...opts,\
    headers: \{ apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: "Bearer " + (await token()), "Content-Type": "application/json", ...(opts.headers || \{\}) \},\
  \});\
  let res = await run();\
  if (res.status === 401) \{ session = null; res = await run(); \}\
  return res;\
\}\
\
// ---------- X\uc0\u7917  l\'fd h\'e0ng \u273 \u7907 i ----------\
async function patch(id, filter, fields) \{\
  const res = await rest(`c3h_print_jobs?id=eq.$\{id\}$\{filter\}`, \{ method: "PATCH", headers: \{ Prefer: "return=representation" \}, body: JSON.stringify(fields) \});\
  if (!res.ok) throw new Error("PATCH " + res.status + " " + (await res.text()).slice(0, 150));\
  return res.json();\
\}\
async function processOne(job) \{\
  // "gi\'e0nh" l\uc0\u7879 nh: ch\u7881  th\'e0nh c\'f4ng n\u7871 u n\'f3 v\u7851 n c\'f2n pending (ph\'f2ng 2 m\'e1y c\'f9ng ch\u7841 y ch\u432 \u417 ng tr\'ecnh)\
  const claimed = await patch(job.id, "&status=eq.pending", \{ status: "printing", claimed_at: new Date().toISOString(), attempts: (job.attempts || 0) + 1 \});\
  if (!claimed.length) return;\
  const attempts = claimed[0].attempts;\
  try \{\
    const bytes = Buffer.from(job.payload || "", "base64");\
    if (!bytes.length) throw new Error("L\uc0\u7879 nh in r\u7895 ng");\
    await sendToPrinter(bytes);\
    await patch(job.id, "", \{ status: "done", printed_at: new Date().toISOString(), payload: "", error: null \});\
    log(`\uc0\u9989  \u272 \'e3 in \u273 \u417 n $\{job.order_code || job.id\} ($\{bytes.length\} byte)`);\
  \} catch (e) \{\
    const final = attempts >= CONFIG.MAX_ATTEMPTS;\
    log(`\uc0\u9888 \u65039  In l\u7895 i (l\u7847 n $\{attempts\}/$\{CONFIG.MAX_ATTEMPTS\}):`, e.message);\
    await patch(job.id, "", \{ status: final ? "error" : "pending", error: e.message \}).catch(() => \{\});\
    if (!final) await new Promise((r) => setTimeout(r, 2000));\
  \}\
\}\
async function tick() \{\
  // l\uc0\u7879 nh k\u7865 t \u7903  'printing' qu\'e1 60 gi\'e2y (ch\u432 \u417 ng tr\'ecnh b\u7883  t\u7855 t gi\u7919 a ch\u7915 ng) th\'ec cho v\u7873  pending\
  const stale = new Date(Date.now() - 60000).toISOString();\
  await rest(`c3h_print_jobs?status=eq.printing&claimed_at=lt.$\{encodeURIComponent(stale)\}`, \{ method: "PATCH", body: JSON.stringify(\{ status: "pending" \}) \}).catch(() => \{\});\
  const res = await rest("c3h_print_jobs?status=eq.pending&order=id.asc&limit=5&select=id,order_code,payload,attempts");\
  if (!res.ok) throw new Error("\uc0\u272 \u7885 c h\'e0ng \u273 \u7907 i l\u7895 i " + res.status + ": " + (await res.text()).slice(0, 150));\
  const jobs = await res.json();\
  for (const j of jobs) await processOne(j);\
\}\
async function main() \{\
  if (process.argv.includes("--test")) \{ await testPrint(); return; \}\
  log(`Ch\uc0\u432 \u417 ng tr\'ecnh in C3H ch\u7841 y. M\'e1y in: $\{CONFIG.PRINTER_IP\}:$\{CONFIG.PRINTER_PORT\}. B\u7845 m Ctrl+C \u273 \u7875  d\u7915 ng.`);\
  let lastErr = "";\
  for (;;) \{\
    try \{ await tick(); lastErr = ""; \}\
    catch (e) \{ if (e.message !== lastErr) log("\uc0\u9888 \u65039 ", e.message); lastErr = e.message; if (/Ch\u432 a \u273 \u7863 t m\u7853 t kh\u7849 u/.test(e.message)) process.exit(1); \}\
    await new Promise((r) => setTimeout(r, CONFIG.POLL_MS));\
  \}\
\}\
main().catch((e) => \{ console.error("L\uc0\u7894 I:", e.message); process.exit(1); \});}