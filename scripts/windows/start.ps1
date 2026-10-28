# Starts the whole system on a Windows PC with Docker Desktop (docs/RUN_ON_WINDOWS.md).
# Run it through start.cmd. Safe to run again: it only creates what is missing.
$ErrorActionPreference = 'Continue'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))

function Say([string]$Text, [string]$Color = 'Gray') { Write-Host $Text -ForegroundColor $Color }
function Fail([string]$Text) { Say ''; Say $Text 'Red'; exit 1 }
$compose = @('compose', '-f', 'docker-compose.prod.yml', '--env-file', '.env.production')

# 1. Docker Desktop must be installed and running.
Say '[1/6] Checking Docker Desktop...' 'Cyan'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Start-Process 'https://www.docker.com/products/docker-desktop/'
  Fail 'Docker Desktop is not installed. Install it from the page that just opened, restart the PC, then run start.cmd again.'
}
function Test-Docker { docker info *> $null; return ($LASTEXITCODE -eq 0) }
if (-not (Test-Docker)) {
  $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path $exe) { Start-Process $exe }
  Say '      Waiting for Docker Desktop to start (up to 3 minutes)...'
  for ($i = 0; $i -lt 36 -and -not (Test-Docker); $i++) { Start-Sleep -Seconds 5 }
  if (-not (Test-Docker)) { Fail 'Docker Desktop is not running. Open it, wait for "Engine running", then run start.cmd again.' }
}

# 2. The address phones on the same Wi-Fi use. Table QR codes print this address.
Say '[2/6] Finding this PC''s network address...' 'Cyan'
$ip = $null
try {
  $ip = Get-NetIPConfiguration -ErrorAction Stop |
    Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    ForEach-Object { $_.IPv4Address.IPAddress } |
    Select-Object -First 1
} catch { }
if (-not $ip) { $ip = 'localhost'; Say '      No network found: only this PC will be able to open the system.' 'Yellow' }
$url = "http://${ip}:3000"
Say "      $url"

# 3. Settings and secrets, created once with random values.
Say '[3/6] Preparing settings...' 'Cyan'
$envFile = '.env.production'
function New-Secret([int]$Bytes) {
  $b = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return ([Convert]::ToBase64String($b) -replace '[+/=]', '')
}
if (-not (Test-Path $envFile)) {
  @(
    "POSTGRES_PASSWORD=$(New-Secret 24)",
    "BETTER_AUTH_SECRET=$(New-Secret 32)",
    "BETTER_AUTH_URL=$url",
    'APP_BIND=0.0.0.0'
  ) | Set-Content -Path $envFile -Encoding ASCII
  Say "      Created $envFile (keep this file; it holds the database password)."
} else {
  $lines = Get-Content $envFile
  $old = ($lines | Where-Object { $_ -like 'BETTER_AUTH_URL=*' } | Select-Object -First 1) -replace '^BETTER_AUTH_URL=', ''
  if ($old -ne $url) {
    $lines = @($lines | Where-Object { $_ -notlike 'BETTER_AUTH_URL=*' }) + "BETTER_AUTH_URL=$url"
    $lines | Set-Content -Path $envFile -Encoding ASCII
    Say "      The PC's address changed from $old to $url." 'Yellow'
    Say '      Table QR codes printed before point to the old address: reprint them, or give this PC a fixed address in the router.' 'Yellow'
  }
}

# 4. Build and start the database and the app. The first run downloads and builds (5-15 minutes).
Say '[4/6] Starting the system (the first time takes 5-15 minutes)...' 'Cyan'
docker @compose up -d --build
if ($LASTEXITCODE -ne 0) { Fail 'Starting failed. Check the messages above, make sure the internet works, and run start.cmd again.' }

Say '      Waiting for the app to be ready...'
$ready = $false
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
  try { $ready = ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://localhost:3000/api/health').StatusCode -eq 200) } catch { Start-Sleep -Seconds 3 }
}
if (-not $ready) { Fail 'The app did not become ready. See the log with: docker compose -f docker-compose.prod.yml logs app' }

# 5. The first administrator, only on the first run.
Say '[5/6] Checking the administrator account...' 'Cyan'
$admins = (docker @compose exec -T db psql -U ordering -d ordering -Atc "select count(*) from user_roles where role = 'ADMIN'") | Select-Object -Last 1
if ("$admins".Trim() -eq '0') {
  Say '      No administrator yet. Create the owner account now.' 'Yellow'
  $email = Read-Host '      Admin email'
  $name = Read-Host '      Admin name'
  while ($true) {
    $p1 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host '      Password (at least 10 characters)' -AsSecureString)))
    $p2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host '      Repeat the password' -AsSecureString)))
    if ($p1.Length -lt 10) { Say '      Too short, try again.' 'Yellow'; continue }
    if ($p1.Contains('"')) { Say '      Please do not use the " character, try again.' 'Yellow'; continue }
    if ($p1 -ne $p2) { Say '      The passwords do not match, try again.' 'Yellow'; continue }
    break
  }
  docker @compose exec -T -e "BOOTSTRAP_ADMIN_PASSWORD=$p1" app pnpm --silent admin:bootstrap --email $email --name $name
  $p1 = $null; $p2 = $null
  if ($LASTEXITCODE -ne 0) { Fail 'Creating the administrator failed (see the message above). Run start.cmd again to retry.' }
} else {
  Say '      Administrator already exists.'
}

# 6. Open the system.
Say '[6/6] Opening the system...' 'Cyan'
Start-Process "$url/login"
Say ''
Say '=====================================================' 'Green'
Say " The system is running: $url" 'Green'
Say " Staff sign in:  $url/login" 'Green'
Say ' Phones must be on the same Wi-Fi as this PC to order.' 'Green'
Say ' To stop it: double-click stop.cmd' 'Green'
Say '=====================================================' 'Green'
