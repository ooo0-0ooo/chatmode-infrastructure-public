param(
  [Parameter(Mandatory = $true)]
  [string]$Repo
)

$ErrorActionPreference = 'Stop'

Write-Host '== GitHub CLI version =='
gh --version

Write-Host "`n== Authentication =="
gh auth status

Write-Host "`n== Repository access: $Repo =="
gh repo view $Repo

Write-Host "`nPASS: gh is installed, authenticated, and can access $Repo"
