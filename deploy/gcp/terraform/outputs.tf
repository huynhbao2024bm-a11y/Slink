output "public_ip" {
  description = "Static public IP to point the chosen domain's A record at."
  value       = google_compute_address.public.address
}

output "backup_bucket" {
  description = "Private GCS bucket for encrypted database backups."
  value       = google_storage_bucket.backups.name
}

output "artifact_registry" {
  description = "Regional Artifact Registry host."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/slink"
}

output "release_service_account" {
  value = google_service_account.release.email
}

output "github_workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "vm_instance_name" {
  value = google_compute_instance.slink.name
}

output "vm_zone" {
  value = var.zone
}

output "secret_ids" {
  description = "Create a secret version for each ID before activating the host. Terraform does not create secret values."
  value       = sort([for secret in google_secret_manager_secret.runtime : secret.secret_id])
}
