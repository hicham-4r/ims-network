param([switch]$Full)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root

$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'feat/realtime-phase16') {
    throw 'Expected feat/realtime-phase16. No tests run.'
}

$tests = @(
    'test-phase16-reader-pacing.ts',
    'test-phase16-reader-early-empty.ts',
    'test-phase16-relay-budget.ts',
    'test-phase16-stream-reader.ts',
    'test-phase16-stream-reader-tcp.ts',
    'test-phase16-relay-bridge.ts',
    'test-phase16-relay-runtime.ts',
    'test-phase16-socket-access.ts',
    'test-phase16-publisher-gate.ts',
    'test-phase16-message-notice.ts',
    'test-phase16-realtime-client.ts',
    'test-phase16-socket-deadline.ts',
    'test-phase16-handshake-watchdog.ts',
    'test-phase16-reader-counters.ts',
    'test-phase16-offline-cross-instance.ts'
)

foreach ($name in $tests) {
    $path = Join-Path $PSScriptRoot $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing test: $name"
    }
    Write-Host "Running $name"
    & npx --no-install tsx $path
    if ($LASTEXITCODE -ne 0) { throw "Failed: $name" }
}

if ($Full) {
    & npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed' }
    & npm run lint -- --max-warnings=0
    if ($LASTEXITCODE -ne 0) { throw 'Lint failed' }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    & git diff --check
    if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }
}
Write-Host 'PHASE 16.19K-L OFFLINE INTEGRATION PREFLIGHT: PASS' -ForegroundColor Green
