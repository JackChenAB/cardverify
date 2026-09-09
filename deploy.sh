#!/usr/bin/env bash
# Deploy cardverify to a remote Docker host over SSH (build on remote).
# No local Docker required. Source code is rsync'd/tar'd to the remote and
# `docker compose up -d --build` runs there.
#
# Usage:
#   REMOTE_PW='<ssh+sudo password>' ./deploy.sh [user@host] [remote_dir] [http_port]
# Defaults: smallab@192.168.68.5  /docker/verify  8080
#
# Requires locally: ssh, tar, node (only the first time, to mint prod.env).
# Requires on remote: docker + compose v2; sudo (user in sudoers).
set -euo pipefail

REMOTE="${1:-smallab@192.168.68.5}"
REMOTE_DIR="${2:-/opt/stacks/verify}"   # Dockge's stacks dir, so Dockge manages it
HTTP_PORT="${3:-8080}"
HOST="${REMOTE#*@}"
RUSER="${REMOTE%@*}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if [[ -z "${REMOTE_PW:-}" ]]; then
  echo "ERROR: set REMOTE_PW env var (SSH + sudo password)." >&2
  exit 1
fi

# --- password-driven ssh without sshpass (OpenSSH 8.4+ askpass) -------------
ASKPASS="$(mktemp)"; printf '#!/bin/sh\necho "$REMOTE_PW"\n' > "$ASKPASS"; chmod 700 "$ASKPASS"
trap 'rm -f "$ASKPASS"' EXIT
rsh() { SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY=:0 REMOTE_PW="$REMOTE_PW" \
        setsid -w ssh -o StrictHostKeyChecking=no "$REMOTE" "$@"; }

# --- 1. ensure prod.env (fresh secrets first time, reused after) ------------
if [[ ! -f prod.env ]]; then
  echo "[deploy] generating prod.env (keep it — keys must stay stable)"
  node -e '
    const {randomBytes,generateKeyPairSync}=require("crypto"),fs=require("fs");
    const pw=n=>randomBytes(n).toString("base64").replace(/[^a-zA-Z0-9]/g,"").slice(0,n);
    const {privateKey,publicKey}=generateKeyPairSync("ed25519");
    const b=k=>Buffer.from(k.export({type:k===privateKey?"pkcs8":"spki",format:"pem"}).toString()).toString("base64");
    fs.writeFileSync("prod.env",`POSTGRES_USER=cardverify
POSTGRES_PASSWORD=${pw(20)}
POSTGRES_DB=cardverify
HTTP_PORT='"$HTTP_PORT"'
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${pw(14)}
APP_SECRET=${randomBytes(32).toString("hex")}
JWT_SECRET=${randomBytes(32).toString("hex")}
JWT_EXPIRES_IN=12h
ED25519_PRIVATE_KEY=${b(privateKey)}
ED25519_PUBLIC_KEY=${b(publicKey)}
`);fs.chmodSync("prod.env",0o600);console.log("admin password:",/ADMIN_PASSWORD=(.+)/.exec(fs.readFileSync("prod.env","utf8"))[1]);'
fi

# --- 2. prepare remote dir --------------------------------------------------
echo "[deploy] preparing $REMOTE_DIR on $REMOTE"
rsh "echo '$REMOTE_PW' | sudo -S sh -c 'mkdir -p $REMOTE_DIR && chown -R $RUSER:$RUSER $REMOTE_DIR'"

# --- 3. ship source + .env + compose.yaml (single tar stream) ---------------
echo "[deploy] uploading project..."
tar czf - \
  --exclude='./.git' --exclude='*/node_modules' --exclude='*/dist' \
  --exclude='./backend/.pgdata' --exclude='*.local' --exclude='*/coverage' \
  --exclude='./prod.env' --exclude='./backend/.env' \
  ./backend ./frontend ./docker-compose.yml ./client-example ./README.md \
  | rsh "tar xzf - -C $REMOTE_DIR"
# compose.yaml so Dockge recognizes the stack; .env for compose.
cat prod.env | rsh "cat > $REMOTE_DIR/.env"
# Dockge recognizes compose.yaml; keep a single file (no docker-compose.yml dup).
rsh "mv -f $REMOTE_DIR/docker-compose.yml $REMOTE_DIR/compose.yaml"

# --- 4. build + start on remote --------------------------------------------
echo "[deploy] docker compose up -d --build (first build can take a few min)"
rsh "cd $REMOTE_DIR && echo '$REMOTE_PW' | sudo -S docker compose up -d --build"
rsh "cd $REMOTE_DIR && echo '$REMOTE_PW' | sudo -S docker compose ps"

echo "[deploy] done -> http://$HOST:$HTTP_PORT"
