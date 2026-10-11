#!/bin/zsh
# Stores your Meta WhatsApp secrets in functions/.secret.local (never committed).
# Typing is hidden. Run from the project folder:  zsh scripts/wa-secrets.sh
cd "$(dirname "$0")/.."
read -s "TOKEN?Paste the WhatsApp access token, then press Enter: "; echo
read -s "APPSECRET?Paste the App secret (App settings → Basic), then press Enter: "; echo
VERIFY=$(openssl rand -hex 16)
printf 'WHATSAPP_TOKEN=%s\nWHATSAPP_APP_SECRET=%s\nWHATSAPP_VERIFY_TOKEN=%s\n' "$TOKEN" "$APPSECRET" "$VERIFY" > functions/.secret.local
chmod 600 functions/.secret.local
echo "Saved. Tell Claude: secrets are in."
