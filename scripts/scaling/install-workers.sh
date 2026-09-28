#!/usr/bin/env bash
set -euo pipefail
stage=${1:-}
[[ $stage == dev || $stage == prod ]] || { echo 'Choose dev or prod.' >&2; exit 1; }
[[ $(id -u) == 0 ]] || { echo 'Run on the approved New Drugs host as root.' >&2; exit 1; }
[[ -f /etc/newdrugs/$stage.env && -d /srv/newdrugs/$stage/current ]] || exit 1
cat > /etc/systemd/system/newdrugs-worker@.service <<'UNIT'
[Unit]
Description=New Drugs %i background worker
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=newdrugs-%i
Group=newdrugs-%i
WorkingDirectory=/srv/newdrugs/%i/current
EnvironmentFile=/etc/newdrugs/%i.env
ExecStart=/usr/bin/env PROCESS_ROLE=worker /usr/local/bin/node --max-old-space-size=256 dist/server/index.js
Restart=always
RestartSec=3
TimeoutStopSec=25
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/newdrugs/%i
MemoryHigh=512M
MemoryMax=640M
CPUWeight=50
Nice=5
[Install]
WantedBy=multi-user.target
UNIT
install -d -m 755 "/etc/systemd/system/newdrugs@$stage.service.d"
cat > "/etc/systemd/system/newdrugs@$stage.service.d/roles.conf" <<'UNIT'
[Service]
ExecStart=
ExecStart=/usr/bin/env PROCESS_ROLE=web /usr/local/bin/node --max-old-space-size=256 dist/server/index.js
MemoryHigh=384M
MemoryMax=512M
UNIT
systemctl daemon-reload
# Existing durable run leases survive the brief handoff.
systemctl restart "newdrugs@$stage"
systemctl enable --now "newdrugs-worker@$stage"
systemctl is-active "newdrugs@$stage" "newdrugs-worker@$stage"
