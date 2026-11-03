#!/usr/bin/env bash
# Optional: sign the plugin so Grayjay doesn't warn about an unsigned script.
# Usage: ./sign.sh   (needs openssl, python3)
set -euo pipefail
cd "$(dirname "$0")"
SCRIPT=ToonamiAftermathScript.js
CONFIG=ToonamiAftermathConfig.json

[ -f signing_key.pem ] || openssl genrsa -out signing_key.pem 2048
PUB=$(openssl rsa -in signing_key.pem -pubout -outform DER 2>/dev/null | base64 -w0)
SIG=$(openssl dgst -sha512 -sign signing_key.pem "$SCRIPT" | base64 -w0)

python3 - "$CONFIG" "$PUB" "$SIG" <<'EOF'
import json, sys
path, pub, sig = sys.argv[1:4]
cfg = json.load(open(path))
cfg["scriptPublicKey"] = pub
cfg["scriptSignature"] = sig
json.dump(cfg, open(path, "w"), indent=2)
open(path, "a").write("\n")
EOF
echo "Signed. Re-run after every change to $SCRIPT. Keep signing_key.pem private."
