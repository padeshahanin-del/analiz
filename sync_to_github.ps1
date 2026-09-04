<#
  sync_to_github.ps1 - one-way sync (source = live working folders, dest = this git clone)
  with GitHub (padeshahanin-del/analiz). Designed for repeated scheduled runs:
  no-op if nothing changed; silently exits if offline so the next scheduled run retries.
  Every run appends a line to sync.log next to this script.
#>

$repoDir = "C:\Users\AXA\.claude\skechap-sync"
$logFile = Join-Path $repoDir "sync.log"
$sources = @(
  @{ Src = "C:\Users\AXA\.claude\skechap\kalaxa-unified"; Dst = "kalaxa-unified"; ExcludeGit = $true },
  @{ Src = "C:\Users\AXA\.claude\skechap\kalaxa-sync"; Dst = "kalaxa-sync"; ExcludeGit = $false },
  @{ Src = "C:\Users\AXA\.claude\skechap\kalaxa-sync-client"; Dst = "kalaxa-sync-client"; ExcludeGit = $false },
  @{ Src = "C:\Users\AXA\.claude\skechap\dist"; Dst = "dist"; ExcludeGit = $false }
)

function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Add-Content -Path $logFile -Value $line -Encoding utf8
}

Set-Location $repoDir

# 1) pull any remote changes first (e.g. pushed from elsewhere) before overwriting local
$fetchOut = git fetch origin main 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Log "OFFLINE or network error during fetch - skipped, will retry next run. $fetchOut"
  exit 0
}
git merge --ff-only origin/main 2>&1 | Out-Null

# 2) mirror latest source folders into this clone
foreach ($s in $sources) {
  if (-not (Test-Path $s.Src)) { continue }
  $xd = @()
  if ($s.ExcludeGit) { $xd = @('/XD', (Join-Path $s.Src '.git')) }
  robocopy $s.Src (Join-Path $repoDir $s.Dst) /E /PURGE @xd /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
}

# 3) commit only if something actually changed
git add -A
$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Log "No changes - nothing to sync."
  exit 0
}

$fileCount = ($staged | Measure-Object).Count
git commit -m "sync: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>&1 | Out-Null

# 4) push - silently skip if offline; next scheduled run retries
$pushOut = git push origin main 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Log "Committed locally but push failed (likely offline) - will retry next run. $pushOut"
  exit 0
}
Write-Log "Sync OK - $fileCount file(s) changed and pushed."
