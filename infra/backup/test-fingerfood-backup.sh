#!/usr/bin/env bash
# Failure-path and regression tests for fingerfood-backup.sh (fixture dirs only).

set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly BACKUP_SCRIPT="${SCRIPT_DIR}/fingerfood-backup.sh"
readonly VALIDATOR="${SCRIPT_DIR}/validate-fingerfood-backup.py"
readonly PYTHON="${FINGERFOOD_BACKUP_PYTHON:-/home/viktor/projects/fingerfood-app/backend/.venv/bin/python3}"
readonly PRODUCTION_ITEMS="${FINGERFOOD_BACKUP_TEST_SOURCE_ITEMS:-/home/viktor/projects/fingerfood-app/backend/app/data/items.json}"

TEST_ROOT=""
PASS=0
FAIL=0

log() {
    printf 'test-fingerfood-backup: %s\n' "$*"
}

pass() {
    PASS=$((PASS + 1))
    log "PASS $*"
}

fail_test() {
    FAIL=$((FAIL + 1))
    log "FAIL $*"
}

cleanup_root() {
    if [[ -n "${TEST_ROOT}" && -d "${TEST_ROOT}" ]]; then
        rm -rf "${TEST_ROOT}"
        TEST_ROOT=""
    fi
}
trap cleanup_root EXIT

require_commands() {
    command -v bash >/dev/null || exit 1
    command -v python3 >/dev/null || exit 1
    [[ -x "${BACKUP_SCRIPT}" ]] || {
        echo "backup script not executable: ${BACKUP_SCRIPT}" >&2
        exit 1
    }
    [[ -f "${PRODUCTION_ITEMS}" ]] || {
        echo "production items.json fixture source missing: ${PRODUCTION_ITEMS}" >&2
        exit 1
    }
}

new_fixture() {
    cleanup_root
    TEST_ROOT="$(mktemp -d /tmp/fingerfood-backup-test.XXXXXX)"
    mkdir -p "${TEST_ROOT}/data/drafts" "${TEST_ROOT}/backups"
    cp -p "${PRODUCTION_ITEMS}" "${TEST_ROOT}/data/items.json"
}

run_backup() {
    local extra_env=("$@")
    (
        export FINGERFOOD_BACKUP_DATA_DIR="${TEST_ROOT}/data"
        export FINGERFOOD_BACKUP_OUTPUT_DIR="${TEST_ROOT}/backups"
        export FINGERFOOD_BACKUP_LOCK_FILE="${TEST_ROOT}/backups/.fingerfood-backup.lock"
        export FINGERFOOD_BACKUP_REPO="${REPO_ROOT}"
        export FINGERFOOD_BACKUP_VALIDATOR="${VALIDATOR}"
        export FINGERFOOD_BACKUP_PYTHON="${PYTHON}"
        export FINGERFOOD_BACKUP_RUNTIME_ROOT="${TEST_ROOT}"
        "${extra_env[@]}"
        bash "${BACKUP_SCRIPT}"
    )
}

latest_archive() {
    find "${TEST_ROOT}/backups" -maxdepth 1 -type f -name 'fingerfood-*.tar.gz' | LC_ALL=C sort | tail -1
}

test_missing_items_json() {
    new_fixture
    rm -f "${TEST_ROOT}/data/items.json"
    if run_backup; then
        fail_test "missing items.json should fail"
    else
        pass "missing items.json"
    fi
}

test_invalid_items_json() {
    new_fixture
    printf '{not json' >"${TEST_ROOT}/data/items.json"
    if run_backup; then
        fail_test "invalid items JSON should fail"
    else
        pass "invalid items JSON"
    fi
}

test_schema_invalid_item() {
    new_fixture
    python3 - <<'PY' "${TEST_ROOT}/data/items.json"
import json, sys
path = sys.argv[1]
rows = json.load(open(path, encoding="utf-8"))
rows[0] = {"id": "bad", "name": "x"}
json.dump(rows, open(path, "w", encoding="utf-8"))
PY
    if run_backup; then
        fail_test "schema-invalid item should fail"
    else
        pass "schema-invalid item"
    fi
}

test_invalid_draft_json() {
    new_fixture
    printf '{bad' >"${TEST_ROOT}/data/drafts/00000000-0000-0000-0000-000000000001.json"
    if run_backup; then
        fail_test "invalid draft JSON should fail"
    else
        pass "invalid draft JSON"
    fi
}

test_schema_invalid_draft() {
    new_fixture
    printf '{"id":"00000000-0000-0000-0000-000000000002","createdAt":"2026-01-01T00:00:00+00:00","updatedAt":"2026-01-01T00:00:00+00:00","status":"published","payload":{}}\n' \
        >"${TEST_ROOT}/data/drafts/00000000-0000-0000-0000-000000000002.json"
    if run_backup; then
        fail_test "schema-invalid draft should fail"
    else
        pass "schema-invalid draft"
    fi
}

test_symlink_in_drafts() {
    new_fixture
    ln -s "${TEST_ROOT}/data/items.json" "${TEST_ROOT}/data/drafts/link.json"
    if run_backup; then
        fail_test "symlink in drafts should fail"
    else
        pass "symlink in drafts"
    fi
}

test_unexpected_non_regular_file() {
    new_fixture
    mkfifo "${TEST_ROOT}/data/drafts/pipe.json"
    if run_backup; then
        fail_test "unexpected fifo in drafts should fail"
    else
        pass "unexpected non-regular file"
    fi
}

test_concurrent_lock_rejection() {
    new_fixture
    exec 8>"${TEST_ROOT}/backups/.fingerfood-backup.lock"
    flock 8
    if run_backup; then
        fail_test "concurrent backup should fail on lock"
    else
        pass "concurrent backup lock rejection"
    fi
    flock -u 8
}

test_stability_retry_then_success() {
    new_fixture
    local hook="${TEST_ROOT}/mutate_once.sh"
    cat >"${hook}" <<'EOF'
#!/usr/bin/env bash
attempt=$1
data_dir=$2
state="${data_dir}/.mutated"
if [[ "${attempt}" == "1" && ! -f "${state}" ]]; then
  touch "${data_dir}/items.json"
  touch "${state}"
fi
EOF
    chmod +x "${hook}"
    if FINGERFOOD_BACKUP_TEST_HOOK="${hook}" run_backup; then
        pass "stability retry succeeds on second attempt"
    else
        fail_test "stability retry should succeed after one mutation"
    fi
}

test_stability_exhausted() {
    new_fixture
    local hook="${TEST_ROOT}/mutate_always.sh"
    cat >"${hook}" <<'EOF'
#!/usr/bin/env bash
data_dir=$2
sleep 1
touch "${data_dir}/items.json"
EOF
    chmod +x "${hook}"
    if FINGERFOOD_BACKUP_TEST_HOOK="${hook}" run_backup; then
        fail_test "persistent mutation should fail after 3 attempts"
    else
        pass "stability exhausted after 3 attempts"
    fi
}

test_pre_rename_failure_no_final_artifact() {
    new_fixture
    local before after
    before="$(find "${TEST_ROOT}/backups" -maxdepth 1 -type f -name 'fingerfood-*.tar.gz' | wc -l | tr -d ' ')"
    if FINGERFOOD_BACKUP_TEST_FAIL_PHASE=pre_rename run_backup; then
        fail_test "pre_rename injected failure should exit non-zero"
    else
        after="$(find "${TEST_ROOT}/backups" -maxdepth 1 -type f -name 'fingerfood-*.tar.gz' | wc -l | tr -d ' ')"
        if [[ "${before}" == "${after}" ]] &&
            ! find "${TEST_ROOT}/backups" -maxdepth 1 -type f -name 'fingerfood-*.tar.gz.partial' | grep -q .; then
            pass "pre_rename failure leaves no final artifact"
        else
            fail_test "pre_rename failure should not create final artifact"
        fi
    fi
}

test_retention_preserves_unknown_file() {
    new_fixture
    run_backup
    local archive unknown
    archive="$(latest_archive)"
    [[ -n "${archive}" ]] || {
        fail_test "retention setup backup missing"
        return
    }
    unknown="${TEST_ROOT}/backups/manual-copy.tar.gz"
    cp -p "${archive}" "${unknown}"
    touch -d '30 days ago' "${archive}"
    run_backup
    if [[ -f "${unknown}" ]]; then
        pass "retention preserves unknown backup filename"
    else
        fail_test "retention deleted unknown backup file"
    fi
}

test_empty_drafts_success() {
    new_fixture
    if run_backup; then
        local archive tmp
        archive="$(latest_archive)"
        tmp="$(mktemp -d)"
        tar -xzf "${archive}" -C "${tmp}"
        if tar -tzf "${archive}" | grep -q 'fingerfood-backup/drafts/$'; then
            pass "empty drafts directory succeeds"
        else
            fail_test "archive missing drafts/ directory"
        fi
        rm -rf "${tmp}"
    else
        fail_test "empty drafts should succeed"
    fi
}

test_unicode_draft_filename_rejected() {
    new_fixture
    printf '{"id":"00000000-0000-0000-0000-000000000003","createdAt":"2026-01-01T00:00:00+00:00","updatedAt":"2026-01-01T00:00:00+00:00","payload":{}}\n' \
        >"${TEST_ROOT}/data/drafts/über raum.json"
    if run_backup; then
        fail_test "unicode/space draft filename should be rejected"
    else
        pass "unicode/space draft filename rejected"
    fi
}

test_secrets_outside_data_tree_excluded() {
    new_fixture
    printf 'SECRET_TOKEN=must-not-appear\n' >"${TEST_ROOT}/data/../outside.env"
    if run_backup; then
        local archive tmp listing
        archive="$(latest_archive)"
        tmp="$(mktemp -d)"
        tar -xzf "${archive}" -C "${tmp}"
        listing="$(tar -tzf "${archive}")"
        if grep -q 'outside.env' <<<"${listing}" ||
            grep -q 'SECRET_TOKEN' <<<"${listing}" ||
            tar -xOf "${archive}" 2>/dev/null | grep -q 'SECRET_TOKEN'; then
            fail_test "secrets outside data tree leaked into archive"
        else
            pass "secrets outside data tree excluded"
        fi
        rm -rf "${tmp}"
    else
        fail_test "baseline backup for secrets test failed"
    fi
}

main() {
    require_commands
    test_missing_items_json
    test_invalid_items_json
    test_schema_invalid_item
    test_invalid_draft_json
    test_schema_invalid_draft
    test_symlink_in_drafts
    test_unexpected_non_regular_file
    test_concurrent_lock_rejection
    test_stability_retry_then_success
    test_stability_exhausted
    test_pre_rename_failure_no_final_artifact
    test_retention_preserves_unknown_file
    test_empty_drafts_success
    test_unicode_draft_filename_rejected
    test_secrets_outside_data_tree_excluded

    log "summary pass=${PASS} fail=${FAIL}"
    (( FAIL == 0 ))
}

main "$@"
