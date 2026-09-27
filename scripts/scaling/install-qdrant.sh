#!/bin/sh
# Run on the authorized cloud host after its capacity upgrade, never locally.
set -eu
stage=${1:-}
case "$stage" in dev) port=7336 ;; prod) port=7337 ;; *) echo 'Usage: install-qdrant.sh dev|prod' >&2; exit 2 ;; esac
[ "$(id -u)" = 0 ] || { echo 'Run as root on the cloud host.' >&2; exit 1; }
[ "$(uname -m)" = x86_64 ] || { echo 'This pinned artifact requires x86_64.' >&2; exit 1; }
mem_kib=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
[ "$mem_kib" -ge 3000000 ] || { echo 'Use at least a 4 GB host before activating search alongside this app.' >&2; exit 1; }
version=1.19.1
sha256=eef986e769d4d3e806dd2d546e1b4ecdd416211e54d34b4ed764fac7c58e1085
workdir=$(mktemp -d)
trap 'rm -r "$workdir"' EXIT
curl --fail --location --proto '=https' --tlsv1.2 "https://github.com/qdrant/qdrant/releases/download/v${version}/qdrant-x86_64-unknown-linux-gnu.tar.gz" -o "$workdir/qdrant.tgz"
printf '%s  %s\n' "$sha256" "$workdir/qdrant.tgz" | sha256sum --check --status
tar -xzf "$workdir/qdrant.tgz" -C "$workdir"
install -m 755 "$workdir/qdrant" "/usr/local/bin/newdrugs-qdrant-${version}"
id "newdrugs-search-${stage}" >/dev/null 2>&1 || useradd --system --home-dir "/var/lib/newdrugs-search/${stage}" --shell /usr/sbin/nologin "newdrugs-search-${stage}"
install -d -m 700 -o "newdrugs-search-${stage}" -g "newdrugs-search-${stage}" "/var/lib/newdrugs-search/${stage}"
install -d -m 711 /etc/newdrugs-search
python3 - "$stage" <<'PY'
import os,pathlib,secrets,sys
path=pathlib.Path('/etc/newdrugs-search/'+sys.argv[1]+'.env')
if not path.exists():
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as file:file.write('QDRANT__SERVICE__API_KEY='+secrets.token_hex(32)+'\n')
PY
cat > "/etc/newdrugs-search/${stage}.yaml" <<YAML
log_level: WARN
telemetry_disabled: true
storage:
  storage_path: /var/lib/newdrugs-search/${stage}/storage
  snapshots_path: /var/lib/newdrugs-search/${stage}/snapshots
  performance:
    max_search_threads: 1
service:
  host: 127.0.0.1
  http_port: ${port}
  grpc_port: null
  max_workers: 1
  max_request_size_mb: 8
YAML
chown "root:newdrugs-search-${stage}" "/etc/newdrugs-search/${stage}.yaml"
chmod 640 "/etc/newdrugs-search/${stage}.yaml"
cat > /etc/systemd/system/newdrugs-search@.service <<UNIT
[Unit]
Description=New Drugs persistent search (%i)
After=network-online.target
[Service]
User=newdrugs-search-%i
Group=newdrugs-search-%i
WorkingDirectory=/var/lib/newdrugs-search/%i
EnvironmentFile=/etc/newdrugs-search/%i.env
ExecStart=/usr/local/bin/newdrugs-qdrant-${version} --config-path /etc/newdrugs-search/%i.yaml
Restart=on-failure
RestartSec=3
MemoryHigh=640M
MemoryMax=768M
CPUQuota=100%
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/newdrugs-search/%i
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now "newdrugs-search@${stage}"
python3 - "$stage" "$port" <<'PY'
import pathlib,sys,time,urllib.request
secret=pathlib.Path('/etc/newdrugs-search/'+sys.argv[1]+'.env').read_text().strip().split('=',1)[1]
for attempt in range(30):
    try:
        request=urllib.request.Request('http://127.0.0.1:'+sys.argv[2]+'/healthz',headers={'api-key':secret})
        with urllib.request.urlopen(request,timeout=2) as response:
            if response.status==200: print('Search service healthy. App activation is a separate step.');break
    except Exception:
        if attempt==29: raise SystemExit('Search service did not become healthy.')
        time.sleep(1)
PY
