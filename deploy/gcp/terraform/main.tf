terraform {
  required_version = ">= 1.8.0, < 2.0.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

data "google_project" "current" {
  project_id = var.project_id
}

locals {
  name_prefix = "slink-trial"
  secrets = toset([
    "postgres-admin-password",
    "slink-app-password",
    "slink-migrator-password",
    "email-delivery-url",
    "email-delivery-token",
    "backup-encryption-key-v1",
  ])
  enabled_apis = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "iap.googleapis.com",
    "oslogin.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ])
}

resource "google_project_service" "enabled" {
  for_each           = local.enabled_apis
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = "slink"
  description   = "Versioned Slink API and database-operations images."
  format        = "DOCKER"

  docker_config {
    immutable_tags = true
  }

  depends_on = [google_project_service.enabled]
}

resource "google_service_account" "host" {
  project      = var.project_id
  account_id   = "slink-host"
  display_name = "Slink trial VM runtime"
}

resource "google_service_account" "release" {
  project      = var.project_id
  account_id   = "slink-github-release"
  display_name = "Slink GitHub image publisher"
}

resource "google_project_iam_member" "operator_os_admin" {
  project = var.project_id
  role    = "roles/compute.osAdminLogin"
  member  = "user:${var.operator_email}"
}

resource "google_project_iam_member" "operator_iap_tunnel" {
  project = var.project_id
  role    = "roles/iap.tunnelResourceAccessor"
  member  = "user:${var.operator_email}"
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "slink-github"
  display_name              = "Slink GitHub Actions"
  description               = "OIDC identity for manually publishing reviewed Slink releases from main."
  disabled                  = false
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-main-release"
  display_name                       = "Slink main release workflow"

  attribute_mapping = {
    "google.subject"         = "assertion.sub"
    "attribute.repository"   = "assertion.repository"
    "attribute.ref"          = "assertion.ref"
    "attribute.workflow_ref" = "assertion.workflow_ref"
    "attribute.event_name"   = "assertion.event_name"
  }

  attribute_condition = "assertion.repository == \"${var.github_repository}\" && assertion.ref == \"refs/heads/main\" && assertion.event_name == \"workflow_dispatch\" && assertion.workflow_ref == \"${var.github_repository}/.github/workflows/publish-gcp-container.yml@refs/heads/main\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  depends_on = [google_project_service.enabled]
}

resource "google_service_account_iam_member" "release_federation" {
  service_account_id = google_service_account.release.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_artifact_registry_repository_iam_member" "release_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.release.email}"
}

resource "google_artifact_registry_repository_iam_member" "host_reader" {
  project    = var.project_id
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.host.email}"
}

resource "google_secret_manager_secret" "runtime" {
  for_each  = local.secrets
  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_iam_member" "host_reader" {
  for_each  = google_secret_manager_secret.runtime
  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.host.email}"
}

resource "random_id" "backup_bucket_suffix" {
  byte_length = 4
}

resource "google_storage_bucket" "backups" {
  project                     = var.project_id
  name                        = "slink-backups-${random_id.backup_bucket_suffix.hex}"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 35
    }
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      days_since_noncurrent_time = 35
      with_state                 = "ARCHIVED"
    }
  }

  depends_on = [google_project_service.enabled]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket_iam_member" "host_backup_writer" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.host.email}"
}

resource "google_storage_bucket_iam_member" "host_backup_reader" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.host.email}"
}

resource "google_compute_network" "slink" {
  project                 = var.project_id
  name                    = "${local.name_prefix}-network"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "slink" {
  project       = var.project_id
  name          = "${local.name_prefix}-subnet"
  region        = var.region
  network       = google_compute_network.slink.id
  ip_cidr_range = "10.84.0.0/24"
}

resource "google_compute_firewall" "web" {
  project     = var.project_id
  name        = "${local.name_prefix}-web"
  network     = google_compute_network.slink.name
  direction   = "INGRESS"
  priority    = 1000
  target_tags = ["slink-web"]

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "iap_ssh" {
  project     = var.project_id
  name        = "${local.name_prefix}-iap-ssh"
  network     = google_compute_network.slink.name
  direction   = "INGRESS"
  priority    = 1000
  target_tags = ["slink-web"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  source_ranges = ["35.235.240.0/20"]
}

resource "google_compute_address" "public" {
  project      = var.project_id
  name         = "${local.name_prefix}-ip"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"
}

resource "google_compute_resource_policy" "database_snapshots" {
  project = var.project_id
  name    = "${local.name_prefix}-db-snapshots"
  region  = var.region

  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "03:00"
      }
    }
    retention_policy {
      max_retention_days    = 14
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
    snapshot_properties {
      storage_locations = [var.region]
      labels = {
        application = "slink"
        purpose     = "database-recovery"
      }
    }
  }
}

resource "google_compute_disk" "database" {
  project = var.project_id
  name    = "${local.name_prefix}-database"
  zone    = var.zone
  type    = "pd-balanced"
  size    = 40
  labels = {
    application = "slink"
    data        = "postgresql"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_disk_resource_policy_attachment" "database_snapshots" {
  project = var.project_id
  name    = google_compute_resource_policy.database_snapshots.name
  disk    = google_compute_disk.database.name
  zone    = var.zone
}

resource "google_compute_instance" "slink" {
  project                   = var.project_id
  name                      = "slink-trial"
  zone                      = var.zone
  machine_type              = var.machine_type
  allow_stopping_for_update = true
  deletion_protection       = true
  tags                      = ["slink-web"]

  boot_disk {
    auto_delete = true
    initialize_params {
      image = "projects/debian-cloud/global/images/family/debian-12"
      size  = 30
      type  = "pd-balanced"
    }
  }

  attached_disk {
    source      = google_compute_disk.database.id
    device_name = "slink-data"
    mode        = "READ_WRITE"
  }

  network_interface {
    network    = google_compute_network.slink.id
    subnetwork = google_compute_subnetwork.slink.id
    access_config {
      nat_ip       = google_compute_address.public.address
      network_tier = "PREMIUM"
    }
  }

  service_account {
    email  = google_service_account.host.email
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  metadata = {
    enable-oslogin         = "TRUE"
    block-project-ssh-keys = "TRUE"
    serial-port-enable     = "FALSE"
  }

  metadata_startup_script = templatefile("${path.module}/startup.sh.tftpl", {
    compose_b64         = filebase64("${path.module}/../compose.yaml")
    caddy_b64           = filebase64("${path.module}/../Caddyfile")
    database_init_b64   = filebase64("${path.module}/../postgres-init/10-roles.sh")
    backup_script_b64   = filebase64("${path.module}/../backup.sh")
    backup_service_b64  = filebase64("${path.module}/../backup.service")
    backup_timer_b64    = filebase64("${path.module}/../backup.timer")
    activate_script_b64 = filebase64("${path.module}/../activate-host.sh")
    release_script_b64  = filebase64("${path.module}/../deploy-release.sh")
    project_id          = var.project_id
    region              = var.region
    domain              = var.domain
    backup_bucket       = google_storage_bucket.backups.name
  })

  labels = {
    application = "slink"
    purpose     = "competition-trial"
  }

  depends_on = [google_project_service.enabled]
}

resource "google_billing_budget" "trial" {
  billing_account = var.billing_account_id
  display_name    = "Slink GCP trial monthly alert"

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(floor(var.monthly_budget_usd))
      nanos         = floor((var.monthly_budget_usd - floor(var.monthly_budget_usd)) * 1000000000)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.75
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.9
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  depends_on = [google_project_service.enabled]
}
