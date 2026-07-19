#!/usr/bin/env bash
# Failure-path harness for fingerfood-offsite-backup.sh (fixtures only).

set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SENDER="${SCRIPT_DIR}/fingerfood-offsite-backup.sh"
readonly VALIDATOR="${SCRIPT_DIR}/validate-fingerfood-backup.py"
readonly PRODUCTION_ITEMS="${FINGERFOOD_OFFSITE_TEST_SOURCE_ITEMS:-/home/viktor/projects/fingerfood-app/backend/app/data/items.json}"
readonly PRODUCTION_REPO="${FINGERFOOD_OFFSITE_TEST_REPO:-/home/viktor/projects/fingerfood-app}"
readonly PYTHON="${FINGERFOOD_OFFSITE_BACKUP_PYTHON:-${PRODUCTION_REPO}/backend/.venv/bin/python3}"

PASS=0
FAIL=0

fail() {
    echo "FAIL: $*"
    FAIL=$((FAIL + 1))
}

pass() {
    echo "PASS: $*"
    PASS=$((PASS + 1))
}

assert_rc() {
    local label=$1 expected=$2 actual=$3
    if [[ "${actual}" -eq "${expected}" ]]; then
        pass "${label} (rc=${actual})"
    else
        fail "${label} expected rc=${expected} got rc=${actual} err=$(tr '\n' ' ' </tmp/fingerfood-offsite-err.$$ 2>/dev/null || true)"
    fi
}

assert_log_clean() {
    local label=$1
    if grep -Eiq 'recipient|fingerprint|password|BEGIN (OPENSSH|RSA)|PRIVATE|SECRET_TOKEN' \
        /tmp/fingerfood-offsite-out.$$ /tmp/fingerfood-offsite-err.$$ 2>/dev/null; then
        fail "${label} leaked sensitive marker"
    else
        pass "${label} logs clean"
    fi
}

fixture_root() {
    mktemp -d /tmp/fingerfood-offsite-fail.XXXXXX
}

write_env() {
    local root=$1
    mkdir -p "${root}/ssh-store"
    cat >"${root}/fingerfood.env" <<EOF
FINGERFOOD_OFFSITE_BACKUP_LOCAL_DIR=${root}/backups
FINGERFOOD_OFFSITE_ENCRYPTED_DIR=${root}/encrypted
FINGERFOOD_OFFSITE_BACKUP_MAX_AGE_SEC=86400
FINGERFOOD_OFFSITE_BACKUP_CONFIG=${root}/fingerfood.env
FINGERFOOD_OFFSITE_BACKUP_REPO=${PRODUCTION_REPO}
FINGERFOOD_OFFSITE_BACKUP_VALIDATOR=${VALIDATOR}
FINGERFOOD_OFFSITE_BACKUP_PYTHON=${PYTHON}
CATERING_BACKUP_CONFIG=${root}/catering.env
EOF
    cat >"${root}/catering.env" <<EOF
CATERING_BACKUP_GPG_RECIPIENT=0000000000000000000000000000000000000000
CATERING_BACKUP_GNUPGHOME=${root}/gnupg
CATERING_BACKUP_SSH_KEY=${root}/fake_key
CATERING_BACKUP_REMOTE_USER=test-backup
CATERING_BACKUP_REMOTE_HOST=127.0.0.1
EOF
    mkdir -p "${root}/backups" "${root}/encrypted" "${root}/gnupg" "${root}/bin"
    chmod 600 "${root}/fake_key" 2>/dev/null || true
    printf '#!/bin/sh\nexit 0\n' >"${root}/fake_key"
    chmod 600 "${root}/fake_key"
}

make_valid_bundle() {
    local bundle=$1
    mkdir -p "${bundle}/drafts"
    cp -p "${PRODUCTION_ITEMS}" "${bundle}/items.json"
    {
        printf 'format=fingerfood-backup-v1\n'
        printf 'created_at=2026-07-19T06:26:08Z\n'
        printf 'item_count=201\n'
        printf 'draft_count=0\n'
    } >"${bundle}/manifest.txt"
    (
        cd "${bundle}" || exit 1
        sha256sum items.json >SHA256SUMS
    )
}

make_valid_archive() {
    local root=$1
    local name=${2:-fingerfood-20260719T120000Z.tar.gz}
    make_valid_bundle "${root}/fingerfood-backup"
    tar -C "${root}" -czf "${root}/backups/${name}" fingerfood-backup
    rm -rf "${root}/fingerfood-backup"
}

run_sender() {
    local root_bin=$1
    shift
    set +e
    env PATH="${root_bin}:${PATH}" "$@" \
        FINGERFOOD_OFFSITE_BACKUP_GPG=gpg \
        FINGERFOOD_OFFSITE_BACKUP_SSH=ssh \
        bash "${SENDER}" >/tmp/fingerfood-offsite-out.$$ 2>/tmp/fingerfood-offsite-err.$$
    local rc=$?
    set -e
    printf '%s' "${rc}"
}

fake_gpg_fail() {
    cat >"$1/bin/gpg" <<'EOF'
#!/bin/sh
echo "gpg failure" >&2
exit 1
EOF
    chmod +x "$1/bin/gpg"
}

fake_gpg_ok() {
    cat >"$1/bin/gpg" <<'EOF'
#!/bin/sh
out=
input=
while [ $# -gt 0 ]; do
    case "$1" in
        --output) out=$2; shift 2 ;;
        --encrypt) input=$2; shift 2 ;;
        *) shift ;;
    esac
done
test -n "$out" && test -n "$input"
cp "$input" "$out"
exit 0
EOF
    chmod +x "$1/bin/gpg"
}

fake_ssh_fail() {
    cat >"$1/bin/ssh" <<'EOF'
#!/bin/sh
echo "ssh failure" >&2
exit 1
EOF
    chmod +x "$1/bin/ssh"
}

fake_ssh_ok() {
    cat >"$1/bin/ssh" <<'EOF'
#!/bin/sh
store=${FINGERFOOD_SSH_STORE:?missing FINGERFOOD_SSH_STORE}
mkdir -p "$store"
case "$*" in
    *"put "*)
        name=${*#*put }
        cat >"$store/$name"
        exit 0
        ;;
    *"sha256 "*)
        name=${*#*sha256 }
        sha256sum "$store/$name" | awk '{print $1}'
        exit 0
        ;;
    *prune*) exit 0 ;;
    *"put core-"*|*"put courier-"*) echo "unexpected family command" >&2; exit 99 ;;
    *) exit 1 ;;
esac
EOF
    chmod +x "$1/bin/ssh"
}

fake_ssh_wrong_checksum() {
    cat >"$1/bin/ssh" <<'EOF'
#!/bin/sh
case "$*" in
    *"put fingerfood-"*) exit 0 ;;
    *"sha256 fingerfood-"*) printf 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef\n'; exit 0 ;;
    *) exit 1 ;;
esac
EOF
    chmod +x "$1/bin/ssh"
}

fake_ssh_prune_fail() {
    cat >"$1/bin/ssh" <<'EOF'
#!/bin/sh
store=${FINGERFOOD_SSH_STORE:?missing FINGERFOOD_SSH_STORE}
mkdir -p "$store"
case "$*" in
    *"put "*)
        name=${*#*put }
        cat >"$store/$name"
        exit 0
        ;;
    *"sha256 "*)
        name=${*#*sha256 }
        sha256sum "$store/$name" | awk '{print $1}'
        exit 0
        ;;
    *prune*) exit 1 ;;
    *) exit 1 ;;
esac
EOF
    chmod +x "$1/bin/ssh"
}

echo "=== sender failure matrix ==="

# 1 missing archive
root=$(fixture_root)
write_env "$root"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "missing local archive" 1 "$rc"
assert_log_clean "missing local archive"
rm -rf "$root"

# 2 stale archive
root=$(fixture_root)
write_env "$root"
make_valid_archive "$root"
touch -d '3 days ago' "$root/backups/fingerfood-20260719T120000Z.tar.gz"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store" \
    FINGERFOOD_OFFSITE_BACKUP_MAX_AGE_SEC=3600)
assert_rc "stale archive rejected" 1 "$rc"
rm -rf "$root"

# 3 malformed filename
root=$(fixture_root)
write_env "$root"
make_valid_bundle "$root/fingerfood-backup"
tar -C "$root" -czf "$root/backups/not-fingerfood.tar.gz" fingerfood-backup
rm -rf "$root/fingerfood-backup"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "malformed filename ignored" 1 "$rc"
rm -rf "$root"

# 4 corrupt tar
root=$(fixture_root)
write_env "$root"
printf 'not-a-tar' >"$root/backups/fingerfood-20260719T120000Z.tar.gz"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "corrupt tar rejected" 1 "$rc"
rm -rf "$root"

# 5 missing manifest
root=$(fixture_root)
write_env "$root"
make_valid_bundle "$root/fingerfood-backup"
rm -f "$root/fingerfood-backup/manifest.txt"
tar -C "$root" -czf "$root/backups/fingerfood-20260719T120000Z.tar.gz" fingerfood-backup
rm -rf "$root/fingerfood-backup"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "missing manifest rejected" 1 "$rc"
rm -rf "$root"

# 6 missing SHA256SUMS
root=$(fixture_root)
write_env "$root"
make_valid_bundle "$root/fingerfood-backup"
rm -f "$root/fingerfood-backup/SHA256SUMS"
tar -C "$root" -czf "$root/backups/fingerfood-20260719T120000Z.tar.gz" fingerfood-backup
rm -rf "$root/fingerfood-backup"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "missing SHA256SUMS rejected" 1 "$rc"
rm -rf "$root"

# 7 SHA256 mismatch
root=$(fixture_root)
write_env "$root"
make_valid_bundle "$root/fingerfood-backup"
printf 'deadbeef  items.json\n' >"$root/fingerfood-backup/SHA256SUMS"
tar -C "$root" -czf "$root/backups/fingerfood-20260719T120000Z.tar.gz" fingerfood-backup
rm -rf "$root/fingerfood-backup"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "SHA256 mismatch rejected" 1 "$rc"
rm -rf "$root"

# 8 invalid items JSON
root=$(fixture_root)
write_env "$root"
make_valid_bundle "$root/fingerfood-backup"
printf '{bad json' >"$root/fingerfood-backup/items.json"
(
    cd "$root/fingerfood-backup" || exit 1
    sha256sum items.json >SHA256SUMS
)
tar -C "$root" -czf "$root/backups/fingerfood-20260719T120000Z.tar.gz" fingerfood-backup
rm -rf "$root/fingerfood-backup"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "invalid items JSON rejected" 1 "$rc"
rm -rf "$root"

# 9 invalid draft schema
root=$(fixture_root)
write_env "$root"
make_valid_bundle "$root/fingerfood-backup"
printf '{"id":"00000000-0000-0000-0000-000000000001","createdAt":"2026-01-01T00:00:00+00:00","updatedAt":"2026-01-01T00:00:00+00:00","status":"published","payload":{}}\n' \
    >"$root/fingerfood-backup/drafts/00000000-0000-0000-0000-000000000001.json"
(
    cd "$root/fingerfood-backup" || exit 1
    sha256sum items.json drafts/*.json >SHA256SUMS 2>/dev/null || sha256sum items.json >SHA256SUMS
)
tar -C "$root" -czf "$root/backups/fingerfood-20260719T120000Z.tar.gz" fingerfood-backup
rm -rf "$root/fingerfood-backup"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "invalid draft schema rejected" 1 "$rc"
rm -rf "$root"

# 10 symlink in archive
root=$(fixture_root)
write_env "$root"
make_valid_bundle "$root/fingerfood-backup"
ln -s items.json "$root/fingerfood-backup/drafts/link.json"
tar -C "$root" -czf "$root/backups/fingerfood-20260719T120000Z.tar.gz" fingerfood-backup
rm -rf "$root/fingerfood-backup"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "symlink in archive rejected" 1 "$rc"
rm -rf "$root"

# 11 gpg failure
root=$(fixture_root)
write_env "$root"
make_valid_archive "$root"
fake_gpg_fail "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "gpg failure non-zero" 1 "$rc"
test -z "$(find "$root/encrypted" -name '*.tmp.*' -print)" && pass "gpg partial cleaned" || fail "gpg partial left"
rm -rf "$root"

# 12 ssh put failure
root=$(fixture_root)
write_env "$root"
make_valid_archive "$root"
fake_gpg_ok "$root"
fake_ssh_fail "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "ssh put failure non-zero" 1 "$rc"
test -f "$root/backups/fingerfood-20260719T120000Z.tar.gz" && pass "local archive preserved after ssh failure" || fail "local archive missing"
rm -rf "$root"

# 13 remote checksum mismatch
root=$(fixture_root)
write_env "$root"
make_valid_archive "$root"
fake_gpg_ok "$root"
fake_ssh_wrong_checksum "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "remote checksum mismatch non-zero" 1 "$rc"
rm -rf "$root"

# 14 remote prune failure
root=$(fixture_root)
write_env "$root"
make_valid_archive "$root"
fake_gpg_ok "$root"
fake_ssh_prune_fail "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "remote prune failure non-zero" 1 "$rc"
rm -rf "$root"

# 15 local archive preserved after failure
root=$(fixture_root)
write_env "$root"
make_valid_archive "$root"
before=$(sha256sum "$root/backups/fingerfood-20260719T120000Z.tar.gz")
fake_gpg_ok "$root"
fake_ssh_fail "$root"
run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store" >/dev/null || true
after=$(sha256sum "$root/backups/fingerfood-20260719T120000Z.tar.gz")
[[ "${before}" == "${after}" ]] && pass "local archive unchanged after failure" || fail "local archive changed after failure"
rm -rf "$root"

# 16 temporary encrypted files cleaned
root=$(fixture_root)
write_env "$root"
make_valid_archive "$root"
fake_gpg_ok "$root"
fake_ssh_fail "$root"
run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store" >/dev/null || true
test -z "$(find "$root/encrypted" -name '*.tmp.*' -print)" && pass "encrypted tmp cleaned after failure" || fail "encrypted tmp remains"
rm -rf "$root"

# 17 secret marker not in logs
root=$(fixture_root)
write_env "$root"
make_valid_archive "$root"
printf 'SECRET_TOKEN=must-not-appear\n' >>"$root/catering.env"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store" >/dev/null || true
assert_log_clean "successful fake run"
rm -rf "$root"

# 18 success path sends correct filenames
root=$(fixture_root)
write_env "$root"
make_valid_archive "$root"
: >"$root/ssh-log"
cat >"$root/bin/ssh" <<EOF
#!/bin/sh
store="\$FINGERFOOD_SSH_STORE"
echo "\$*" >>"\$FINGERFOOD_SSH_LOG"
mkdir -p "\$store"
case "\$*" in
    *"put "*)
        name=\${*#*put }
        cat >"\$store/\$name"
        exit 0
        ;;
    *"sha256 "*)
        name=\${*#*sha256 }
        sha256sum "\$store/\$name" | awk '{print \$1}'
        exit 0
        ;;
    *prune*) exit 0 ;;
    *"put core-"*|*"put courier-"*) echo "unexpected family command" >&2; exit 99 ;;
    *) exit 1 ;;
esac
EOF
chmod +x "$root/bin/ssh"
fake_gpg_ok "$root"
export FINGERFOOD_SSH_LOG="$root/ssh-log"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
unset FINGERFOOD_SSH_LOG
assert_rc "success path non-zero free" 0 "$rc"
grep -q 'put fingerfood-20260719T120000Z.tar.gz.gpg' "$root/ssh-log" && pass "success put gpg filename" || fail "missing gpg put"
grep -q 'put fingerfood-20260719T120000Z.tar.gz.gpg.sha256' "$root/ssh-log" && pass "success put sidecar filename" || fail "missing sidecar put"
grep -q ' prune$' "$root/ssh-log" && pass "success path calls prune" || fail "missing prune call"
grep -Eq 'put (core|courier)-' "$root/ssh-log" && fail "Core/Courier remote commands called" || pass "Core/Courier remote commands not called"
rm -rf "$root"

# 19 success path creates encrypted artifacts
root=$(fixture_root)
write_env "$root"
make_valid_archive "$root"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "success path completes" 0 "$rc"
test -f "$root/encrypted/fingerfood-20260719T120000Z.tar.gz.gpg" && pass "encrypted artifact created" || fail "encrypted artifact missing"
test -f "$root/encrypted/fingerfood-20260719T120000Z.tar.gz.gpg.sha256" && pass "encrypted sidecar created" || fail "encrypted sidecar missing"
rm -rf "$root"

# 20 invalid draft JSON
root=$(fixture_root)
write_env "$root"
make_valid_bundle "$root/fingerfood-backup"
printf '{bad' >"$root/fingerfood-backup/drafts/00000000-0000-0000-0000-000000000002.json"
tar -C "$root" -czf "$root/backups/fingerfood-20260719T120000Z.tar.gz" fingerfood-backup
rm -rf "$root/fingerfood-backup"
fake_gpg_ok "$root"
fake_ssh_ok "$root"
rc=$(run_sender "$root/bin" \
    FINGERFOOD_OFFSITE_BACKUP_CONFIG="$root/fingerfood.env" \
    CATERING_BACKUP_CONFIG="$root/catering.env" \
    FINGERFOOD_SSH_STORE="$root/ssh-store")
assert_rc "invalid draft JSON rejected" 1 "$rc"
rm -rf "$root"

echo "=== summary: pass=${PASS} fail=${FAIL} ==="
(( FAIL == 0 ))
