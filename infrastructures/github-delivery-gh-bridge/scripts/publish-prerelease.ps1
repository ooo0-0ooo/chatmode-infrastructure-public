[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [string]$Repo,

  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [Parameter(Mandatory = $true)]
  [string]$NotesFile,

  [string]$Title = $Tag
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $NotesFile)) {
  throw "Release notes file not found: $NotesFile"
}

# Read-only guards first.
gh auth status | Out-Host
gh repo view $Repo | Out-Host

$tagRef = git ls-remote --tags origin "refs/tags/$Tag*"
if (-not $tagRef) {
  throw "Remote tag does not exist: $Tag"
}

$existingRelease = $null
try {
  $existingRelease = gh release view $Tag --repo $Repo 2>$null
} catch {
  $existingRelease = $null
}

if ($existingRelease) {
  throw "Release already exists for tag $Tag. Use gh release edit after explicit authorization instead."
}

$target = "$Repo release $Tag"
if ($PSCmdlet.ShouldProcess($target, 'Publish GitHub Pre-release')) {
  gh release create $Tag `
    --repo $Repo `
    --verify-tag `
    --prerelease `
    --title $Title `
    --notes-file $NotesFile

  Write-Host "`n== Read-back verification =="
  gh release view $Tag --repo $Repo
}
