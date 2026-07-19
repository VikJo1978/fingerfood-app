# Fingerfood data backup and restore runbook

## Scope

Runtime backup for Fingerfood operational data under
`/home/viktor/projects/fingerfood-app/backend/app/data/`.

Covers:

- stable online snapshot with JSON/schema validation
- local artifact retention (14 days)
- encrypted offsite upload (GPG + restricted SSH)
- systemd user timer scheduling
- restore validation and production restore sequence

## Authoritative data

| Path | Role |
|---|---|
| `backend/app/data/drafts/*.json` | Local-only operational drafts |
| `backend/app/data/items.json` | Catalog snapshot (also in git; optional in backup) |

Excluded from backup: `/etc/fingerfood-app.env`, `.gitkeep`, secrets, symlinks,
logs, venv, frontend build, repo metadata.

## Paths

| Role | Path |
|---|---|
| Production data | `/home/viktor/projects/fingerfood-app/backend/app/data/` |
| Local backup script | `/home/viktor/fingerfood-runtime/bin/fingerfood-backup.sh` |
| Offsite sender | `/home/viktor/fingerfood-runtime/bin/fingerfood-offsite-backup.sh` |
| Validator | `/home/viktor/fingerfood-runtime/bin/validate-fingerfood-backup.py` |
| Local artifacts | `/home/viktor/fingerfood-runtime/backups/` |
| Encrypted cache | `/home/viktor/fingerfood-runtime/offsite-encrypted-fingerfood/` |
| Shared transport config | `/home/viktor/.config/catering-offsite-backup.env` |
| Fingerfood config | `/home/viktor/.config/fingerfood-offsite-backup.env` |
| Receiver canonical source | `silberloeffel-catering/infra/backup/catering-backup-receive.sh` |
| Active VPS receiver | `/usr/local/sbin/catering-backup-receive` |

Runtime directories should be mode `700`. Local archives mode `600`.

## Local artifact contract

Filename:

```text
fingerfood-YYYYMMDDTHHMMSSZ.tar.gz
```

Layout:

```text
fingerfood-backup/
  items.json
  drafts/
  manifest.txt
  SHA256SUMS
```

## Consistency strategy

`ONLINE SNAPSHOT WITH STABILITY CHECK`

1. Inventory source files with size, mtime ns, SHA256.
2. Reject symlinks and unexpected file types.
3. Copy to staging, validate JSON via `Item` and `SavedOfferDraft`.
4. Second source inventory must match the first (up to 3 attempts).
5. Atomic tar creation with post-listing verification.

The running Fingerfood service is not stopped during normal backup.

## Local retention

After each successful local backup:

- delete strict `fingerfood-*.tar.gz` files older than 14 days
- always keep at least one newest successful artifact
- never delete unknown filenames, `.partial`, directories, or logs

## Encrypted offsite naming

```text
fingerfood-YYYYMMDDTHHMMSSZ.tar.gz.gpg
fingerfood-YYYYMMDDTHHMMSSZ.tar.gz.gpg.sha256
```

Sender verifies the newest local archive before encryption:

- strict filename
- freshness (`FINGERFOOD_OFFSITE_BACKUP_MAX_AGE_SEC`, default 86400)
- required tar members present
- forbidden paths absent
- `SHA256SUMS` and Pydantic validation
- GPG encrypt to temp file, remote `put`, remote `sha256`, sidecar upload, remote `prune`

Local encrypted cache retention: 14 days.

Remote retention on VPS: 30 days, keep newest Fingerfood artifact (receiver-side
`prune_fingerfood_family`).

## Manual local backup

```bash
/home/viktor/fingerfood-runtime/bin/fingerfood-backup.sh
```

## Manual offsite backup

Run only after a successful local backup:

```bash
/home/viktor/fingerfood-runtime/bin/fingerfood-offsite-backup.sh
```

Do not pass secrets on the command line. Config variable names only:

- `CATERING_BACKUP_GPG_RECIPIENT`
- `CATERING_BACKUP_GNUPGHOME`
- `CATERING_BACKUP_SSH_KEY`
- `CATERING_BACKUP_REMOTE_USER`
- `CATERING_BACKUP_REMOTE_HOST`
- `FINGERFOOD_OFFSITE_BACKUP_LOCAL_DIR`
- `FINGERFOOD_OFFSITE_ENCRYPTED_DIR`

## Systemd scheduling

Canonical units:

- `infra/systemd/fingerfood-backup.service`
- `infra/systemd/fingerfood-backup.timer`

Install to `~/.config/systemd/user/` only after review/deploy. Timer window:
`04:00 Europe/Berlin` with `RandomizedDelaySec=5min`, after Courier (~03:40).

Service chain:

```text
fingerfood-backup.sh && fingerfood-offsite-backup.sh
```

Local backup failure blocks offsite step.

## Logs

- local backup: stdout/journal (`fingerfood-backup:` prefix)
- offsite sender: stdout/journal (`fingerfood-offsite-backup:` prefix)
- no draft contents or secret values in logs

Inspect:

```bash
journalctl --user -u fingerfood-backup.service -n 100 --no-pager
```

## Freshness check

```bash
archive=$(ls -1 /home/viktor/fingerfood-runtime/backups/fingerfood-*.tar.gz | sort | tail -1)
test -n "$archive" && stat -c '%y %s %n' "$archive"
find "$archive" -mtime -1 | grep -q . && echo "local backup fresh"
```

## Failure inspection

1. Check exit code and last journal lines.
2. Confirm production data unchanged (`items.json` hash, draft count).
3. For offsite failures, confirm local `.tar.gz` still present.
4. Confirm no leftover `.partial` or `.tmp.*` in backup/encrypted dirs.
5. For remote checksum mismatch, do not delete local artifacts.

## Off-host restore drill

Never restore over production without explicit runbook execution.

```bash
DRILL=/tmp/fingerfood-restore-drill-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$DRILL"
ARCHIVE=<downloaded-fingerfood-*.tar.gz.gpg>
gpg --decrypt "$ARCHIVE" >"$DRILL/bundle.tar.gz"
tar -xzf "$DRILL/bundle.tar.gz" -C "$DRILL"
cd "$DRILL/fingerfood-backup"
sha256sum -c SHA256SUMS
validate-fingerfood-backup.py . /path/to/fingerfood-app
rm -rf "$DRILL"
```

## Production restore sequence

1. Stop accepting new user writes if possible (optional quiesce for active drafts).
2. Backup current production data path to a dated directory outside `app/data`.
3. Extract validated bundle to a temp directory first.
4. Replace `drafts/*.json` (and optional `items.json`) with restored copies.
5. Set owner `viktor:viktor`, dirs `775`, json `664`.
6. Restart `fingerfood-app.service` to clear in-memory cache.
7. HTTP smoke on `100.109.6.74:8091`:
   - `GET /docs` → 200
   - `GET /api/items` → 201 items
   - `GET /api/drafts` → expected count

## Rollback

If restore fails validation or smoke checks:

1. Stop service if needed.
2. Restore the pre-restore backup copy of `app/data`.
3. Restart service.
4. Re-run HTTP smoke.

## Tests

```bash
bash infra/backup/test-fingerfood-backup.sh
bash infra/backup/test-fingerfood-offsite-backup.sh
systemd-analyze --user verify infra/systemd/fingerfood-backup.service infra/systemd/fingerfood-backup.timer
```
