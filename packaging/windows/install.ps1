<#
.SYNOPSIS
    Install the PetAgent CLI on Windows.

.DESCRIPTION
    Downloads the latest petagent binary for the current architecture from
    GitHub Releases, places it under $env:LOCALAPPDATA\PetAgent\bin, and
    appends that directory to the user's PATH.

    M0: placeholder URLs. Replace YOUR_ORG / VERSION once the release
    pipeline is publishing real artifacts.
#>

[CmdletBinding()]
param(
    [string] $Version = '0.1.0-m0',
    [string] $Repo    = 'YOUR_ORG/petagent'
)

$ErrorActionPreference = 'Stop'

function Get-Arch {
    $raw = $env:PROCESSOR_ARCHITECTURE
    switch ($raw) {
        'AMD64' { return 'x64' }
        'ARM64' { return 'arm64' }
        default { throw "Unsupported architecture: $raw" }
    }
}

function Add-PathEntry {
    param([string] $Dir)

    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = $user -split ';' | Where-Object { $_ -ne '' }
    if ($entries -contains $Dir) { return }
    $new = ($entries + $Dir) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $new, 'User')
    Write-Host "Added $Dir to user PATH (new sessions will pick it up)."
}

$arch    = Get-Arch
$asset   = "petagent-windows-$arch.exe"
$destDir = Join-Path $env:LOCALAPPDATA 'PetAgent\bin'
$destBin = Join-Path $destDir 'petagent.exe'
$url     = "https://github.com/$Repo/releases/download/v$Version/$asset"

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $destBin -UseBasicParsing

Add-PathEntry -Dir $destDir

Write-Host "Verifying install..."
& $destBin --version
