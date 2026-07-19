#!/usr/bin/env bash
# Local Fingerfood runtime data backup with stability-checked online snapshot.
# PRODUCTION_FINGERFOOD_DATA_BACKUP_V1 — local slice only (no off-host).

set -Eeuo pipefail
umask 077

readonly PRODUCTION_REPO="/home/viktor/projects/fingerfood-app"
readonly RUNTIME_ROOT="${FINGERFOOD_BACKUP_RUNTIME_ROOT:-/home/viktor/fingerfood-runtime}"
readonly DATA_DIR="${FINGERFOOD_BACKUP_DATA_DIR:-${PRODUCTION_REPO}/backend/app/data}"
readonly REPO_ROOT="${FINGERFOOD_BACKUP_REPO:-${PRODUCTION_REPO}}"
readonly BACKUP_DIR="${FINGERFOOD_BACKUP_OUTPUT_DIR:-${RUNTIME_ROOT}/backups}"
readonly LOCK_FILE="${FINGERFOOD_BACKUP_LOCK_FILE:-${BACKUP_DIR}/.fingerfood-backup.lock}"
readonly VALIDATOR="${FINGERFOOD_BACKUP_VALIDATOR:-${RUNTIME_ROOT}/bin/validate-fingerfood-backup.py}"
readonly PYTHON="${FINGERFOOD_BACKUP_PYTHON:-${PRODUCTION_REPO}/backend/.venv/bin/python3}"
readonly MAX_STABILITY_ATTEMPTS="${FINGERFOOD_BACKUP_MAX_STABILITY_ATTEMPTS:-3}"
readonly ARCHIVE_REGEX='fingerfood-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z\.tar\.gz$'
readonly DRAFT_FILENAME_REGEX='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'

STAGING_ROOT=""
PARTIAL_ARCHIVE=""
FINAL_ARCHIVE=""
INVENTORY1=""
INVENTORY2=""
STABILITY_ATTEMPT=0
ITEM_COUNT=0
DRAFT_COUNT=0
SOURCE_INVENTORY_HASH=""
VALIDATION_RESULT=""

log() {
    printf 'fingerfood-backup: %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail() {
    log "ERROR $*"
    exit 1
}

cleanup() {
    local status=$?
    if [[ -n "${STAGING_ROOT}" && -d "${STAGING_ROOT}" ]]; then
        rm -rf "${STAGING_ROOT}"
    fi
    if [[ -n "${INVENTORY1}" && -f "${INVENTORY1}" ]]; then
        rm -f "${INVENTORY1}"
    fi
    if [[ -n "${INVENTORY2}" && -f "${INVENTORY2}" ]]; then
        rm -f "${INVENTORY2}"
    fi
    if [[ -n "${PARTIAL_ARCHIVE}" && -f "${PARTIAL_ARCHIVE}" ]]; then
        rm -f "${PARTIAL_ARCHIVE}"
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
    mkdir -p "${BACKUP_DIR}"
    exec 9>"${LOCK_FILE}"
    if ! flock -n 9; then
        fail "another fingerfood-backup is already running (lock=${LOCK_FILE})"
    fi
}

validate_prerequisites() {
    [[ -d "${DATA_DIR}" ]] || fail "data directory not found: ${DATA_DIR}"
    [[ -f "${DATA_DIR}/items.json" ]] || fail "items.json not found: ${DATA_DIR}/items.json"
    [[ -d "${BACKUP_DIR}" ]] || mkdir -p "${BACKUP_DIR}"
    [[ -x "${PYTHON}" ]] || fail "python not executable: ${PYTHON}"
    [[ -f "${VALIDATOR}" ]] || fail "validator not found: ${VALIDATOR}"
}

file_type_label() {
    local path=$1
    if [[ -L "${path}" ]]; then
        printf 'symlink'
    elif [[ -f "${path}" ]]; then
        printf 'file'
    elif [[ -d "${path}" ]]; then
        printf 'directory'
    elif [[ -p "${path}" ]]; then
        printf 'fifo'
    elif [[ -S "${path}" ]]; then
        printf 'socket'
    elif [[ -c "${path}" ]] || [[ -b "${path}" ]]; then
        printf 'device'
    else
        printf 'other'
    fi
}

sha256_file() {
    local path=$1
    sha256sum "${path}" | awk '{print $1}'
}

reject_symlink() {
    local path=$1
    [[ ! -L "${path}" ]] || fail "symbolic link is not allowed: ${path#${DATA_DIR}/}"
}

scan_source_structure() {
    local rel path type
    reject_symlink "${DATA_DIR}/items.json"
    [[ -f "${DATA_DIR}/items.json" ]] || fail "items.json is not a regular file"

    for path in "${DATA_DIR}"/*; do
        [[ -e "${path}" ]] || continue
        rel="${path#${DATA_DIR}/}"
        case "${rel}" in
            items.json) ;;
            drafts)
                reject_symlink "${path}"
                [[ -d "${path}" ]] || fail "drafts is not a directory"
                local draft_path draft_rel draft_type
                for draft_path in "${path}"/*; do
                    [[ -e "${draft_path}" ]] || continue
                    draft_rel="drafts/${draft_path#${path}/}"
                    reject_symlink "${draft_path}"
                    draft_type="$(file_type_label "${draft_path}")"
                    [[ "${draft_type}" == "file" ]] ||
                        fail "unexpected non-regular file in drafts/: ${draft_rel} (${draft_type})"
                    [[ "${draft_path##*/}" =~ ${DRAFT_FILENAME_REGEX} ]] ||
                        fail "invalid draft filename contract: ${draft_rel}"
                    [[ "${draft_path##*/}" != ".gitkeep" ]] ||
                        fail "forbidden file in drafts/: .gitkeep"
                done
                ;;
            *)
                fail "unexpected entry in data root: ${rel}"
                ;;
        esac
    done
}

build_source_inventory() {
    local out=$1
    : >"${out}"
    {
        printf '%s\t%s\t%s\t%s\t%s\n' \
            "items.json" \
            "file" \
            "$(stat -c '%s' "${DATA_DIR}/items.json")" \
            "$(stat -c '%Y.%N' "${DATA_DIR}/items.json")" \
            "$(sha256_file "${DATA_DIR}/items.json")"
        local draft_path rel
        while IFS= read -r -d '' draft_path; do
            rel="drafts/${draft_path#${DATA_DIR}/drafts/}"
            printf '%s\t%s\t%s\t%s\t%s\n' \
                "${rel}" \
                "file" \
                "$(stat -c '%s' "${draft_path}")" \
                "$(stat -c '%Y.%N' "${draft_path}")" \
                "$(sha256_file "${draft_path}")"
        done < <(
            find "${DATA_DIR}/drafts" -maxdepth 1 -type f -name '*.json' -print0 2>/dev/null |
                sort -z
        )
    } | LC_ALL=C sort >"${out}.tmp"
    mv "${out}.tmp" "${out}"
}

inventory_hash() {
    local inventory=$1
    sha256sum "${inventory}" | awk '{print $1}'
}

inventories_match() {
    local first=$1
    local second=$2
    cmp -s "${first}" "${second}"
}

copy_to_staging() {
    local bundle=$1
    local drafts_dst="${bundle}/drafts"
    mkdir -p "${drafts_dst}"
    cp -p "${DATA_DIR}/items.json" "${bundle}/items.json"
    local draft_path
    while IFS= read -r -d '' draft_path; do
        cp -p "${draft_path}" "${drafts_dst}/${draft_path##*/}"
    done < <(
        find "${DATA_DIR}/drafts" -maxdepth 1 -type f -name '*.json' -print0 2>/dev/null || true
    )
}

run_schema_validation() {
    local bundle=$1
    local output
    if ! output="$("${PYTHON}" "${VALIDATOR}" "${bundle}" "${REPO_ROOT}" 2>&1)"; then
        fail "${output}"
    fi
    VALIDATION_RESULT="${output}"
    ITEM_COUNT="$(sed -n 's/^validation_ok item_count=\([0-9][0-9]*\) draft_count=.*/\1/p' <<<"${output}")"
    DRAFT_COUNT="$(sed -n 's/^validation_ok item_count=[0-9][0-9]* draft_count=\([0-9][0-9]*\)/\1/p' <<<"${output}")"
    [[ -n "${ITEM_COUNT}" && -n "${DRAFT_COUNT}" ]] ||
        fail "validator output parse failed: ${output}"
}

write_manifest() {
    local manifest=$1
    local bundle_root=$2
    local git_head="unknown"
    if git -C "${REPO_ROOT}" rev-parse HEAD >/dev/null 2>&1; then
        git_head="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
    fi
    {
        printf 'format=fingerfood-backup-v1\n'
        printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        printf 'source_host=%s\n' "$(hostname -f 2>/dev/null || hostname)"
        printf 'source_data_path=%s\n' "${DATA_DIR}"
        printf 'fingerfood_git_head=%s\n' "${git_head}"
        printf 'item_count=%s\n' "${ITEM_COUNT}"
        printf 'draft_count=%s\n' "${DRAFT_COUNT}"
        printf 'stability_attempt=%s\n' "${STABILITY_ATTEMPT}"
        printf 'source_inventory_hash=%s\n' "${SOURCE_INVENTORY_HASH}"
        printf 'validation_result=%s\n' "${VALIDATION_RESULT}"
        printf 'artifact_contents=\n'
        (
            cd "${bundle_root}" || exit 1
            find . -mindepth 1 -print | LC_ALL=C sort | sed 's#^\./#fingerfood-backup/#'
        )
    } >"${manifest}"
}

write_sha256sums() {
    local bundle_root=$1
    local sums_file="${bundle_root}/SHA256SUMS"
    {
        (
            cd "${bundle_root}" || exit 1
            find ./items.json ./drafts -type f -print0 2>/dev/null |
                sort -z |
                while IFS= read -r -d '' path; do
                    sha256sum "${path#./}"
                done
        )
    } | LC_ALL=C sort >"${sums_file}.tmp"
    mv "${sums_file}.tmp" "${sums_file}"
}

create_stable_snapshot() {
    local stamp bundle
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    STAGING_ROOT="${BACKUP_DIR}/.staging.${stamp}.$$"
    bundle="${STAGING_ROOT}/fingerfood-backup"
    mkdir -p "${bundle}"

    local attempt=1
    while (( attempt <= MAX_STABILITY_ATTEMPTS )); do
        STABILITY_ATTEMPT="${attempt}"
        INVENTORY1="${STAGING_ROOT}/inventory1.txt"
        INVENTORY2="${STAGING_ROOT}/inventory2.txt"

        scan_source_structure
        build_source_inventory "${INVENTORY1}"
        SOURCE_INVENTORY_HASH="$(inventory_hash "${INVENTORY1}")"

        rm -rf "${bundle}"
        mkdir -p "${bundle}/drafts"
        copy_to_staging "${bundle}"
        run_schema_validation "${bundle}"

        if [[ -n "${FINGERFOOD_BACKUP_TEST_HOOK:-}" && -x "${FINGERFOOD_BACKUP_TEST_HOOK}" ]]; then
            "${FINGERFOOD_BACKUP_TEST_HOOK}" "${attempt}" "${DATA_DIR}" || true
        fi

        build_source_inventory "${INVENTORY2}"
        if inventories_match "${INVENTORY1}" "${INVENTORY2}"; then
            log "stable snapshot attempt=${attempt} inventory_hash=${SOURCE_INVENTORY_HASH}"
            rm -f "${INVENTORY1}" "${INVENTORY2}"
            INVENTORY1=""
            INVENTORY2=""
            write_manifest "${bundle}/manifest.txt" "${bundle}"
            write_sha256sums "${bundle}"
            return 0
        fi

        log "source changed during snapshot attempt=${attempt}; retrying"
        rm -f "${INVENTORY1}" "${INVENTORY2}"
        INVENTORY1=""
        INVENTORY2=""
        rm -rf "${bundle}"
        mkdir -p "${bundle}/drafts"
        attempt=$((attempt + 1))
    done

    fail "source data did not stabilize after ${MAX_STABILITY_ATTEMPTS} attempts"
}

create_archive() {
    local stamp
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    FINAL_ARCHIVE="${BACKUP_DIR}/fingerfood-${stamp}.tar.gz"
    PARTIAL_ARCHIVE="${FINAL_ARCHIVE}.partial"

    log "creating archive ${FINAL_ARCHIVE##*/}"
    tar -C "${STAGING_ROOT}" -czf "${PARTIAL_ARCHIVE}" fingerfood-backup
    tar -tzf "${PARTIAL_ARCHIVE}" >/dev/null || fail "archive listing test failed"

    if [[ "${FINGERFOOD_BACKUP_TEST_FAIL_PHASE:-}" == "pre_rename" ]]; then
        fail "injected test failure before rename"
    fi

    mv "${PARTIAL_ARCHIVE}" "${FINAL_ARCHIVE}"
    PARTIAL_ARCHIVE=""
    chmod 600 "${FINAL_ARCHIVE}"

    rm -rf "${STAGING_ROOT}"
    STAGING_ROOT=""

    log "SUCCESS archive=${FINAL_ARCHIVE##*/} bytes=$(stat -c '%s' "${FINAL_ARCHIVE}") items=${ITEM_COUNT} drafts=${DRAFT_COUNT}"
}

apply_retention() {
    local dir=$1
    local name path deleted=0
    mapfile -t archives < <(
        while IFS= read -r -d '' path; do
            name=$(basename "${path}")
            [[ "${name}" =~ ${ARCHIVE_REGEX} ]] && printf '%s\n' "${name}"
        done < <(find "${dir}" -maxdepth 1 -type f -print0) | LC_ALL=C sort
    )
    local count=${#archives[@]}
    (( count == 0 )) && return 0

    local newest="${archives[$((count - 1))]}"
    for name in "${archives[@]}"; do
        [[ "${name}" == "${newest}" ]] && continue
        path="${dir}/${name}"
        if [[ -f "${path}" ]] && find "${path}" -mtime +14 | grep -q .; then
            rm -f "${path}"
            deleted=$((deleted + 1))
            log "retention deleted ${name}"
        fi
    done
    log "retention kept>=1 archives=${count} deleted=${deleted}"
}

main() {
    require_command tar
    require_command flock
    require_command sha256sum
    require_command find
    require_command stat
    require_command cmp
    require_command git

    acquire_lock
    validate_prerequisites
    create_stable_snapshot
    create_archive
    apply_retention "${BACKUP_DIR}"
}

main "$@"
