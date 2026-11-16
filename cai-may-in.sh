#!/data/data/com.termux/files/usr/bin/bash
# =====================================================================
#  Cài chương trình in bill Cậu 3 Hoàng trên máy POS (Termux) — chạy 1 lần.
#  Cách chạy (trong Termux):
#     B=https://DIA-CHI-APP ; curl -fsSLO $B/cai-may-in.sh && bash cai-may-in.sh $B
#  Mật khẩu chỉ lưu trong máy POS (~/c3h/.env), KHÔNG lưu trong file này.
# =====================================================================
BASE="${1%/}"
if [ -z "$BASE" ]; then echo "Thiếu địa chỉ app. VD: bash cai-may-in.sh https://app.cau3hoang.com"; exit 1; fi
DIR="$HOME/c3h"; mkdir -p "$DIR"

echo; echo "== 1/5 Cài Node.js (lần đầu mất vài phút, cứ để máy chạy) =="
# Luôn nâng cấp đủ bộ thư viện (tránh lỗi "cannot locate symbol ..." khi Node mới hơn thư viện cũ)
if ! node -v >/dev/null 2>&1; then
  yes | pkg upgrade -y || true
  pkg install -y nodejs || { echo "❌ Cài Node.js lỗi. Kiểm tra mạng rồi chạy lại."; exit 1; }
fi
if ! node -v >/dev/null 2>&1; then
  echo "Node.js chưa chạy được, nâng cấp thêm thư viện..."; yes | pkg upgrade -y || true
fi
node -v >/dev/null 2>&1 || { echo "❌ Node.js vẫn lỗi. Chụp màn hình gửi Claude."; exit 1; }
echo "✅ Node.js $(node -v)"

echo; echo "== 2/5 Tải chương trình in =="
if ! curl -fsSL "$BASE/c3h-print-agent.js?v=$(date +%s)" -o "$DIR/c3h-print-agent.js"; then
  echo "❌ Không tải được $BASE/c3h-print-agent.js — kiểm tra đã up file lên GitHub chưa."; exit 1
fi
if head -c 20 "$DIR/c3h-print-agent.js" | grep -q "rtf"; then
  echo "❌ File c3h-print-agent.js trên GitHub bị đổi sang dạng văn bản RTF (do mở/lưu bằng TextEdit)."
  echo "   Upload lại đúng file gốc (không mở ra sửa) rồi chạy lại lệnh cài."; exit 1
fi
if ! node --check "$DIR/c3h-print-agent.js" 2>/dev/null; then
  echo "❌ File c3h-print-agent.js bị hỏng. Upload lại đúng file gốc rồi chạy lại lệnh cài."; exit 1
fi
echo "✅ Đã tải"

echo; echo "== 3/5 Nhập thông tin =="
OLD_IP=""; [ -f "$DIR/.env" ] && OLD_IP=$(. "$DIR/.env"; echo "$PRINTER_IP")
read -r -p "IP máy in${OLD_IP:+ [$OLD_IP]}: " IP; IP=${IP:-$OLD_IP}
while [ -z "$IP" ]; do read -r -p "IP máy in (VD 192.168.1.87): " IP; done
read -r -p "Tên đăng nhập tài khoản máy in [maypos]: " U; U=${U:-maypos}
read -r -s -p "Mật khẩu tài khoản $U (gõ xong bấm Enter, chữ không hiện là bình thường): " P; echo
{ printf 'export PRINTER_IP=%q\n' "$IP"; printf 'export AGENT_USER=%q\n' "$U"; printf 'export AGENT_PASS=%q\n' "$P"; } > "$DIR/.env"
chmod 600 "$DIR/.env"
echo "✅ Đã lưu (chỉ trong máy POS)"

echo; echo "== 4/5 In thử máy in $IP =="
if PRINTER_IP="$IP" node "$DIR/c3h-print-agent.js" --test; then
  echo "👉 Nhìn máy in: có ra tờ 'IN THU C3H' không?"
else
  echo "❌ Không in được tới $IP:9100. Kiểm tra IP máy in, máy POS và máy in cùng mạng. Sửa xong chạy lại lệnh cài."
fi

echo; echo "== 5/5 Cài tự chạy khi mở Termux =="
cat > "$DIR/start-print.sh" <<'EOS'
#!/data/data/com.termux/files/usr/bin/bash
# Chạy chương trình in, tự chạy lại nếu bị dừng. Không sửa file này.
. "$HOME/c3h/.env"
echo $$ > "$HOME/c3h/run.pid"
termux-wake-lock 2>/dev/null
cd "$HOME/c3h"
echo "🖨  Chương trình in Cậu 3 Hoàng đang chạy — ĐỪNG tắt Termux."
while true; do
  node c3h-print-agent.js
  echo "Chương trình dừng, chạy lại sau 5 giây..."
  sleep 5
done
EOS
chmod +x "$DIR/start-print.sh"
MARK="# C3H-tu-chay-may-in"
touch "$HOME/.bashrc"
if ! grep -q "$MARK" "$HOME/.bashrc"; then
  cat >> "$HOME/.bashrc" <<EOB
$MARK
if [ -f "\$HOME/c3h/run.pid" ] && kill -0 "\$(cat "\$HOME/c3h/run.pid")" 2>/dev/null; then
  echo "🖨  Chương trình in đang chạy ở cửa sổ khác."
else
  bash "\$HOME/c3h/start-print.sh"
fi
EOB
fi
echo "✅ Xong. Từ giờ chỉ cần MỞ Termux là chương trình in tự chạy."
echo
echo "Bắt đầu chạy ngay bây giờ..."
exec bash "$DIR/start-print.sh"
