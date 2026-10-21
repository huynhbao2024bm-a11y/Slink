variable "project_id" {
  description = "Google Cloud project ID used for the Slink hosted trial."
  type        = string
}

variable "billing_account_id" {
  description = "Billing account ID used for budget alerts. This does not cap spend."
  type        = string
  sensitive   = true
}

variable "github_repository" {
  description = "GitHub repository allowed to publish the manually dispatched image workflow."
  type        = string
  default     = "huynhbao2024bm-a11y/Slink"
}

variable "operator_email" {
  description = "Google identity authorized for IAP SSH and VM administration."
  type        = string

  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+\\.[^@ ]+$", var.operator_email))
    error_message = "operator_email must be the Google account email that will administer the VM."
  }
}

variable "region" {
  description = "Google Cloud region for the trial host and backup bucket."
  type        = string
  default     = "asia-southeast1"
}

variable "zone" {
  description = "Compute Engine zone for the single trial VM."
  type        = string
  default     = "asia-southeast1-b"

  validation {
    condition     = startswith(var.zone, "${var.region}-")
    error_message = "zone must belong to the selected region."
  }
}

variable "domain" {
  description = "Public hostname for Slink. Required before Terraform can create resources."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$", var.domain)) && length(split(".", var.domain)) >= 2 && !endswith(var.domain, ".invalid") && !strcontains(var.domain, "replace")
    error_message = "Set domain to the exact public hostname after it has been chosen."
  }
}

variable "machine_type" {
  description = "Single-instance trial size; review live regional prices before apply."
  type        = string
  default     = "e2-medium"
}

variable "monthly_budget_usd" {
  description = "Monthly budget alert amount in USD. Budget alerts are notifications, not a spending cap."
  type        = number
  default     = 100

  validation {
    condition     = var.monthly_budget_usd > 0 && var.monthly_budget_usd <= 300
    error_message = "The alert amount must be greater than zero and no more than the trial's advertised $300 credit."
  }
}
