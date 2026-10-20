# Slink hosted release preparation

This directory prepares Slink for a hosted trial. It does not create cloud resources or deploy the app.

## Release image

The `Publish Slink container` workflow publishes `ghcr.io/<owner>/slink:<version>` and `:latest` when a version tag such as `v1.0.0` is pushed. It builds the repository's production `Dockerfile`; no server or database is created by this workflow.

## Production database migration

Before dispatching `Prepare production database` in GitHub Actions:

1. Create the GitHub Actions environment named `production` and add `MIGRATION_DATABASE_URL` as an environment secret.
2. Configure required reviewers for that environment if an approval gate is desired.
3. Provision the PostgreSQL database and restricted roles. `slink_migrator` must be a non-superuser with `BYPASSRLS` and schema creation rights. `slink_app` must not bypass RLS and must have only application privileges. The host must permit these role attributes.
4. Create and verify a recoverable backup, then enter its reference when manually dispatching the workflow.

The workflow applies pending migrations and then checks the application/migration role boundaries. It does not create a database, create roles, take a backup, or deploy the API.

## Values needed before a hosted trial

Provide the chosen container host, PostgreSQL host/provider, public domain and DNS access, email-delivery service details, and the hosting/registry account access method. Configure the keys from `production.env.example` using the provider's secret manager. `PUBLIC_ORIGIN` must use HTTPS, PostgreSQL must accept TLS, and the API should be reachable through HTTPS only. Do not send credentials in chat; use the provider's secret manager or an approved local setup flow.
