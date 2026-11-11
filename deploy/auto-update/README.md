# Optional: automatic updates

Playbill doesn't update itself. If you'd like it to, without a third-party updater, this systemd
timer pulls the image your compose file names every 10 minutes. It restarts the container only when
the image changed, then waits for `/api/health` to report the new revision.

```bash
sudo install -m 755 playbill-update.sh /usr/local/sbin/
sudo install -m 644 playbill-update.service playbill-update.timer /etc/systemd/system/
sudo systemctl edit playbill-update.service   # set PLAYBILL_COMPOSE_DIR if not /opt/playbill
sudo systemctl daemon-reload && sudo systemctl enable --now playbill-update.timer
journalctl -u playbill-update -n 20           # what it did
```

- Track `:latest` for releases only, or `:edge` for every commit to `main`.
- To roll back, set `image:` to a `sha-<commit>` tag; the timer then has nothing newer to pull.
