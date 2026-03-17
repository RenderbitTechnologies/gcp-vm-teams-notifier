terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Central Pub/Sub Topic
resource "google_pubsub_topic" "vm_alerts" {
  name    = "gcp-vm-creation-alerts"
  project = var.project_id
}

# 2. Log Sinks for Monitored Projects
resource "google_logging_project_sink" "vm_creation_sink" {
  for_each               = toset(var.projects_to_monitor)
  name                   = "vm-creation-to-pubsub-${each.value}"
  project                = each.value
  destination            = "pubsub.googleapis.com/projects/${var.project_id}/topics/${google_pubsub_topic.vm_alerts.name}"

  # Filter for Compute Engine instance insertion audit logs
  filter                 = "protoPayload.methodName=\"v1.compute.instances.insert\" resource.type=\"gce_instance\" severity=NOTICE"
  unique_writer_identity = true
}

# 3. Grant Pub/Sub publish permissions to the Log Sink service accounts
resource "google_pubsub_topic_iam_member" "sink_publisher" {
  for_each = google_logging_project_sink.vm_creation_sink
  topic    = google_pubsub_topic.vm_alerts.id
  role     = "roles/pubsub.publisher"
  member   = each.value.writer_identity
}

# 4. Storage Bucket for Cloud Function Source
resource "google_storage_bucket" "function_source" {
  name                        = "${var.project_id}-gcf-source-bucket"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
}

# Zip the Cloud Function source code
data "archive_file" "function_zip" {
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/function-source.zip"
}

resource "google_storage_bucket_object" "function_zip" {
  name   = "function-source-${data.archive_file.function_zip.output_md5}.zip"
  bucket = google_storage_bucket.function_source.name
  source = data.archive_file.function_zip.output_path
}

# 5. Cloud Function (Node.js 22)
resource "google_cloudfunctions2_function" "teams_notifier" {
  name        = "gcp-vm-teams-notifier"
  location    = var.region
  project     = var.project_id

  build_config {
    runtime     = "nodejs22"
    entry_point = "processVmEvent"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source.name
        object = google_storage_bucket_object.function_zip.name
      }
    }
  }

  service_config {
    max_instance_count = 10
    available_memory   = "256M"
    timeout_seconds    = 60
    environment_variables = {
      WEBHOOK_MAP = jsonencode(var.teams_webhook_map)
    }
  }

  event_trigger {
    trigger_region = var.region
    event_type     = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic   = google_pubsub_topic.vm_alerts.id
    retry_policy   = "RETRY_POLICY_DO_NOT_RETRY"
  }
}
