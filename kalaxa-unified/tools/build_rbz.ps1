# tools/build_rbz.ps1 — ساخت RBZ روی ویندوز بدون نیاز به نصب Ruby
# اجرا در PowerShell از ریشهٔ مخزن:
#   powershell -ExecutionPolicy Bypass -File tools\build_rbz.ps1            # release
#   powershell -ExecutionPolicy Bypass -File tools\build_rbz.ps1 -Dev      # development
param([switch]$Dev)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$BuildType = if ($Dev) { 'dev' } else { 'release' }

# خواندن نسخه از version.rb
$VersionLine = Select-String -Path (Join-Path $Root 'kalaxa\version.rb') -Pattern "VERSION = '([0-9.]+)'"
$Version = $VersionLine.Matches[0].Groups[1].Value
if (-not $Version) { throw 'VERSION not found in version.rb' }

$Stage = Join-Path $env:TEMP ("kalaxa-build-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $Stage | Out-Null
Copy-Item (Join-Path $Root 'kalaxa.rb') $Stage
Copy-Item (Join-Path $Root 'kalaxa') $Stage -Recurse

$BuildInfo = @{ type = $BuildType
                built_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
                version = $Version } | ConvertTo-Json
Set-Content -Path (Join-Path $Stage 'kalaxa\build_info.json') -Value $BuildInfo -Encoding UTF8
if ($Dev) { Set-Content -Path (Join-Path $Stage 'kalaxa\DEV_BUILD') -Value 'debug' -Encoding UTF8 }

$DistDir = Join-Path $Root 'dist'
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
$Out = Join-Path $DistDir ("kalaxa-$Version-$BuildType.rbz")
$Zip = "$Out.zip"
Remove-Item $Out, $Zip -ErrorAction SilentlyContinue

# گارد بهداشت بسته (بازبینی فاز ۰۲)
$allowed = @('adapter','app','domain','i18n','persistence','ui')
Get-ChildItem -Directory (Join-Path $stage 'kalaxa') | ForEach-Object {
  if ($allowed -notcontains $_.Name) {
    Write-Warning "BUILD GUARD: removing unexpected directory: kalaxa/$($_.Name)"
    Remove-Item -Recurse -Force $_.FullName
  }
}
Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $Zip -Force
Move-Item $Zip $Out -Force
Remove-Item $Stage -Recurse -Force

Write-Host "BUILD OK: $Out ($((Get-Item $Out).Length) bytes, $BuildType)"
