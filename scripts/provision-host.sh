#!/usr/bin/env bash
set -euo pipefail
# Run on the designated New Drugs Ubuntu host as root. Does not touch other app roots.
test "$(id -u)" = 0
test "$(. /etc/os-release; printf '%s' "$VERSION_ID")" = 24.04
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg xz-utils g++ make python3 nginx certbot python3-certbot-nginx ffmpeg
if ! command -v node >/dev/null; then
  nd_install_dir=$(mktemp -d)
  cd "$nd_install_dir"
  curl -fsSLO https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
  nd_node_archive=$(awk '$2 ~ /^node-v24\..*-linux-x64.tar.xz$/ { print $2 }' SHASUMS256.txt)
  test -n "$nd_node_archive"
  curl -fsSLO "https://nodejs.org/dist/latest-v24.x/$nd_node_archive"
  awk -v archive="$nd_node_archive" '$2 == archive' SHASUMS256.txt | sha256sum -c -
  mkdir -p /opt/newdrugs-node
  tar -xf "$nd_node_archive" -C /opt/newdrugs-node --strip-components=1
  ln -s /opt/newdrugs-node/bin/node /usr/local/bin/node
  ln -s /opt/newdrugs-node/bin/npm /usr/local/bin/npm
  ln -s /opt/newdrugs-node/bin/npx /usr/local/bin/npx
  cd /
  rm -rf "$nd_install_dir"
fi
if ! command -v mongod >/dev/null; then
  curl -fsSL https://pgp.mongodb.com/server-8.0.asc -o /tmp/newdrugs-mongodb.asc
  gpg --dearmor --yes -o /usr/share/keyrings/newdrugs-mongodb.gpg /tmp/newdrugs-mongodb.asc
  printf '%s\n' 'deb [arch=amd64 signed-by=/usr/share/keyrings/newdrugs-mongodb.gpg] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse' > /etc/apt/sources.list.d/newdrugs-mongodb.list
  apt-get update -qq
  apt-get install -y -qq mongodb-org-server mongodb-mongosh
fi
if ! swapon --show --noheadings | read -r _; then
  if ! test -e /newdrugs.swap; then
    fallocate -l 1G /newdrugs.swap
    chmod 600 /newdrugs.swap
    mkswap /newdrugs.swap
  fi
  swapon /newdrugs.swap
  if ! grep -q '^/newdrugs.swap ' /etc/fstab; then printf '%s\n' '/newdrugs.swap none swap sw 0 0' >> /etc/fstab; fi
fi
for nd_instance in prod dev; do
  id "newdrugs-$nd_instance" >/dev/null 2>&1 || useradd --system --home "/srv/newdrugs/$nd_instance" --shell /usr/sbin/nologin "newdrugs-$nd_instance"
  install -d -m 755 "/srv/newdrugs/$nd_instance/releases"
  install -d -m 700 -o "newdrugs-$nd_instance" -g "newdrugs-$nd_instance" "/var/lib/newdrugs/$nd_instance"
done
install -d -m 700 /etc/newdrugs
install -d -m 750 -o mongodb -g mongodb /var/lib/newdrugs/mongo
install -d -m 755 /var/www/newdrugs-acme
node --version
mongod --version | head -n 1
