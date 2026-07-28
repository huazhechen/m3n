param(
  [int]$BatchSize = 8
)

$ErrorActionPreference = 'Stop'

$scoreFiles = git status --porcelain -- src/scores |
  ForEach-Object { $_.Substring(3) } |
  Sort-Object

if ($scoreFiles.Count -eq 0) {
  Write-Host 'No pending score files to commit.'
  exit 0
}

$batch = 1
for ($index = 0; $index -lt $scoreFiles.Count; $index += $BatchSize) {
  $endIndex = [Math]::Min($index + $BatchSize - 1, $scoreFiles.Count - 1)
  $files = $scoreFiles[$index..$endIndex]

  git add -- $files

  if ($batch -eq 1) {
    git add -- src/lib/samples.ts scripts/generate-bass-scores.mjs scripts/commit-score-batches.ps1
  }

  $startNumber = $index + 1
  $endNumber = $endIndex + 1
  git commit -m "Add bass score batch $($batch.ToString('000')) ($startNumber-$endNumber)"

  $batch += 1
}

Write-Host "Committed $($batch - 1) batches for $($scoreFiles.Count) score files."
