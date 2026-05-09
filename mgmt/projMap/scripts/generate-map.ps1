param(
  [string]$ProjectRoot = (Get-Location).Path
)

$mapPath = Join-Path $ProjectRoot 'mgmt\projMap\map.json'
$timestamp = (Get-Date).ToString('o')

if (-not (Test-Path $mapPath)) {
  $payload = [ordered]@{
    id = "map:$(Split-Path $ProjectRoot -Leaf)"
    type = 'project-map'
    name = Split-Path $ProjectRoot -Leaf
    summary = 'Initialized scaffold map'
    root = $ProjectRoot
    updated = $timestamp
    nodes = @()
    edges = @()
    children = @()
  }
  $payload | ConvertTo-Json -Depth 8 | Set-Content -Path $mapPath -Encoding utf8
  exit 0
}

$map = Get-Content -Path $mapPath -Raw | ConvertFrom-Json
$map.updated = $timestamp
$map | ConvertTo-Json -Depth 20 | Set-Content -Path $mapPath -Encoding utf8
