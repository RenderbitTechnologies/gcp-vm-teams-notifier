# GCP VM to MS Teams Notifier

This project provides a Terraform-based infrastructure and a Node.js Cloud Function to monitor Virtual Machine (VM) creations across multiple Google Cloud projects. When a VM is created, it sends a formatted AdaptiveCard notification to a specified Microsoft Teams channel using an Incoming Webhook.

## Project Overview

- **Purpose:** Automated monitoring and notification system for GCP VM deployments.
- **Architecture:**
  - **Cloud Logging Sinks:** Capture `compute.instances.insert` audit logs from monitored projects.
  - **Pub/Sub Topic:** Receives log entries from the sinks.
  - **Cloud Function (v2):** Triggered by Pub/Sub, parses the audit log, and forwards the notification to Microsoft Teams.
  - **Terraform:** Manages all GCP resources including Log Sinks, Pub/Sub, and Cloud Functions.
- **Technologies:**
  - **Infrastructure:** Terraform (v1.5+)
  - **Runtime:** Node.js (v22)
  - **GCP Services:** Cloud Functions (v2), Pub/Sub, Cloud Logging, Cloud Storage.
  - **Integration:** Microsoft Teams Incoming Webhooks (AdaptiveCards v1.4).

## Building and Running

### Infrastructure Deployment (Terraform)

1. **Initialize:**

   ```bash
   terraform init
   ```

2. **Plan:**

   ```bash
   terraform plan
   ```

3. **Apply:**

   ```bash
   terraform apply
   ```

### Local Function Testing (Node.js)

The Cloud Function can be tested locally using the [Functions Framework](https://github.com/GoogleCloudPlatform/functions-framework-nodejs).

1. **Install Dependencies:**

   ```bash
   cd src
   npm install
   ```

2. **Start Local Server:**

   ```bash
   # Set required environment variables
   export WEBHOOK_MAP='{"default": "https://your.teams.webhook.url"}'
   npm start
   ```

3. **Simulate Event:**
   Send a mock Pub/Sub event to `http://localhost:8080` (see `README.md` for a sample `curl` command).

## Development Conventions

- **Infrastructure:**
  - Use `variables.tf` for configuration.
  - Follow standard Terraform resource naming conventions.
  - Log Sinks use a filter for `protoPayload.methodName:"compute.instances.insert"`.
- **Cloud Function:**
  - **Runtime:** Node.js 22.
  - **Entry Point:** `processVmEvent`.
  - **Error Handling:** Gracefully handles JSON parsing and network errors.
  - **Configuration:** Uses a `WEBHOOK_MAP` environment variable (JSON string) to map project IDs to specific Teams webhooks.
- **CI/CD:**
  - A GitHub Actions workflow (`.github/workflows/terraform.yml`) handles automated `terraform plan` and `terraform apply` on pushes to the `main` branch.
  - Requires secrets: `GOOGLE_CREDENTIALS`, `TF_VAR_PROJECT_ID`, `TF_VAR_REGION`, `TF_VAR_PROJECTS_TO_MONITOR`, and `TF_VAR_TEAMS_WEBHOOK_MAP`.

## Key Files

- `main.tf`: Defines the core GCP infrastructure.
- `variables.tf`: Configuration variables for the Terraform module.
- `src/index.js`: Core logic for processing audit logs and notifying MS Teams.
- `src/package.json`: Node.js dependencies and scripts.
- `README.md`: Detailed setup and usage instructions.
