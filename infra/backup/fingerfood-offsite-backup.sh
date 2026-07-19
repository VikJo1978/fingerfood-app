#!/usr/bin/env bash
# Encrypt the latest verified local Fingerfood bundle and send it to the VPS.
# Reuses shared GPG/SSH settings from catering-offsite-backup.env.

set -Eeuo pipefail
umask 077

readonly CATERING_CONFIG="${CATERING_BACKUP_CONFIG:-/home/viktor/.config/catering-offsite-backup.env}"
readonly FINGERFOOD_CONFIG="${FINGERFOOD_OFFSITE_BACKUP_CONFIG:-/home/viktor/.config/fingerfood-offsite-backup.env}"

if [[ -r "${CATERING_CONFIG}" ]]; then
    # shellcheck disable=SC1090
    source "${CATERING_CONFIG}"
fi
if [[ -r "${FINGERFOOD_CONFIG}" ]]; then
    # shellcheck disable=SC1090
    source "${FINGERFOOD_CONFIG}"
fi

: "${CATERING_BACKUP_GPG_RECIPIENT:?missing GPG recipient fingerprint}"

readonly PRODUCTION_REPO="${FINGERFOOD_OFFSITE_BACKUP_REPO:-/home/viktor/projects/fingerfood-app}"
readonly LOCAL_DIR="${FINGERFOOD_OFFSITE_BACKUP_LOCAL_DIR:-/home/viktor/fingerfood-runtime/backups}"
readonly ENCRYPTED_DIR="${FINGERFOOD_OFFSITE_ENCRYPTED_DIR:-/home/viktor/fingerfood-runtime/offsite-encrypted-fingerfood}"
readonly LOCK_FILE="${FINGERFOOD_OFFSITE_BACKUP_LOCK_FILE:-${ENCRYPTED_DIR}/.fingerfood-offsite-backup.lock}"
readonly MAX_AGE_SEC="${FINGERFOOD_OFFSITE_BACKUP_MAX_AGE_SEC:-86400}"
readonly VALIDATOR="${FINGERFOOD_OFFSITE_BACKUP_VALIDATOR:-/home/viktor/fingerfood-runtime/bin/validate-fingerfood-backup.py}"
readonly PYTHON="${FINGERFOOD_OFFSITE_BACKUP_PYTHON:-${PRODUCTION_REPO}/backend/.venv/bin/python3}"
readonly GNUPG_HOME="${CATERING_BACKUP_GNUPGHOME:-/home/viktor/.gnupg-catering-backup}"
readonly SSH_KEY="${CATERING_BACKUP_SSH_KEY:-/home/viktor/.ssh/catering_backup_vps}"
readonly REMOTE_USER="${CATERING_BACKUP_REMOTE_USER:-catering-backup}"
readonly REMOTE_HOST="${CATERING_BACKUP_REMOTE_HOST:-185.16.60.69}"
readonly GPG_CMD="${FINGERFOOD_OFFSITE_BACKUP_GPG:-gpg}"
readonly SSH_CMD="${FINGERFOOD_OFFSITE_BACKUP_SSH:-ssh}"
readonly ARCHIVE_REGEX='^fingerfood-[0-9]{8}T[0-9]{6}Z\.tar\.gz$'

TEMP_VERIFY_ROOT=""
TEMPORARY_ENCRYPTED=""
TEMPORARY_SIDECAR=""

log() {
    printf 'fingerfood-offsite-backup: %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail() {
    log "ERROR $*"
    exit 1
}

cleanup() {
    local status=$?
    if [[ -n "${TEMP_VERIFY_ROOT}" && -d "${TEMP_VERIFY_ROOT}" ]]; then
        rm -rf "${TEMP_VERIFY_ROOT}"
    fi
    if [[ -n "${TEMPORARY_ENCRYPTED}" && -f "${TEMPORARY_ENCRYPTED}" ]]; then
        rm -f "${TEMPORARY_ENCRYPTED}"
    fi
    if [[ -n "${TEMPORARY_SIDECAR}" && -f "${TEMPORARY_SIDECAR}" ]]; then
        rm -f "${TEMPORARY_SIDECAR}"
    fi
    if (( status != 0 )); then
        log "FAILED exit=${status}"
    fi
}
trap cleanup EXIT
trap 'fail "signal received"' HUP INT TERM

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

acquire_lock() {
    mkdir -p "${ENCRYPTED_DIR}"
    exec 8>"${LOCK_FILE}"
    if ! flock -n 8; then
        fail "another fingerfood-offsite-backup is already running (lock=${LOCK_FILE})"
    fi
}

run_ssh() {
    # shellcheck disable=SC2086
    ${SSH_CMD} -F /dev/null -i "${SSH_KEY}" -o BatchMode=yes -o ConnectTimeout=15 "$@"
}

select_latest_archive() {
    local candidate base latest=""
    while IFS= read -r candidate; do
        base=$(basename "${candidate}")
        [[ "${base}" =~ ${ARCHIVE_REGEX} ]] || continue
        latest="${candidate}"
    done < <(find "${LOCAL_DIR}" -maxdepth 1 -type f -name 'fingerfood-*.tar.gz' | LC_ALL=C sort)
    [[ -n "${latest}" && -s "${latest}" ]] || fail "no local fingerfood archive found in ${LOCAL_DIR}"
    printf '%s' "${latest}"
}

reject_stale_archive() {
    local archive=$1
    local now mtime
    now=$(date +%s)
    mtime=$(stat -c '%Y' "${archive}")
    if (( now - mtime > MAX_AGE_SEC )); then
        fail "newest local archive is stale"
    fi
}

verify_archive_listing() {
    local archive=$1
    local listing
    listing=$(tar -tzf "${archive}") || fail "archive listing failed"

    grep -qx 'fingerfood-backup/items.json' <<<"${listing}" || fail "archive missing items.json"
    grep -qx 'fingerfood-backup/drafts/' <<<"${listing}" || fail "archive missing drafts/"
    grep -qx 'fingerfood-backup/manifest.txt' <<<"${listing}" || fail "archive missing manifest.txt"
    grep -qx 'fingerfood-backup/SHA256SUMS' <<<"${listing}" || fail "archive missing SHA256SUMS"

    if grep -E '(^|/)\.env($|/)|\.gitkeep' <<<"${listing}"; then
        fail "forbidden path in archive listing"
    fi

    if tar -tvf "${archive}" | grep -q ' -> '; then
        fail "symbolic link in archive"
    fi

    while IFS= read -r entry; do
        [[ -n "${entry}" ]] || continue
        case "${entry}" in
            fingerfood-backup/|fingerfood-backup/items.json|fingerfood-backup/manifest.txt|fingerfood-backup/SHA256SUMS|fingerfood-backup/drafts/) ;;
            fingerfood-backup/drafts/[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].json) ;;
            *)
                fail "unexpected archive path: ${entry}"
                ;;
        esac
    done <<<"${listing}"
}

verify_archive_contents() {
    local archive=$1
    local bundle
    TEMP_VERIFY_ROOT=$(mktemp -d "${ENCRYPTED_DIR}/.verify.XXXXXX")
    tar -xzf "${archive}" -C "${TEMP_VERIFY_ROOT}" || fail "archive extraction failed"
    bundle="${TEMP_VERIFY_ROOT}/fingerfood-backup"
    [[ -d "${bundle}" ]] || fail "bundle root missing after extraction"

    (
        cd "${bundle}" || exit 1
        sha256sum -c SHA256SUMS >/dev/null
    ) || fail "SHA256SUMS verification failed"

    local output
    if ! output="$("${PYTHON}" "${VALIDATOR}" "${bundle}" "${PRODUCTION_REPO}" 2>&1)"; then
        fail "${output}"
    fi
    log "pre-encrypt validation: ${output}"
    rm -rf "${TEMP_VERIFY_ROOT}"
    TEMP_VERIFY_ROOT=""
}

encrypt_and_upload() {
    local archive=$1
    local base_name name sidecar_name encrypted sidecar
    base_name=$(basename "${archive}")
    name="${base_name}.gpg"
    sidecar_name="${name}.sha256"
    encrypted="${ENCRYPTED_DIR}/${name}"
    sidecar="${ENCRYPTED_DIR}/${sidecar_name}"
    TEMPORARY_ENCRYPTED="${encrypted}.tmp.$$"
    TEMPORARY_SIDECAR="${sidecar}.tmp.$$"

    if [[ "${FINGERFOOD_OFFSITE_BACKUP_TEST_FAIL_PHASE:-}" == "gpg" ]]; then
        fail "injected gpg failure"
    fi

    ${GPG_CMD} --homedir "${GNUPG_HOME}" \
        --batch \
        --yes \
        --trust-model always \
        --recipient "${CATERING_BACKUP_GPG_RECIPIENT}" \
        --output "${TEMPORARY_ENCRYPTED}" \
        --encrypt "${archive}" || fail "gpg encryption failed"

    [[ -s "${TEMPORARY_ENCRYPTED}" ]] || fail "encrypted artifact empty"
    mv "${TEMPORARY_ENCRYPTED}" "${encrypted}"
    TEMPORARY_ENCRYPTED=""

    local local_sum remote_sum local_sidecar_sum remote_sidecar_sum
    local_sum=$(sha256sum "${encrypted}" | awk '{print $1}')
    printf '%s\n' "${local_sum}" >"${TEMPORARY_SIDECAR}"
    mv "${TEMPORARY_SIDECAR}" "${sidecar}"
    TEMPORARY_SIDECAR=""

    local ssh_target="${REMOTE_USER}@${REMOTE_HOST}"

    if [[ "${FINGERFOOD_OFFSITE_BACKUP_TEST_FAIL_PHASE:-}" == "ssh_put" ]]; then
        fail "injected ssh failure"
    fi

    run_ssh "${ssh_target}" "put ${name}" <"${encrypted}" || fail "remote put failed for ${name}"

    if [[ "${FINGERFOOD_OFFSITE_BACKUP_TEST_FAIL_PHASE:-}" == "checksum" ]]; then
        remote_sum=0000000000000000000000000000000000000000000000000000000000000000
    else
        remote_sum=$(run_ssh "${ssh_target}" "sha256 ${name}")
    fi
    [[ "${local_sum}" == "${remote_sum}" ]] || fail "remote checksum mismatch for ${name}"

    run_ssh "${ssh_target}" "put ${sidecar_name}" <"${sidecar}" || fail "remote put failed for ${sidecar_name}"
    local_sidecar_sum=$(sha256sum "${sidecar}" | awk '{print $1}')
    remote_sidecar_sum=$(run_ssh "${ssh_target}" "sha256 ${sidecar_name}")
    [[ "${local_sidecar_sum}" == "${remote_sidecar_sum}" ]] || fail "remote checksum mismatch for ${sidecar_name}"

    if [[ "${FINGERFOOD_OFFSITE_BACKUP_TEST_FAIL_PHASE:-}" == "prune" ]]; then
        fail "injected remote prune failure"
    fi

    run_ssh "${ssh_target}" prune || fail "remote prune failed"

    find "${ENCRYPTED_DIR}" -type f \( \
        -name 'fingerfood-[0-9]*T*Z.tar.gz.gpg' \
        -o -name 'fingerfood-[0-9]*T*Z.tar.gz.gpg.sha256' \
        \) -mtime +14 -delete

    log "SUCCESS artifact=${name} sha256=${local_sum}"
}

main() {
    require_command tar
    require_command flock
    require_command sha256sum
    require_command find
    [[ -x "${PYTHON}" ]] || fail "python not executable: ${PYTHON}"
    [[ -f "${VALIDATOR}" ]] || fail "validator not found: ${VALIDATOR}"
    mkdir -p "${LOCAL_DIR}" "${ENCRYPTED_DIR}"

    acquire_lock
    local archive
    archive=$(select_latest_archive)
    reject_stale_archive "${archive}"
    verify_archive_listing "${archive}"
    verify_archive_contents "${archive}"
    encrypt_and_upload "${archive}"
}

main "$@"
