param(
  [string]$UserRoot = $(if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }),
  [string]$SessionsRoot = $(Join-Path (if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }) '.codex\sessions')
)

$dayDir = Get-Date -Format 'yyyy\\MM\\dd'
$sessionDir = Join-Path $SessionsRoot $dayDir
$rollouts = @()

if (Test-Path $sessionDir) {
  $rollouts = Get-ChildItem -Path $sessionDir -Filter 'rollout-*.jsonl' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
}

$result = [ordered]@{
  thread_id = $null
  turn_index = 0
  resolved_at = (Get-Date).ToString('o')
  source_file = $null
  status = 'missing'
}

foreach ($file in $rollouts) {
  $lines = Get-Content -Path $file.FullName -ErrorAction SilentlyContinue
  foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $payload = $null
    try {
      $payload = $line | ConvertFrom-Json -ErrorAction Stop
    } catch {
      continue
    }
    $threadId = $payload.session_meta.payload.id
    if ($threadId) {
      $result.thread_id = $threadId
      $result.source_file = [ordered]@{
        path = $file.FullName
        last_write_time = $file.LastWriteTime.ToString('o')
      }
      $result.status = 'ok'
      break
    }
  }
  if ($result.status -eq 'ok') { break }
}

$result | ConvertTo-Json -Depth 6
