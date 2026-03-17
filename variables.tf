variable "project_id" {
  description = "The GCP project ID where the central Pub/Sub topic and Cloud Function will be deployed."
  type        = string
}

variable "region" {
  description = "The GCP region to deploy the Cloud Function (e.g., us-central1)."
  type        = string
  default     = "us-central1"
}

variable "projects_to_monitor" {
  description = "List of GCP Project IDs to monitor for VM creations."
  type        = list(string)
}

variable "teams_webhook_map" {
  description = "A mapping of GCP Project IDs to Microsoft Teams Webhook URLs. Must include a 'default' key."
  type        = map(string)
}
