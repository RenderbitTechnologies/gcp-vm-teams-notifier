# GCP VM to MS Teams Notifier

A Terraform module and Node.js Cloud Function to monitor Google Cloud Projects for Virtual Machine creations and send an AdaptiveCard notification to Microsoft Teams channels.

## Requirements

- Terraform (v1.5+ recommended)
- Google Cloud SDK (`gcloud`) authenticated with sufficient privileges to create Pub/Sub topics, Cloud Functions, and Project Log Sinks.
- A central GCP project where the function will live.
- Microsoft Teams Incoming Webhook URLs for each environment or a default channel.

## Usage

1. **Configure Variables:**
   Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in your values:

   ```hcl
   project_id = "my-central-hub-project-id"

   region = "us-central1"

   projects_to_monitor = [
     "my-production-project-id",
     "my-development-project-id"
   ]

   teams_webhook_map = {
     "default"                   = "https://your.webhook.url"
     "my-production-project-id"  = "https://your.prod.webhook.url"
   }
   ```

2. **Deploy with Terraform:**

   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

3. **Verify:**
   - Create a new VM instance in one of your monitored projects.
   - You should instantly receive a Microsoft Teams notification with the VM Name, Project ID, Zone, Creator's Email, and a button to view it in the GCP Console.

## How it works

1. **A VM is created in GCP Compute Engine:** the `v1.compute.instances.insert` method generates an Audit Log event.
2. **Log Sink:** routes this matching Audit Log from the project to a central Pub/Sub topic spanning the organization/projects.
3. **Cloud Function V2 (Node.js 22):** parses the JSON audit log, identifies the appropriate generic Teams webhook URL from its `WEBHOOK_MAP` environment variable based on project ID, constructs an AdaptiveCard payload, and performs an HTTP POST request to Teams.
