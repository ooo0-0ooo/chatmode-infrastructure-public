# GitHub delivery bridge

Reusable scripts and templates for completing repository-delivery workflows with GitHub CLI: preflight checks, authentication verification, prerelease publication, and related release operations.

This public snapshot excludes project-specific release evidence, private repository provenance, real tags/releases used for validation, and environment-bound status records.

## Included

- `scripts/` — portable PowerShell helpers;
- `templates/` — reusable delivery templates.

Review scripts against the target repository's branch protection, release process, permissions, and CI policy before use. Credentials must remain in the user's GitHub authentication environment or secret store and must never be committed.
