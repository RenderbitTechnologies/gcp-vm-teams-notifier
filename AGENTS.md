# AGENTS.md

Root Terraform provisions a cross-project VM-creation alert pipeline; `src/` is the Node 22 Cloud Function that posts AdaptiveCards to Teams. Deploys happen through GitHub Actions on push to `main`, so local work stops at `npm test` plus `terraform fmt/validate`.

## Commands

```bash
cd src && npm ci && npm test        # node:test suite, 14 tests; no lint or build step exists
cd src && node --test --test-name-pattern="project-specific webhook" test/index.test.js   # one test

terraform fmt -check -recursive
terraform init -backend=false -input=false   # plain `init` needs GCP creds and the state bucket
terraform validate
```

That Terraform block is CI's check (CI adds `-diff` to fmt). Run both halves before pushing to `main`: `terraform.yml` calls `ci.yml` first and only then plans/applies.

Local function: `WEBHOOK_MAP='{"default":"https://example.invalid/webhook"}' npm start` serves on `:8080`; README has the mock Pub/Sub `curl`. The POST to Teams fails on purpose with the dummy URL.

## Wiring that is easy to break

- `main.tf` holds every resource: Pub/Sub topic `gcp-vm-creation-alerts`, one log sink per `projects_to_monitor`, publisher IAM for each sink's `writer_identity`, source bucket, Cloud Functions v2, and a no-retry Pub/Sub trigger.
- `data.archive_file` zips all of `src/` (excluding `test` and `node_modules`) into the gitignored `function-source.zip`. The GCS object name contains the zip md5, so any edit under `src/` shows up as a function update in `terraform plan`. Terraform builds this zip; there is no npm packaging script.
- The handler must stay registered as `functions.cloudEvent("processVmEvent", ...)`. Tests `require("../index.js")` to register it, then call `getFunction("processVmEvent")`; the same name is `entry_point` in `main.tf` and the `--target` in `npm start`.
- `WEBHOOK_MAP` exists only because Terraform sets it from `jsonencode(var.teams_webhook_map)`. Change routing in `terraform.tfvars`, not in code.
- Routing is `map[projectId] || map["default"]`; with neither, the function logs a warning and returns without posting. Terraform does not validate that `default` exists.
- The payload is a GCP audit log, not arbitrary JSON: `resource.labels.{project_id,instance_id,zone}`, `protoPayload.authenticationInfo.principalEmail`, and `protoPayload.resourceName` (VM name, falling back to `instance_id`). Local fixtures must keep that shape.

## CI and secrets

- `ci.yml` needs no secrets and runs on PRs, manual dispatch, and as a reusable workflow.
- `terraform.yml` runs on push to `main`, authenticates with `GOOGLE_CREDENTIALS`, and applies against the GCS backend.
- GitHub secret names are uppercase (`TF_VAR_PROJECT_ID`, `TF_VAR_REGION`, `TF_VAR_PROJECTS_TO_MONITOR`, `TF_VAR_TEAMS_WEBHOOK_MAP`); the workflow maps them to Terraform's lowercase `TF_VAR_*` env vars. README lists the lowercase env form, not the secret name.
- The backend bucket `hosting-vms-terraform-state` is hardcoded in `main.tf` and must already exist.
- Keep real webhook URLs, `*.tfvars`, and credentials out of tracked files; `.env.example` is deliberately dummy.

## Existing docs

`CLAUDE.md`, `GEMINI.md`, `README.md`, and `.github/copilot-instructions.md` overlap heavily with each other. `.github/copilot-instructions.md` claims there is no unit test suite — tests exist in `src/test/`.
