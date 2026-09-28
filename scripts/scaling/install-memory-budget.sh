#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 && -f /etc/newdrugs/prod.env ]] || exit 1
# All six app/search processes share one ceiling. Mongo remains outside this
# slice with its existing 500 MB ceiling; reserve the rest for nginx and the OS.
cat > /etc/systemd/system/newdrugs.slice <<'UNIT'
[Unit]
Description=New Drugs app and search memory budget
[Slice]
MemoryHigh=2304M
MemoryMax=2816M
MemorySwapMax=0
UNIT
for stage in dev prod; do
  if [[ $stage == prod ]]; then web=512; worker=512; search=640; else web=384; worker=384; search=384; fi
  for kind in web worker search; do
    case $kind in web) unit="newdrugs@$stage"; max=$web;; worker) unit="newdrugs-worker@$stage"; max=$worker;; search) unit="newdrugs-search@$stage"; max=$search;; esac
    install -d -m 755 "/etc/systemd/system/$unit.service.d"
    cat > "/etc/systemd/system/$unit.service.d/zz-budget.conf" <<UNIT
[Service]
Slice=newdrugs.slice
MemoryHigh=$((max * 3 / 4))M
MemoryMax=${max}M
MemorySwapMax=0
UNIT
  done
done
systemctl daemon-reload
echo 'Memory budgets installed. Apply with the selected stage activation; no services restarted.'
