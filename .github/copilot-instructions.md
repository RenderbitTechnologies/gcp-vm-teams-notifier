# Copilot Instructions

## Build, test, and lint commands

From the repository root:

```bash
terraform init
terraform fmt
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

For local Cloud Function work:

```bash
cd src
npm install
export WEBHOOK_MAP='{"default":"https://your.webhook.url"}'
npm start
```

To run a single end-to-end local function test, start the function with `npm start` and send one mock Pub/Sub CloudEvent:

```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -H "ce-id: mock-event-id-123" \
  -H "ce-source: //pubsub.googleapis.com/" \
  -H "ce-specversion: 1.0" \
  -H "ce-type: google.cloud.pubsub.topic.v1.messagePublished" \
  -d '{
        "message": {
          "data": "ewogICJwcm90b1BheWxvYWQiOiB7CiAgICAiYXV0aGVudGljYXRpb25JbmZvIjogewogICAgICAicHJpbmNpcGFsRW1haWwiOiAidGVzdC51c2VyQGV4YW1wbGUuY29tIgogICAgfSwKICAgICJyZXNvdXJjZU5hbWUiOiAicHJvamVjdHMvbXktcHJvamVjdC96b25lcy91cy1jZW50cmFsMS1hL2luc3RhbmNlcy90ZXN0LXZtLWxvY2FsIgogIH0sCiAgInJlc291cmNlIjogewogICAgImxhYmVscyI6IHsKICAgICAgInByb2plY3RfaWQiOiAibXktcHJvamVjdCIsCiAgICAgICJpbnN0YW5jZV9pZCI6ICIxMjM0NTY3ODkwIiwKICAgICAgInpvbmUiOiAidXMtY2VudHJhbDEtYSIKICAgIH0KICB9Cn0="
        }
      }'
```

There is no automated unit test suite or npm lint script in this repository. The existing verification flow is `terraform validate` plus the manual local Cloud Function test above.

## High-level architecture

This repository is split between Terraform-managed infrastructure at the root and a Node.js Cloud Function in `src/`.

- `main.tf` provisions the central resources in `var.project_id`: a Pub/Sub topic, a storage bucket for function source, and a Cloud Functions v2 service.
- The same Terraform file also creates one `google_logging_project_sink` per monitored project using `for_each = toset(var.projects_to_monitor)`. Each sink forwards `compute.instances.insert` audit logs into the central Pub/Sub topic, and a matching IAM binding grants that sink's `writer_identity` the `roles/pubsub.publisher` role.
- `data.archive_file.function_zip` packages the entire `src/` directory into `function-source.zip`. Terraform uploads that zip to Cloud Storage and deploys the function from the uploaded object.
- `src/index.js` registers the `processVmEvent` CloudEvent handler. It expects a Pub/Sub-delivered CloudEvent, base64-decodes `cloudEvent.data.message.data`, parses the GCP audit log JSON, extracts VM details, resolves the Teams webhook, builds an Adaptive Card, and posts it to Microsoft Teams.
- `.github/workflows/terraform.yml` is the deployment path used in CI: on pushes to `main` and on `workflow_dispatch`, it authenticates to GCP, runs `terraform init`, `terraform plan -out=tfplan`, and `terraform apply -auto-approve tfplan`.

## Key conventions

- `teams_webhook_map` must include a `default` key. The function first checks for a project-specific webhook using the GCP `project_id`, then falls back to `default`.
- The function's expected test/event shape is the GCP audit log shape, not an arbitrary JSON payload. Local test payloads should include `resource.labels.project_id`, `resource.labels.instance_id`, `resource.labels.zone`, and `protoPayload.authenticationInfo.principalEmail`; `protoPayload.resourceName` is used to derive the VM name when present.
- There is no separate Node.js build step. Any change under `src/` changes the archive checksum, which changes the uploaded object name and causes Terraform plans to show the Cloud Function being updated/redeployed.
- The central project hosts the Pub/Sub topic, Cloud Function, and source bucket. The projects listed in `projects_to_monitor` are only sources of audit logs via log sinks.
- The Terraform backend is a GCS backend hard-coded to the bucket `hosting-vms-terraform-state`, so that bucket must already exist before `terraform init` will work.
- CI secrets use uppercase names such as `TF_VAR_PROJECT_ID`, but the workflow exports them into Terraform's expected lowercase environment variable names such as `TF_VAR_project_id`.
