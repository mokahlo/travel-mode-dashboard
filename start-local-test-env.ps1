param(
  [switch]$NoWatch,
  [switch]$SkipInstall,
  [switch]$SkipServer,
  [switch]$DryRun,
  [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
$dashboardPort = if ($env:PORT) { $env:PORT } else { '3000' }
$dashboardUrl = "http://localhost:$dashboardPort"

function Get-NodeInstallPath {
  $candidates = @()

  # Common winget user-scope Node LTS install path.
  $wingetRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path $wingetRoot) {
    $candidates += Get-ChildItem -Path $wingetRoot -Directory -Filter 'OpenJS.NodeJS.LTS_*' -ErrorAction SilentlyContinue |
      ForEach-Object {
        Get-ChildItem -Path $_.FullName -Directory -Filter 'node-v*-win-x64' -ErrorAction SilentlyContinue
      } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -ExpandProperty FullName
  }

  # Fallback path used by prior setup in this workspace.
  $candidates += 'C:\Users\089741\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.14.1-win-x64'

  foreach ($path in $candidates) {
    if ([string]::IsNullOrWhiteSpace($path)) { continue }
    if (Test-Path (Join-Path $path 'node.exe')) {
      return $path
    }
  }

  return $null
}

function Ensure-NodeOnPath {
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    return $null
  }

  $nodePath = Get-NodeInstallPath
  if (-not $nodePath) {
    throw "Node.js was not found. Install Node LTS (user scope), then rerun this script."
  }

  if ($env:Path -notlike "*$nodePath*") {
    $env:Path = "$nodePath;$env:Path"
  }

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Node.js path was added, but npm is still not available in this shell."
  }

  return $nodePath
}

$nodePath = Ensure-NodeOnPath
Write-Host "Using Node: $(node -v)"
Write-Host "Using npm:  $(npm -v)"

if (-not $SkipInstall) {
  if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
    if ($DryRun) {
      Write-Host '[DryRun] npm install'
    } else {
      npm install
    }
  } else {
    Write-Host 'Dependencies already installed (node_modules exists).'
  }
}

if (-not $SkipServer) {
  $serverJobName = 'hydrologix-server'

  if ($DryRun) {
    Write-Host "[DryRun] Start-Job -Name $serverJobName -ScriptBlock { Set-Location '$PSScriptRoot'; <prepend node path if needed>; npm start }"
    Write-Host "[DryRun] Dashboard URL: $dashboardUrl"
  } else {
    $existingServerJob = Get-Job -Name $serverJobName -ErrorAction SilentlyContinue |
      Where-Object { $_.State -in @('Running', 'NotStarted') } |
      Select-Object -First 1

    if ($existingServerJob) {
      Write-Host "Server job '$serverJobName' is already running."
    } else {
      Start-Job -Name $serverJobName -ScriptBlock {
        param($projectRoot, $resolvedNodePath)
        Set-Location -Path $projectRoot
        if ($resolvedNodePath -and (Test-Path $resolvedNodePath) -and ($env:Path -notlike "*$resolvedNodePath*")) {
          $env:Path = "$resolvedNodePath;$env:Path"
        }
        npm start
      } -ArgumentList $PSScriptRoot, $nodePath | Out-Null
      Write-Host "Started app server in background job '$serverJobName' (no new window)."
    }

    Write-Host "Dashboard: $dashboardUrl"
    Write-Host "View server logs: Receive-Job -Name $serverJobName -Keep"
    Write-Host "Stop server: Stop-Job -Name $serverJobName; Remove-Job -Name $serverJobName"

    if ($OpenBrowser) {
      Start-Process $dashboardUrl | Out-Null
      Write-Host 'Opened dashboard in your default browser.'
    }
  }
}

if ($NoWatch) {
  if ($DryRun) {
    Write-Host '[DryRun] npm test'
  } else {
    Write-Host 'Running tests once (no watch mode).'
    npm test
  }
} else {
  if ($DryRun) {
    Write-Host '[DryRun] npm run test:watch'
  } else {
    Write-Host 'Running test watch mode. "Restarted at ..." is expected when files change.'
    Write-Host 'Press Ctrl+C to stop watch mode.'
    npm run test:watch
  }
}
