# shellcheck shell=bash
# Sourced (not executed) by the Harness "Detect Changes" step so that the exported
# variables become step output variables. Do not call `exit` in this file: Harness
# drops output variables when a step script exits explicitly.
#
# Inputs (environment):
#   BUILD_TYPE      PR | branch | tag        (<+codebase.build.type>)
#   BASE_SHA        PR base commit           (<+codebase.baseCommitSha>)
#   PR_NUMBER       PR number                (<+codebase.prNumber>)
#   BRANCH          branch name              (<+codebase.branch>)
#   SHORT_SHA       short commit SHA         (<+codebase.shortCommitSha>)
#   FORCE_ALL       "true" builds every service regardless of changes
#   HARNESS_ACCOUNT account identifier       (<+account.identifier>)
#   HAR_REGISTRY    Harness Artifact Registry identifier
#
# Outputs (exported):
#   GO_CHANGED, JAVA_CHANGED, NODE_CHANGED   "true" | "false"
#   IMAGE_TAG                                docker tag for this build
#   HAR_REPO_PATH                            <account>/<registry> (image path without host)
#   HAR_IMAGE_PREFIX                         pkg.harness.io/<account>/<registry>

GO_PATH_RE='^services/telemetry-ingest/'
JAVA_PATH_RE='^services/fleet-service/'
NODE_PATH_RE='^services/dashboard-api/'
# Changes here can affect every service, so they rebuild everything.
SHARED_PATH_RE='^(\.harness/|scripts/ci/|\.ticonfig\.yaml$)'

_detect_all=false
[ "${FORCE_ALL:-false}" = "true" ] && _detect_all=true

if [ -n "${DRONE_NETRC_MACHINE:-}" ] && [ ! -f "$HOME/.netrc" ]; then
  printf 'machine %s\nlogin %s\npassword %s\n' \
    "$DRONE_NETRC_MACHINE" "${DRONE_NETRC_USERNAME:-}" "${DRONE_NETRC_PASSWORD:-}" > "$HOME/.netrc"
  chmod 600 "$HOME/.netrc"
fi

_changed=""
if [ "$_detect_all" = false ]; then
  if [ "${BUILD_TYPE:-}" = "PR" ] && [ -n "${BASE_SHA:-}" ] && [ "${BASE_SHA}" != "null" ]; then
    if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
      git fetch --no-tags --depth=100 origin "$BASE_SHA" >/dev/null 2>&1 || true
    fi
    if _changed=$(git diff --name-only "${BASE_SHA}...HEAD" 2>/dev/null); then
      :
    elif _changed=$(git diff --name-only "$BASE_SHA" HEAD 2>/dev/null); then
      :
    else
      echo "detect-changes: could not diff against PR base ${BASE_SHA}; building everything"
      _detect_all=true
    fi
  elif _changed=$(git diff --name-only HEAD~1 HEAD 2>/dev/null); then
    :
  else
    echo "detect-changes: no parent commit available; building everything"
    _detect_all=true
  fi
fi

if [ "$_detect_all" = false ] && printf '%s\n' "$_changed" | grep -Eq "$SHARED_PATH_RE"; then
  echo "detect-changes: shared CI files changed; building everything"
  _detect_all=true
fi

_flag() {
  if [ "$_detect_all" = true ] || printf '%s\n' "$_changed" | grep -Eq "$1"; then
    echo true
  else
    echo false
  fi
}

GO_CHANGED=$(_flag "$GO_PATH_RE")
JAVA_CHANGED=$(_flag "$JAVA_PATH_RE")
NODE_CHANGED=$(_flag "$NODE_PATH_RE")

_sha="${SHORT_SHA:-$(git rev-parse --short=7 HEAD 2>/dev/null || echo unknown)}"
if [ "${BUILD_TYPE:-}" = "PR" ] && [ -n "${PR_NUMBER:-}" ] && [ "${PR_NUMBER}" != "null" ]; then
  _tag="pr-${PR_NUMBER}-${_sha}"
else
  _tag="${BRANCH:-manual}-${_sha}"
fi
IMAGE_TAG=$(printf '%s' "$_tag" | tr -c 'A-Za-z0-9_.-' '-' | cut -c1-128)

_account=$(printf '%s' "${HARNESS_ACCOUNT:-}" | tr '[:upper:]' '[:lower:]')
HAR_REPO_PATH="${_account}/${HAR_REGISTRY:-}"
HAR_IMAGE_PREFIX="pkg.harness.io/${HAR_REPO_PATH}"

export GO_CHANGED JAVA_CHANGED NODE_CHANGED IMAGE_TAG HAR_REPO_PATH HAR_IMAGE_PREFIX

echo "Changed files:"
printf '%s\n' "${_changed:-<none / full build>}" | sed 's/^/  /'
echo "GO_CHANGED=$GO_CHANGED JAVA_CHANGED=$JAVA_CHANGED NODE_CHANGED=$NODE_CHANGED"
echo "IMAGE_TAG=$IMAGE_TAG"
echo "HAR_IMAGE_PREFIX=$HAR_IMAGE_PREFIX"

unset -f _flag
unset _detect_all _changed _sha _tag _account
