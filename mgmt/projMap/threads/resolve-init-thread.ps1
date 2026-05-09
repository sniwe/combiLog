param(
  [string]$UserRoot = $(if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }),
  [string]$SessionsRoot = $(Join-Path (if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }) '.codex\sessions')
)

$dayDir = Get-Date -Format 'yyyy\\MM\\dd'
$sessionDir = Join-Path $SessionsRoot $dayDir
$threadsDir = $PSScriptRoot
$currentPath = Join-Path $threadsDir 'current-thread.json'
$allPath = Join-Path $threadsDir 'all-threads.json'

$rollouts = @()
if (Test-Path $sessionDir) {
  $rollouts = Get-ChildItem -Path $sessionDir -Filter 'rollout-*.jsonl' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
}

$existingAll = @()
if (Test-Path $allPath) {
  try {
    $loadedAll = Get-Content -Path $allPath -Raw | ConvertFrom-Json
    if ($loadedAll.threads) {
      $existingAll = @($loadedAll.threads)
    }
  } catch {
    $existingAll = @()
  }
}

$existingCurrent = $null
if (Test-Path $currentPath) {
  try {
    $existingCurrent = Get-Content -Path $currentPath -Raw | ConvertFrom-Json
  } catch {
    $existingCurrent = $null
  }
}

$threadIndex = @{}
foreach ($item in $existingAll) {
  if ($item.thread_id) {
    $threadIndex[$item.thread_id] = $true
  }
}

$current = [ordered]@{
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
    if (-not $threadId) { continue }

    if (-not $threadIndex.ContainsKey($threadId)) {
      $threadIndex[$threadId] = $true
      $existingAll += [ordered]@{
        thread_id = $threadId
        source_file = [ordered]@{
          path = $file.FullName
          last_write_time = $file.LastWriteTime.ToString('o')
        }
        resolved_at = (Get-Date).ToString('o')
      }
    }

    if ($current.status -ne 'ok') {
      $current.thread_id = $threadId
      $current.source_file = [ordered]@{
        path = $file.FullName
        last_write_time = $file.LastWriteTime.ToString('o')
      }
      $current.status = 'ok'
    }
  }
}

if ($current.status -ne 'ok' -and $existingCurrent) {
  $current = [ordered]@{
    thread_id = $existingCurrent.thread_id
    turn_index = $existingCurrent.turn_index
    resolved_at = $existingCurrent.resolved_at
    source_file = $existingCurrent.source_file
    status = $existingCurrent.status
  }
}

$current | ConvertTo-Json -Depth 6 | Set-Content -Path $currentPath -Encoding utf8
[ordered]@{
  updated = (Get-Date).ToString('o')
  threads = @($existingAll)
} | ConvertTo-Json -Depth 8 | Set-Content -Path $allPath -Encoding utf8

$current | ConvertTo-Json -Depth 6
