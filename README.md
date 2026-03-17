# GCP VM to MS Teams Notifier

A Terraform module and Node.js Cloud Function to monitor Google Cloud Projects for Virtual Machine creations and send an AdaptiveCard notification to Microsoft Teams channels.

## Requirements

- Terraform (v1.5+ recommended)
- Google Cloud SDK (`gcloud`) authenticated with sufficient privileges to create Pub/Sub topics, Cloud Functions, and Project Log Sinks.
- A central GCP project where the function will live.
- Microsoft Teams Incoming Webhook URLs for each environment or a default channel.

## Setup Instructions

### 1. Create a Microsoft Teams Webhook

1. Navigate to your Microsoft Teams application and select the channel where you want to receive VM creation alerts.
2. Click the `...` (More options) next to the channel name and select **Connectors**.
3. Search for the **Incoming Webhook** connector. Focus on configuring it if it's already added, or click **Add**.
4. Provide a recognizable name for the webhook (e.g., "GCP VM Alerts"), upload an icon if desired, and click **Create**.
5. **Copy the webhook URL** provided. Save this URL for the Terraform configuration step.
6. Click **Done**.

### 2. Prepare Google Cloud Environment

Before running Terraform, ensure you are authenticated and have the necessary permissions:

```bash
# Login to your Google Cloud account
gcloud auth login

# Make sure you provide application default credentials (ADC) for Terraform
gcloud auth application-default login

# Optional: set your active project for CLI commands
gcloud config set project <your-central-hub-project-id>
```

You must have sufficient privileges in your target GCP project to create Pub/Sub topics, Cloud Functions, and Storage Buckets. You will also need permissions to create Log Sinks in the projects you want to monitor.

### 3. Configure Terraform Variables

Copy the provided example file to create your active variables file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and fill in your values:

```hcl
project_id = "my-central-hub-project-id"

region = "us-central1"

projects_to_monitor = [
  "my-production-project-id",
  "my-development-project-id"
]

teams_webhook_map = {
  "default"                   = "https://your.webhook.url.copied.from.teams"
  "my-production-project-id"  = "https://your.prod.webhook.url"
}
```

### 4. Deploy with Terraform

Initialize and apply the Terraform configuration. This will package the Node.js function, create the Cloud Storage bucket, set up the Pub/Sub topic, deploy the Cloud Function V2, and wire the Log Sinks across all monitored projects.

```bash
# Initialize Terraform providers
terraform init

# Review the infrastructure changes to be made
terraform plan

# Apply the infrastructure
terraform apply
```

Type `yes` when prompted by Terraform to apply the changes.

### 5. Verify the Integration

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Select one of the projects listed in your `projects_to_monitor` variable.
3. Navigate to **Compute Engine > VM instances**.
4. Click **Create Instance** and finish creating a test VM.
5. You should instantly receive a Microsoft Teams notification with the VM Name, Project ID, Zone, Creator's Email, and a button to view it in the GCP Console.

## How it works

1. **A VM is created in GCP Compute Engine:** the `v1.compute.instances.insert` method generates an Audit Log event.
2. **Log Sink:** routes this matching Audit Log from the project to a central Pub/Sub topic spanning the organization/projects.
3. **Cloud Function V2 (Node.js 22):** parses the JSON audit log, identifies the appropriate generic Teams webhook URL from its `WEBHOOK_MAP` environment variable based on project ID, constructs an AdaptiveCard payload, and performs an HTTP POST request to Teams.
