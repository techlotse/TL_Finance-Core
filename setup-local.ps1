# ---------------------------------------------------------------------------
# setup-local.ps1
# Windows PowerShell equivalent of setup-local.sh.
# Prepares prerequisites for the multinode stack:
#   - Creates .env from .env.example with a random APP_SECRET
#   - Generates a self-signed SSL certificate (ssl\cert.pem + ssl\key.pem)
#   - Normalises line endings in shell scripts to LF (so Docker doesn't
#     get "bad interpreter: /bin/sh^M" errors)
#
# Run once before:
#   docker compose -f docker-compose-multinode.yml up -d --build
#
# Requires: PowerShell 5.1+ and Docker Desktop for Windows.
# openssl is used for cert generation — bundled with Git for Windows.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Ok   { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "  [X]  $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  TL Finance Core - Local Setup (Windows)"         -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# 1. .env file
# ---------------------------------------------------------------------------
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"

    function New-HexSecret([int]$bytesLength) {
        $bytes = New-Object byte[] $bytesLength
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        return ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
    }

    $secret = New-HexSecret 32
    $dbPassword = New-HexSecret 18
    $replicationPassword = New-HexSecret 18
    $redisPassword = New-HexSecret 18
    $pgAdminPassword = New-HexSecret 18

    $content = Get-Content ".env" -Raw
    $content = [System.Text.RegularExpressions.Regex]::Replace(
        $content, "(?m)^APP_SECRET=change-me", "APP_SECRET=$secret"
    )
    $content = [System.Text.RegularExpressions.Regex]::Replace(
        $content, "(?m)^DB_PASSWORD=budget", "DB_PASSWORD=$dbPassword"
    )
    $content = [System.Text.RegularExpressions.Regex]::Replace(
        $content, "(?m)^REPLICATION_PASSWORD=replicator_password", "REPLICATION_PASSWORD=$replicationPassword"
    )
    $content = [System.Text.RegularExpressions.Regex]::Replace(
        $content, "(?m)^REDIS_PASSWORD=redis_password", "REDIS_PASSWORD=$redisPassword"
    )
    $content = [System.Text.RegularExpressions.Regex]::Replace(
        $content, "(?m)^PGADMIN_PASSWORD=changeme", "PGADMIN_PASSWORD=$pgAdminPassword"
    )
    Set-Content ".env" -Value $content -NoNewline

    Write-Ok ".env created with random local secrets"
} else {
    Write-Ok ".env already exists (not overwritten)"
}

# Warn if placeholder is still present
$envContent = Get-Content ".env" -Raw
if ($envContent -match "(?m)^APP_SECRET=change-me") {
    Write-Warn "APP_SECRET is still 'change-me' — replace it before exposing this app"
}

# ---------------------------------------------------------------------------
# 2. Self-signed SSL certificate
# ---------------------------------------------------------------------------
if (-not (Test-Path "ssl\cert.pem") -or -not (Test-Path "ssl\key.pem")) {
    New-Item -ItemType Directory -Force -Path "ssl" | Out-Null

    # Locate openssl — Git for Windows bundles it
    $opensslCandidates = @(
        "openssl",
        "C:\Program Files\Git\usr\bin\openssl.exe",
        "C:\Program Files\OpenSSL-Win64\bin\openssl.exe",
        "C:\Program Files (x86)\OpenSSL-Win32\bin\openssl.exe"
    )
    $opensslExe = $null
    foreach ($candidate in $opensslCandidates) {
        try {
            $null = & $candidate version 2>&1
            $opensslExe = $candidate
            break
        } catch { }
    }

    if ($null -eq $opensslExe) {
        Write-Err "openssl not found. Install Git for Windows (https://git-scm.com) which bundles openssl, then re-run this script."
    }

    # Write a temporary openssl config that includes SubjectAltName for localhost.
    $tmpCnf = [System.IO.Path]::GetTempFileName() + ".cnf"
    @"
[req]
default_bits       = 4096
prompt             = no
default_md         = sha256
req_extensions     = req_ext
distinguished_name = dn

[dn]
C  = CH
ST = Zurich
L  = Zurich
O  = TL Finance Core
CN = localhost

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1  = 127.0.0.1
"@ | Set-Content $tmpCnf -Encoding ASCII

    & $opensslExe req -x509 -newkey rsa:4096 `
        -keyout "ssl\key.pem" `
        -out    "ssl\cert.pem" `
        -days   365 `
        -nodes `
        -config $tmpCnf `
        -extensions req_ext 2>&1 | Out-Null

    Remove-Item $tmpCnf -Force

    if ((Test-Path "ssl\cert.pem") -and (Test-Path "ssl\key.pem")) {
        Write-Ok "Self-signed SSL certificate generated (ssl\cert.pem, ssl\key.pem)"
        Write-Warn "Your browser will show a certificate warning — expected for local self-signed certs."
    } else {
        Write-Err "openssl ran but cert files were not created. Check openssl output above."
    }
} else {
    Write-Ok "SSL certificates already exist (not overwritten)"
}

# ---------------------------------------------------------------------------
# 3. Normalise shell script line endings to LF
# ---------------------------------------------------------------------------
# Docker mounts files from the Windows host into Linux containers. If the
# .sh files have CRLF line endings, the Linux kernel rejects the shebang
# with "bad interpreter: /bin/sh^M". We convert them here as a safety net
# (the .gitattributes eol=lf rule handles this for Git checkouts, but the
# working copy may already have CRLF if it was cloned before that rule existed).

$shellScripts = @(
    "postgres\init-primary.sh",
    "postgres\init-replica.sh"
)

foreach ($script in $shellScripts) {
    if (Test-Path $script) {
        $raw = [System.IO.File]::ReadAllText($script)
        if ($raw -match "`r`n") {
            $lf = $raw -replace "`r`n", "`n"
            # Write as UTF-8 without BOM, without .NET's automatic CRLF
            [System.IO.File]::WriteAllText(
                (Resolve-Path $script).Path, $lf,
                (New-Object System.Text.UTF8Encoding $false)
            )
            Write-Ok "Converted to LF: $script"
        } else {
            Write-Ok "Already LF:      $script"
        }
    } else {
        Write-Warn "Not found (skipped): $script"
    }
}

# ---------------------------------------------------------------------------
# Done — print next steps
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Prerequisites ready. Next steps:"               -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Build and start all services:"
Write-Host "     docker compose -f docker-compose-multinode.yml up -d --build" -ForegroundColor White
Write-Host ""
Write-Host "  2. Wait ~30 s for the DB to initialise, then run migrations + seed:"
Write-Host "     docker compose -f docker-compose-multinode.yml exec app-1 npx prisma migrate deploy" -ForegroundColor White
Write-Host "     docker compose -f docker-compose-multinode.yml exec app-1 npx prisma db seed" -ForegroundColor White
Write-Host ""
Write-Host "  3. Open the app:"
Write-Host "     https://localhost        (accept the self-signed cert warning)" -ForegroundColor White
Write-Host ""
Write-Host "  Optional PgAdmin:"
Write-Host "     docker compose -f docker-compose-multinode.yml --profile tools up -d pgadmin" -ForegroundColor White
Write-Host "     http://127.0.0.1:5050   (email/password from .env)"  -ForegroundColor White
Write-Host ""
Write-Host "  Check health:"
Write-Host "     docker compose -f docker-compose-multinode.yml ps" -ForegroundColor White
Write-Host "     curl.exe -k https://localhost/api/health"          -ForegroundColor White
Write-Host ""
