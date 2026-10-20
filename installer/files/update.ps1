<#
  Alvea - Update ueber GitHub-Releases

  Aufruf:
    - interaktiv ueber das Startmenue ("Alvea - Nach Updates suchen")
    - unbeaufsichtigt ueber die Windows-Aufgabe "Alvea Update" (-Unattended),
      die der Knopf "Jetzt aktualisieren" in der Verwaltung startet

  Ablauf: neuestes Release abfragen -> Setup + Pruefsumme laden -> SHA256 pruefen
          -> Dienst stoppen -> Datenbank sichern -> Setup still ausfuehren
          -> warten bis die neue Version antwortet.
  Status fuer die Weboberflaeche: data\update-status.json
  Protokoll: data\logs\update.log
#>
param(
    [switch]$Unattended,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"   # Invoke-WebRequest sonst extrem langsam
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$installDir = $PSScriptRoot
$dataDir    = Join-Path $installDir "data"
$envFile    = Join-Path $dataDir "alvea.env"
$statusFile = Join-Path $dataDir "update-status.json"
$logDir     = Join-Path $dataDir "logs"
$logFile    = Join-Path $logDir "update.log"
$serviceName = "Alvea"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log([string]$msg, [string]$color = "Gray") {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    if (-not $Unattended) { Write-Host $msg -ForegroundColor $color }
}

function Set-Status([string]$state, [string]$message, [string]$version) {
    $obj = [ordered]@{
        state      = $state
        message    = $message
        version    = $version
        updated_at = (Get-Date).ToUniversalTime().ToString("o")
    }
    $json = $obj | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($statusFile, $json, (New-Object Text.UTF8Encoding $false))
}

function Read-EnvFile {
    $h = @{}
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
                $h[$matches[1]] = ($matches[2] -replace '\s+#.*$', '').Trim()
            }
        }
    }
    return $h
}

function Get-CoreVersion([string]$v) {
    return [version](($v -replace '^v', '').Split('-')[0])
}

function Exit-Script([int]$code) {
    if (-not $Unattended) { Read-Host "Enter zum Beenden" | Out-Null }
    exit $code
}

$current = "0.0.0"
$latest  = $null
try {
    $cfg     = Read-EnvFile
    $repo    = if ($cfg.UPDATE_REPO) { $cfg.UPDATE_REPO } else { "phillhf/alvea" }
    $port    = if ($cfg.PORT) { $cfg.PORT } else { "37843" }
    $current = (Get-Content (Join-Path $installDir "app\backend\package.json") -Raw | ConvertFrom-Json).version
    $headers = @{ "User-Agent" = "Alvea-Updater/$current"; "Accept" = "application/vnd.github+json" }

    if (-not $Unattended) {
        Write-Host ""
        Write-Host "   **** ALVEA - UPDATE ****" -ForegroundColor White
        Write-Host ""
    }
    Write-Log "Installierte Version: $current - pruefe $repo"
    Set-Status "running" "Suche nach Updates..." $current

    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers $headers -TimeoutSec 30
    $latest  = $release.tag_name -replace '^v', ''
    Write-Log "Neueste Version: $latest"

    if (-not $Force -and (Get-CoreVersion $latest) -le (Get-CoreVersion $current)) {
        Write-Log "Alvea ist aktuell." Green
        Set-Status "up_to_date" "Alvea ist aktuell ($current)." $current
        Exit-Script 0
    }

    if (-not $Unattended) {
        $answer = Read-Host "Update von $current auf $latest installieren? Alvea ist dabei 1-3 Minuten nicht erreichbar. (J/N)"
        if ($answer -notmatch '^[JjYy]') {
            Set-Status "cancelled" "Update abgebrochen." $current
            Exit-Script 0
        }
    }

    $asset    = $release.assets | Where-Object { $_.name -like "Alvea-Setup-*.exe" } | Select-Object -First 1
    $shaAsset = if ($asset) { $release.assets | Where-Object { $_.name -eq "$($asset.name).sha256" } | Select-Object -First 1 }
    if (-not $asset -or -not $shaAsset) { throw "Release $latest enthaelt kein Setup oder keine Pruefsumme." }

    # -- Download + Pruefsumme ------------------------------------------------
    $dlDir = Join-Path $dataDir "updates"
    New-Item -ItemType Directory -Force -Path $dlDir | Out-Null
    $setup = Join-Path $dlDir $asset.name
    Set-Status "running" "Lade Version $latest herunter..." $latest
    Write-Log "Lade $($asset.browser_download_url)"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $setup -Headers @{ "User-Agent" = "Alvea-Updater/$current" } -UseBasicParsing

    $shaContent = (Invoke-WebRequest -Uri $shaAsset.browser_download_url -Headers @{ "User-Agent" = "Alvea-Updater/$current" } -UseBasicParsing).Content
    if ($shaContent -is [byte[]]) { $shaContent = [Text.Encoding]::ASCII.GetString($shaContent) }
    $expected = ($shaContent.Trim() -split '\s+')[0].ToLower()
    $actual   = (Get-FileHash -Path $setup -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $expected) {
        Remove-Item $setup -Force -ErrorAction SilentlyContinue
        throw "Pruefsumme des Downloads stimmt nicht (erwartet $expected, erhalten $actual)."
    }
    Write-Log "Pruefsumme OK."

    # -- Dienst stoppen + Datenbank sichern -----------------------------------
    Set-Status "running" "Sichere Datenbank..." $latest
    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne "Stopped") {
        Write-Log "Stoppe Dienst $serviceName..."
        Stop-Service -Name $serviceName -Force
        $svc.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(60))
    }
    $dbFile = if ($cfg.DB_FILE) { $cfg.DB_FILE } else { Join-Path $dataDir "alvea.sqlite" }
    $backupDir = Join-Path $dataDir ("backups\vor-update-{0}_{1}" -f $latest, (Get-Date -Format "yyyyMMdd_HHmmss"))
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    foreach ($suffix in @("", "-wal", "-shm")) {
        if (Test-Path "$dbFile$suffix") { Copy-Item -Path "$dbFile$suffix" -Destination $backupDir -Force }
    }
    Copy-Item -Path $envFile -Destination $backupDir -Force
    Write-Log "Datensicherung: $backupDir"

    # -- Setup ausfuehren -----------------------------------------------------
    Set-Status "running" "Installiere Version $latest..." $latest
    $setupLog = Join-Path $logDir ("setup-{0}.log" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
    Write-Log "Starte Setup (Protokoll: $setupLog)"
    $proc = Start-Process -FilePath $setup -ArgumentList @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/LOG=`"$setupLog`"") -Wait -PassThru
    if ($proc.ExitCode -ne 0) { throw "Setup beendet mit Fehlercode $($proc.ExitCode). Protokoll: $setupLog" }

    # -- Auf neue Version warten ----------------------------------------------
    Set-Status "running" "Warte auf Neustart..." $latest
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 2
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3
            if ($health.version -eq $latest) { $ok = $true; break }
        } catch { }
    }
    if (-not $ok) { throw "Alvea antwortet nach dem Update nicht mit Version $latest. Datensicherung: $backupDir" }

    # Nur die letzten zwei Setups behalten
    Get-ChildItem -Path $dlDir -Filter "Alvea-Setup-*.exe" | Sort-Object LastWriteTime -Descending |
        Select-Object -Skip 2 | Remove-Item -Force -ErrorAction SilentlyContinue

    Write-Log "Update auf $latest erfolgreich." Green
    Set-Status "done" "Update auf $latest erfolgreich." $latest
    Exit-Script 0
}
catch {
    $msg = $_.Exception.Message
    Write-Log "FEHLER: $msg" Red
    Set-Status "failed" $msg $current
    # Dienst wieder starten, falls er gestoppt wurde
    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Stopped") {
        try { Start-Service -Name $serviceName } catch { Write-Log "Dienst konnte nicht gestartet werden: $_" Red }
    }
    Exit-Script 1
}
