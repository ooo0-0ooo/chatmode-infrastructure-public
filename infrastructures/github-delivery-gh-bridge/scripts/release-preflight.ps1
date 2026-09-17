param(
  [Parameter(Mandatory = $true)]
  [string]$Repo,

  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [Parameter(Mandatory = $true)]
  [string]$Commit
)

$ErrorActionPreference = 'Stop'

Write-Host '== Auth =='
gh auth status

Write-Host "`n== Repo =="
gh repo view $Repo

Write-Host "`n== Local working tree =="
git status --short --branch

Write-Host "`n== Fetch refs/tags =="
git fetch --all --tags

Write-Host "`n== Frozen commit =="
git show --no-patch --oneline $Commit

Write-Host "`n== Local tag conflict =="
$localTag = git tag --list $Tag
if ($localTag) {
  Write-Warning "Local tag already exists: $Tag"
} else {
  Write-Host 'No local tag conflict.'
}

Write-Host "`n== Remote tag conflict =="
$remoteTag = git ls-remote --tags origin "refs/tags/$Tag*"
if ($remoteTag) {
  Write-Warning "Remote tag already exists:`n$remoteTag"
} else {
  Write-Host 'No remote tag conflict.'
}

Write-Host "`nPreflight complete. This script performs no mutation."
