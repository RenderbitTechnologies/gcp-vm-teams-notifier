# Claude Code cloud environment

Cloud environments are created in the claude.ai UI, not from files in the repo.
This directory holds what to enter there, plus the SessionStart hook that
`.claude/settings.json` runs in every cloud session.

## Create the environment

At [claude.ai/code](https://claude.ai/code), open the environment selector and
add an environment with these values.

**Name:** `gcp-vm-teams-notifier`

**Network access:** Custom, with **Also include default list of common package
managers** checked, and this allowed domain:

```text
registry.terraform.io
```

The default list already covers `releases.hashicorp.com` (Terraform and
provider downloads) and `registry.npmjs.org`. `registry.terraform.io` is not in
it, and `terraform init` needs it to resolve providers.

**Environment variables:** paste the contents of
[`.env.example`](../../.env.example), which explains each value. Anyone using
the environment can read these values, so don't add `GOOGLE_CREDENTIALS`,
`TF_VAR_*` or real Teams webhook URLs.

**Setup script:** choose [`setup.sh`](setup.sh). It installs Terraform; Node.js
22 is already on the image.

## What runs in a session

1. `setup.sh` runs once per cached image (rebuilt when the script changes or
   after about 7 days).
2. [`session-start.sh`](session-start.sh) runs on each session start and
   resume, but only when `CLAUDE_CODE_REMOTE=true`. It runs `npm ci` in `src/`
   when the lockfile changes, and `terraform init -backend=false` if providers
   aren't installed yet.

## What works in the cloud

- `terraform fmt`, `terraform validate`
- `npm test` in `src/` (the same checks as `.github/workflows/ci.yml`)
- `npm start` in `src/` and the mock Pub/Sub `curl` from `CLAUDE.md`. The POST
  to Teams fails, because the webhook is a dummy and Teams hosts aren't
  allowlisted.

`terraform plan` and `apply` won't work: the session has no GCP credentials and
skips the GCS state backend. Deploys go through the GitHub Actions workflow.
