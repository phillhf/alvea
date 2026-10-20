<#
  Alvea - Release bauen (Setup.exe)

  Aufruf (aus beliebigem Ordner):
    powershell -ExecutionPolicy Bypass -File installer\build.ps1 [-ExpectedVersion 1.0.0] [-SkipInstaller]

  Ergebnis:
    installer\build\output\Alvea-Setup-<Version>.exe
    installer\build\output\Alvea-Setup-<Version>.exe.sha256

  Voraussetzungen: Node.js (gleiche Version wird mitgeliefert), npm, Inno Setup 6 oder 7 (ISCC.exe).
  Wird lokal und in GitHub Actions (.github/workflows/release.yml) verwendet.
#>
param(
    [string]$ExpectedVersion = "",
    [switch]$SkipInstaller,
    [string]$Iscc = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

$WinSwVersion = "v2.12.0"

$root      = Split-Path -Parent $PSScriptRoot
$buildDir  = Join-Path $PSScriptRoot "build"
$stage     = Join-Path $buildDir "stage"
$cache     = Join-Path $buildDir "cache"
$outputDir = Join-Path $buildDir "output"

function Step([string]$text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }

function Invoke-Checked([string]$exe, [string[]]$arguments, [string]$dir) {
    Push-Location $dir
    try {
        & $exe @arguments
        if ($LASTEXITCODE -ne 0) { throw "$exe $($arguments -join ' ') fehlgeschlagen (Code $LASTEXITCODE)" }
    } finally { Pop-Location }
}

function Get-Cached([string]$url, [string]$name) {
    $file = Join-Path $cache $name
    if (-not (Test-Path $file)) {
        Write-Host "    Download $url"
        Invoke-WebRequest -Uri $url -OutFile "$file.part" -UseBasicParsing
        Move-Item "$file.part" $file -Force
    }
    return $file
}

# -- Version ------------------------------------------------------------------
$version = (Get-Content (Join-Path $root "backend\package.json") -Raw | ConvertFrom-Json).version
$feVersion = (Get-Content (Join-Path $root "frontend\package.json") -Raw | ConvertFrom-Json).version
if ($version -ne $feVersion) { throw "Versionen unterschiedlich: backend $version, frontend $feVersion" }
if ($ExpectedVersion -and ($ExpectedVersion -replace '^v', '') -ne $version) {
    throw "Tag-Version $ExpectedVersion passt nicht zu package.json ($version)"
}
Write-Host "Alvea $version" -ForegroundColor White

Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage, $cache, $outputDir | Out-Null

# -- Frontend -----------------------------------------------------------------
Step "Frontend bauen"
Invoke-Checked "npm" @("ci", "--no-audit", "--no-fund") (Join-Path $root "frontend")
Invoke-Checked "npm" @("run", "build") (Join-Path $root "frontend")

# -- Backend ------------------------------------------------------------------
Step "Backend bauen"
Remove-Item -Recurse -Force (Join-Path $root "backend\dist") -ErrorAction SilentlyContinue
Invoke-Checked "npm" @("ci", "--no-audit", "--no-fund") (Join-Path $root "backend")
Invoke-Checked "npm" @("run", "build") (Join-Path $root "backend")

# -- Stage: Programmdateien ---------------------------------------------------
Step "Programmdateien zusammenstellen"
$stBackend = Join-Path $stage "app\backend"
New-Item -ItemType Directory -Force -Path $stBackend, (Join-Path $stage "app\frontend"), (Join-Path $stage "app\db") | Out-Null
Copy-Item (Join-Path $root "backend\package.json"), (Join-Path $root "backend\package-lock.json") $stBackend
Copy-Item -Recurse (Join-Path $root "backend\dist") (Join-Path $stBackend "dist")
Get-ChildItem (Join-Path $stBackend "dist") -Recurse -Filter "*.map" | Remove-Item -Force
Copy-Item -Recurse (Join-Path $root "frontend\dist") (Join-Path $stage "app\frontend\dist")
Copy-Item (Join-Path $root "db\init.sql") (Join-Path $stage "app\db")

Step "Produktions-Abhaengigkeiten installieren"
Invoke-Checked "npm" @("ci", "--omit=dev", "--no-audit", "--no-fund") $stBackend

# -- Node.js-Laufzeit (gleiche Version wie beim Bauen -> passendes better-sqlite3) --
$nodeVersion = (& node -v).Trim()
Step "Node.js $nodeVersion mitliefern"
$nodeExe  = Get-Cached "https://nodejs.org/dist/$nodeVersion/win-x64/node.exe" "node-$nodeVersion.exe"
$shasums  = Get-Cached "https://nodejs.org/dist/$nodeVersion/SHASUMS256.txt" "node-$nodeVersion-SHASUMS256.txt"
$expected = (Select-String -Path $shasums -Pattern "\s+win-x64/node\.exe$").Line.Split(" ")[0].ToLower()
$actual   = (Get-FileHash $nodeExe -Algorithm SHA256).Hash.ToLower()
if ($expected -ne $actual) { Remove-Item $nodeExe; throw "SHA256 von node.exe stimmt nicht" }
$nodeLicense = Get-Cached "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" "node-$nodeVersion-LICENSE.txt"
New-Item -ItemType Directory -Force -Path (Join-Path $stage "node") | Out-Null
Copy-Item $nodeExe (Join-Path $stage "node\node.exe")
Copy-Item $nodeLicense (Join-Path $stage "node\LICENSE.txt")

# -- Windows-Dienst (WinSW) ---------------------------------------------------
Step "WinSW $WinSwVersion"
$winsw = Get-Cached "https://github.com/winsw/winsw/releases/download/$WinSwVersion/WinSW-x64.exe" "WinSW-$WinSwVersion-x64.exe"
$svcDir = Join-Path $stage "service"
New-Item -ItemType Directory -Force -Path $svcDir | Out-Null
Copy-Item $winsw (Join-Path $svcDir "alvea-service.exe")
Copy-Item (Join-Path $PSScriptRoot "files\alvea-service.xml") $svcDir
Copy-Item (Join-Path $PSScriptRoot "alvea.ico") $svcDir

# -- Hilfsdateien -------------------------------------------------------------
New-Item -ItemType Directory -Force -Path (Join-Path $stage "tools") | Out-Null
Copy-Item (Join-Path $PSScriptRoot "files\configure.js") (Join-Path $stage "tools")
Copy-Item (Join-Path $PSScriptRoot "files\update.ps1") $stage
Copy-Item (Join-Path $root "LICENSE"), (Join-Path $root "NOTICE") $stage

if ($SkipInstaller) { Write-Host "`nStage fertig: $stage" -ForegroundColor Green; exit 0 }

# -- Inno Setup ---------------------------------------------------------------
Step "Setup.exe erzeugen"
if (-not $Iscc) {
    $candidates = @(
        (Get-Command "ISCC.exe" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
        (Join-Path $buildDir "tools\innosetup\ISCC.exe"),
        "$env:ProgramFiles\Inno Setup 7\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 7\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }
    $Iscc = $candidates | Select-Object -First 1
}
if (-not $Iscc) { throw "ISCC.exe (Inno Setup 6/7) nicht gefunden. Installieren: winget install JRSoftware.InnoSetup" }

Invoke-Checked $Iscc @("/Q", "/DAppVersion=$version", "/DStageDir=$stage", "/DOutputDir=$outputDir", (Join-Path $PSScriptRoot "alvea.iss")) $PSScriptRoot

$setup = Join-Path $outputDir "Alvea-Setup-$version.exe"
$hash  = (Get-FileHash $setup -Algorithm SHA256).Hash.ToLower()
[IO.File]::WriteAllText("$setup.sha256", "$hash  Alvea-Setup-$version.exe`n", (New-Object Text.UTF8Encoding $false))

Write-Host ""
Write-Host "Fertig: $setup" -ForegroundColor Green
Write-Host "SHA256: $hash"
