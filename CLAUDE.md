# CLAUDE.md

This file provides guidance to [Claude Code](https://claude.ai/code) when working with code in this repository.

## Project Overview

This project deploys a GCP monitoring solution that detects Virtual Machine creation events across multiple Google Cloud projects and sends notifications to Microsoft Teams channels. The solution uses:

- **Terraform** for infrastructure-as-code deployment
- **Cloud Functions** (Node.js 22) for event processing
- **Pub/Sub** for event routing
- **Log Sinks** for cross-project log aggregation

## Project Structure

```
├── main.tf                          # Main Terraform configuration
├── variables.tf                     # Terraform variable definitions
├── terraform.tfvars.example         # Example configuration (copy to terraform.tfvars)
├── src/
│   ├── index.js                     # Cloud Function handler
│   └── package.json                 # Node.js dependencies
└── .github/workflows/terraform.yml  # CI/CD pipeline
```

## Common Development Commands

### Infrastructure Management

```bash
# Initialize Terraform and download providers
terraform init

# Review planned changes
terraform plan

# Apply infrastructure changes
terraform apply

# Format Terraform files
terraform fmt

# Validate Terraform syntax
terraform validate
```

### Workflow: Testing Changes Locally Before Deployment

1. **Test Cloud Function locally** before deploying infrastructure:

```bash
cd src
npm install

# Set webhook map environment variable
export WEBHOOK_MAP='{"default": "https://your.webhook.url"}'

# Start Functions Framework
npm start
```

2. **Send a mock Pub/Sub event** (in another terminal):

```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -H "ce-id: mock-event-123" \
  -H "ce-source: //pubsub.googleapis.com/" \
  -H "ce-specversion: 1.0" \
  -H "ce-type: google.cloud.pubsub.topic.v1.messagePublished" \
  -d '{"message": {"data": "ewogICJwcm90b1BheWxvYWQiOiB7CiAgICAiYXV0aGVudGljYXRpb25JbmZvIjogeysicHJpbmNpcGFsRW1haWwiOiAidGVzdEBleGFtcGxlLmNvbSJ9fSwKICAicmVzb3VyY2UiOiB7ImxhYmVscyI6IHsicHJvamVjdF9pZCI6ICJteS1wcm9qZWN0IiwgImluc3RhbmNlX2lkIjogIjEyMyIsICJ6b25lIjogInVzLWNlbnRyYWwxLWEifX0KfQ=="}}'
```

The base64 string above decodes to a test payload - you can generate your own with: `echo '{"protoPayload":{"authenticationInfo":{"principalEmail":"test@test.com"}},"resource":{"labels":{"project_id":"my-project","instance_id":"123","zone":"us-central1-a"}}}' | base64`

3. **Verify Teams webhook received the notification**

4. **Deploy to GCP** only after successful local testing:

```bash
terraform plan -out=tfplan
terraform apply tfplan
```

## Critical Configuration Requirements

### Required Terraform Variables (terraform.tfvars)

The following variables are required and **must** be present in `terraform.tfvars`:

- `project_id`: Central GCP project ID where resources will be deployed
- `region`: GCP region for deployment (default: `us-central1`)
- `projects_to_monitor`: Array of GCP project IDs to monitor (e.g., `["prod-project", "dev-project"]`)
- `teams_webhook_map`: Map with **mandatory** `default` key and project-specific overrides

Example `teams_webhook_map`:

```hcl
teams_webhook_map = {
  "default" = "https://webhook.default.com"  # Required
  "my-prod-project" = "https://webhook.prod.com"  # Optional per-project override
}
```

### Required GCP APIs

Before deploying, ensure these APIs are enabled in the central project:

- Cloud Logging API
- Cloud Functions API
- Eventarc API

Enable with:

```bash
gcloud services enable logging.googleapis.com cloudfunctions.googleapis.com eventarc.googleapis.com
```

## Architecture Details

### Event Flow

1. **VM Creation** → `compute.instances.insert` creates audit log in monitored project
2. **Log Sink** → Cross-project sink forwards matching logs to central Pub/Sub topic
3. **Pub/Sub Message** → Triggers Cloud Function via Eventarc
4. **Cloud Function** → Parses JSON, builds AdaptiveCard, posts to Teams webhook

### Key Resources Created

- **Pub/Sub Topic**: Central topic `gcp-vm-creation-alerts` for all monitored projects
- **Log Sinks**: One per monitored project (created via `for_each`), filters on `compute.instances.insert`
- **Cloud Storage**: Bucket stores zipped function source code
- **Cloud Function v2**: Node.js 22 runtime, triggered by Pub/Sub events
- **IAM Bindings**: Grants Log Sink service accounts publish permissions to the Pub/Sub topic

### Cloud Function Logic

Events are processed in `src/index.js`:

- Parses Pub/Sub message from CloudEvent format
- Extracts VM details: `projectId`, `instanceId`, `zone`, `creator`, `vmName`
- Determines webhook URL: project-specific override or `default`
- Constructs Microsoft Teams AdaptiveCard payload with VM details
- Makes POST request to Teams webhook with 60s timeout

## CI/CD Configuration

GitHub Actions automatically deploys when changes are pushed to `main`. Required secrets:

- `GOOGLE_CREDENTIALS`: Service Account JSON key with minimal permissions
- `TF_VAR_project_id`: Central GCP project ID
- `TF_VAR_region`: Deployment region
- `TF_VAR_projects_to_monitor`: JSON array of projects (e.g., `["proj-a","proj-b"]`)
- `TF_VAR_teams_webhook_map`: JSON map of project → webhook mappings

**Note**: When updating function code, `terraform plan` will show recreation of the entire function due to the zip archive checksum changing.

## Important Considerations

### State Backend

Terraform uses a GCS backend bucket `hosting-vms-terraform-state`. Ensure this bucket exists in the same project before running `terraform init`.

### Error Handling

- Function gracefully handles missing or invalid JSON in Pub/Sub messages
- Missing `WEBHOOK_MAP` environment variable causes early exit with warning
- Teams webhook failures are logged but don't crash the function
- Network errors are caught and logged

### Performance

- Function timeout: 60 seconds (sufficient for Teams HTTP call)
- Memory: 256MB (adequate for parsing JSON and HTTP overhead)
- Max instances: 10 concurrent executions
- No automatic retries (`RETRY_POLICY_DO_NOT_RETRY`) - messages lost if function fails

### Security

- Use minimal-permissions service account for deployment
- Teams webhooks are stored in environment variables, not in code
- Service Account used by Log Sinks automatically provisioned by Terraform
- No sensitive data logged beyond VM creation details

## Testing Checklist

When making changes, verify:

- [ ] Local function starts successfully (`npm start`)
- [ ] Mock Pub/Sub event triggers function correctly
- [ ] Teams webhook receives formatted AdaptiveCard
- [ ] Terraform syntax validated (`terraform validate`)
- [ ] Terraform formatting applied (`terraform fmt`)
- [ ] CI/CD secrets are configured (for pushes to main)
- [ ] Function code changes tested locally first
