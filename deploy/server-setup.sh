#!/usr/bin/env bash
# One-time (idempotent) preparation of a fresh Ubuntu 22.04 / 24.04 server for CaratFlow.
# Run as root:
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/deploy/server-setup.sh -o server-setup.sh
#   sudo DEPLOY_PUBKEY="ssh-ed25519 AAAA... caratflow-deploy" bash server-setup.sh
#
# What it does: installs Docker Engine + compose plugin (Docker's apt repo), creates a
# non-root `deploy` user (docker group, key-only), creates /opt/caratflow, enables UFW
# (22/80/443 only) and unattended security upgrades, and installs the daily backup cron.
# It does NOT touch your SSH daemon config: harden it yourself per docs/DEPLOYMENT-DOCKER.md.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
. /etc/os-release
case "${ID:-}" in ubuntu) ;; *) echo "this script supports Ubuntu only (found ${ID:-unknown})" >&2; exit 1;; esac

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/caratflow}"
SSH_PORT="${SSH_PORT:-22}"
DEPLOY_PUBKEY="${DEPLOY_PUBKEY:-}"
export DEBIAN_FRONTEND=noninteractive

echo "==> base packages"
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw unattended-upgrades cron

echo "==> Docker Engine + compose plugin"
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> user '$DEPLOY_USER'"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "CaratFlow deploy" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh"
touch "$home/.ssh/authorized_keys"
chmod 600 "$home/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$home/.ssh/authorized_keys"
if [ -n "$DEPLOY_PUBKEY" ]; then
  grep -qxF "$DEPLOY_PUBKEY" "$home/.ssh/authorized_keys" || echo "$DEPLOY_PUBKEY" >> "$home/.ssh/authorized_keys"
  echo "    public key installed"
else
  echo "    DEPLOY_PUBKEY not set: add the deploy public key to $home/.ssh/authorized_keys yourself"
fi

echo "==> $APP_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/backups"

echo "==> firewall (UFW: $SSH_PORT, 80, 443)"
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT"/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp   # HTTP/3
ufw --force enable
# Note: ports published by Docker bypass UFW. The stack publishes only Caddy's 80/443.

echo "==> unattended security upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

echo "==> daily backup cron (02:30 server time, as $DEPLOY_USER)"
cat > /etc/cron.d/caratflow-backup <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 2 * * * $DEPLOY_USER [ -x $APP_DIR/backup.sh ] && $APP_DIR/backup.sh >> $APP_DIR/backups/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/caratflow-backup

echo
echo "Server is ready. Next: create $APP_DIR/.env (see docs/DEPLOYMENT-DOCKER.md), add the GitHub"
echo "secrets/variables, then run the 'Deploy' workflow."
