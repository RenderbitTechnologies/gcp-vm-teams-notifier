#!/bin/bash
# SessionStart hook: installs project dependencies in Claude Code cloud sessions.
# No-op locally. Runs on every startup/resume, so each step skips work already done.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Cloud Function dependencies, reinstalled only when the lockfile changes
hashes=src/node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  if (cd src && npm ci --no-audit --no-fund); then
    sha256sum src/package.json src/package-lock.json > "$hashes" || rm -f "$hashes"
  fi
fi

# Terraform providers for `terraform validate`. The GCS backend needs GCP
# credentials, so it is skipped; -lockfile=readonly keeps the cloud VM from
# adding linux hashes to .terraform.lock.hcl. Re-runs init until it succeeds
# and whenever the lockfile or provider constraints change.
hashes=.terraform/.session-start.sha256
if command -v terraform >/dev/null && ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  if terraform init -backend=false -input=false -lockfile=readonly >/dev/null; then
    sha256sum .terraform.lock.hcl main.tf > "$hashes" || rm -f "$hashes"
  else
    echo "terraform init failed; is registry.terraform.io in the environment's allowed domains?" >&2
  fi
fi

exit 0
