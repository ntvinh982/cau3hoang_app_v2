#!/usr/bin/env node
/* =====================================================================
   c3h-print-agent.js — chạy trên MÁY POS Android trong tiệm (qua Termux).
   Việc làm: cứ 2 giây hỏi Supabase xem có lệnh in mới không; có thì gửi tới máy in qua mạng LAN (IP:9100).
   Chạy thử máy in (không cần Supabase):   node c3h-print-agent.js --test
   Chạy thật:                              node c3h-print-agent.js
   Cấu hình: sửa khối CONFIG bên dưới, hoặc đặt biến môi trường cùng tên (PRINTER_IP, AGENT_USER, AGENT_PASS...).
   ===================================================================== */
const net = require("net");

const CONFIG = {
  PRINTER_IP: process.env.PRINTER_IP || "192.168.1.100",         // <-- IP tĩnh của máy in bill
  PRINTER_PORT: Number(process.env.PRINTER_PORT || 9100),
  SUPABASE_URL: process.env.SUPABASE_URL || "https://jtegdsliizbssugentox.supabase.co",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZWdkc2xpaXpic3N1Z2VudG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMzg1OTAsImV4cCI6MjEwNTcxNDU5MH0.DlmPySH2sn709Rkd1EaNnKVplB94gdkgyCgOFBLnYnk",
  EMAIL_DOMAIN: process.env.EMAIL_DOMAIN || "giatsaycau3hoang.com",   // phải giống AUTH_EMAIL_DOMAIN trong index.html
  AGENT_USER: process.env.AGENT_USER || "maypos",                 // tên đăng nhập của tài khoản nhân viên dành riêng cho máy POS
  AGENT_PASS: process.env.AGENT_PASS || "",                       // <-- mật khẩu của tài khoản đó
  POLL_MS: Number(process.env.POLL_MS || 2000),
  MAX_ATTEMPTS: 3,
};

const log = (...a) => console.log(new Date().toLocaleTimeString("vi-VN"), ...a);

// ---------- Gửi byte tới máy in ----------
function sendToPrinter(buf, ip = CONFIG.PRINTER_IP, port = CONFIG.PRINTER_PORT) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (err) => { if (done) return; done = true; sock.destroy(); err ? reject(err) : resolve(); };
    sock.setTimeout(10000, () => finish(new Error(`Hết thời gian chờ máy in ${ip}:${port}`)));
    sock.on("error", (e) => finish(new Error(`Không kết nối được máy in ${ip}:${port} (${e.code || e.message})`)));
    sock.connect(port, ip, () => {
      sock.write(buf, (err) => {
        if (err) return finish(err);
        // chờ máy in nhận hết dữ liệu rồi mới đóng
        sock.end();
        sock.on("close", () => finish());
        setTimeout(() => finish(), 3000);
      });
    });
  });
}

// ---------- Chế độ in thử ----------
async function testPrint() {
  const text = Buffer.from("\n*** IN THU C3H ***\nMay in hoat dong tot\n\n", "ascii");
  const buf = Buffer.concat([Buffer.from([0x1b, 0x40]), text, Buffer.from([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00])]);
  log(`In thử tới ${CONFIG.PRINTER_IP}:${CONFIG.PRINTER_PORT} ...`);
  await sendToPrinter(buf);
  log("Đã gửi. Nếu giấy ra dòng 'IN THU C3H' là máy in và IP đúng.");
}

// ---------- Đăng nhập Supabase ----------
let session = null; // {access_token, refresh_token, exp}
async function authCall(grant, body) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.msg || j.error_description || j.error_code || ("lỗi " + res.status)); e.status = res.status; throw e; }
  session = { access_token: j.access_token, refresh_token: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
}
async function login() {
  if (!CONFIG.AGENT_PASS) throw new Error("Chưa đặt mật khẩu AGENT_PASS cho tài khoản " + CONFIG.AGENT_USER);
  const email = CONFIG.AGENT_USER.includes("@") ? CONFIG.AGENT_USER : `${CONFIG.AGENT_USER.toLowerCase()}@${CONFIG.EMAIL_DOMAIN}`;
  await authCall("password", { email, password: CONFIG.AGENT_PASS });
  log("Đã đăng nhập Supabase với tài khoản", CONFIG.AGENT_USER);
}
async function token() {
  if (!session) await login();
  else if (Date.now() > session.exp - 120000) {
    try { await authCall("refresh_token", { refresh_token: session.refresh_token }); }
    catch (e) { session = null; await login(); }
  }
  return session.access_token;
}
async function rest(path, opts = {}) {
  const run = async () => fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: "Bearer " + (await token()), "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  let res = await run();
  if (res.status === 401) { session = null; res = await run(); }
  return res;
}

// ---------- Xử lý hàng đợi ----------
async function patch(id, filter, fields) {
  const res = await rest(`c3h_print_jobs?id=eq.${id}${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(fields) });
  if (!res.ok) throw new Error("PATCH " + res.status + " " + (await res.text()).slice(0, 150));
  return res.json();
}
async function processOne(job) {
  // "giành" lệnh: chỉ thành công nếu nó vẫn còn pending (phòng 2 máy cùng chạy chương trình)
  const claimed = await patch(job.id, "&status=eq.pending", { status: "printing", claimed_at: new Date().toISOString(), attempts: (job.attempts || 0) + 1 });
  if (!claimed.length) return;
  const attempts = claimed[0].attempts;
  try {
    const bytes = Buffer.from(job.payload || "", "base64");
    if (!bytes.length) throw new Error("Lệnh in rỗng");
    await sendToPrinter(bytes);
    await patch(job.id, "", { status: "done", printed_at: new Date().toISOString(), payload: "", error: null });
    log(`✅ Đã in đơn ${job.order_code || job.id} (${bytes.length} byte)`);
  } catch (e) {
    const final = attempts >= CONFIG.MAX_ATTEMPTS;
    log(`⚠️ In lỗi (lần ${attempts}/${CONFIG.MAX_ATTEMPTS}):`, e.message);
    await patch(job.id, "", { status: final ? "error" : "pending", error: e.message }).catch(() => {});
    if (!final) await new Promise((r) => setTimeout(r, 2000));
  }
}
async function tick() {
  // lệnh kẹt ở 'printing' quá 60 giây (chương trình bị tắt giữa chừng) thì cho về pending
  const stale = new Date(Date.now() - 60000).toISOString();
  await rest(`c3h_print_jobs?status=eq.printing&claimed_at=lt.${encodeURIComponent(stale)}`, { method: "PATCH", body: JSON.stringify({ status: "pending" }) }).catch(() => {});
  const res = await rest("c3h_print_jobs?status=eq.pending&order=id.asc&limit=5&select=id,order_code,payload,attempts");
  if (!res.ok) throw new Error("Đọc hàng đợi lỗi " + res.status + ": " + (await res.text()).slice(0, 150));
  const jobs = await res.json();
  for (const j of jobs) await processOne(j);
}
async function main() {
  if (process.argv.includes("--test")) { await testPrint(); return; }
  log(`Chương trình in C3H chạy. Máy in: ${CONFIG.PRINTER_IP}:${CONFIG.PRINTER_PORT}. Bấm Ctrl+C để dừng.`);
  let lastErr = "";
  for (;;) {
    try { await tick(); lastErr = ""; }
    catch (e) { if (e.message !== lastErr) log("⚠️", e.message); lastErr = e.message; if (/Chưa đặt mật khẩu/.test(e.message)) process.exit(1); }
    await new Promise((r) => setTimeout(r, CONFIG.POLL_MS));
  }
}
main().catch((e) => { console.error("LỖI:", e.message); process.exit(1); });
