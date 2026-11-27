param(
  [switch]$Full
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root
$branch = (& git branch --show-current)
if ($LASTEXITCODE -ne 0 -or $branch.Trim() -ne 'feat/realtime-phase16') {
  throw 'Expected feat/realtime-phase16. No action taken.'
}
$tests = @(
  '.\tools\test-phase16-activation-policy.ts',
  '.\tools\test-phase16-relay-trial-lease.ts',
  '.\tools\test-phase16-relay-trial-budget.ts'
)
foreach ($test in $tests) {
  Write-Host "TEST: $test"
  & npx --no-install tsx $test
  if ($LASTEXITCODE -ne 0) { throw "Test failed: $test" }
}
if ($Full) {
  & '.\tools\test-phase16-preflight.ps1' -Full
  if (-not $?) { throw 'Existing Phase 16 integration suite failed.' }
  # The prior runner performs typecheck/lint/build and git diff --check.
  Write-Host 'PHASE 16.19N FULL OFFLINE PREFLIGHT: PASS' -ForegroundColor Green
} else {
  Write-Host 'PHASE 16.19N FOCUSED OFFLINE PREFLIGHT: PASS' -ForegroundColor Green
}
