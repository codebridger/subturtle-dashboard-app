#!/usr/bin/env bash
# Prints the dashboard version that the Release workflow cut for a pushed commit, so the
# dashboard build can show it in the footer.
#
# Why: a push to main/dev starts Release and Deploy at the same moment. Deploy builds the pushed
# commit, whose frontend/package.json still has the OLD version; semantic-release only bumps it
# afterwards, in a separate `chore(release): X [skip ci]` commit whose parent is the pushed
# commit. So the footer showed the previous release. This waits for that Release run to finish,
# then reads the version out of its commit. The code that is built stays the tested commit; only
# the version string is taken from the release commit.
#
# It never fails the deploy: whenever the version can't be resolved (no Release run, run failed
# or timed out, nothing released) it prints nothing and the build keeps package.json's version.
#
# Usage: infra/release-version.sh <branch> <sha>      (needs `gh` + GH_TOKEN with actions: read)
# Env:   RELEASE_WAIT_SECONDS (default 1200), RELEASE_POLL_SECONDS (default 15)
set -uo pipefail

branch=${1:?usage: release-version.sh <branch> <sha>}
sha=${2:?usage: release-version.sh <branch> <sha>}
wait_seconds=${RELEASE_WAIT_SECONDS:-1200}
poll_seconds=${RELEASE_POLL_SECONDS:-15}

log() { echo "release-version: $*" >&2; }

# The Release run for this exact commit. None exists when the commit is itself a `[skip ci]`
# release commit (a manual re-run of a deploy), and then package.json is already right.
run_state() {
  gh run list --workflow release.yml --branch "$branch" --event push --commit "$sha" \
    --limit 1 --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"' 2>/dev/null
}

state=$(run_state)
if [[ -z $state || $state == "null null" ]]; then
  log "no Release run for $sha; keeping the version in package.json"
  exit 0
fi

waited=0
while [[ ${state%% *} != completed ]]; do
  if ((waited >= wait_seconds)); then
    log "Release still running after ${wait_seconds}s; keeping the version in package.json"
    exit 0
  fi
  sleep "$poll_seconds"
  waited=$((waited + poll_seconds))
  state=$(run_state)
done

if [[ ${state#* } != success ]]; then
  log "Release run ended as '${state#* }'; keeping the version in package.json"
  exit 0
fi

# The release commit is a child of $sha. Look a little way back from the branch tip, since
# other commits may have landed since.
git fetch --quiet --depth=30 origin "$branch" || { log "fetch failed; keeping the version in package.json"; exit 0; }
while read -r commit parents subject; do
  if [[ $parents == "$sha" && $subject == chore\(release\):* ]]; then
    version=$(git show "$commit:frontend/package.json" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).version')
    log "Release run cut $version ($commit)"
    echo "$version"
    exit 0
  fi
done < <(git log --format='%H %P %s' -n 30 FETCH_HEAD)

log "Release run cut no new version for $sha; keeping the version in package.json"
exit 0
