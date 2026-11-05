$ErrorActionPreference = "Stop"

Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

Write-Host "`n[1/4] TypeScript" -ForegroundColor Cyan
& npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw "TypeScript failed." }

Write-Host "`n[2/4] ESLint" -ForegroundColor Cyan
& npm.cmd run lint
if ($LASTEXITCODE -ne 0) { throw "ESLint failed." }

Write-Host "`n[3/4] Production build" -ForegroundColor Cyan
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

Write-Host "`n[4/4] Git formatting" -ForegroundColor Cyan
& git diff --check
if ($LASTEXITCODE -ne 0) { throw "Git formatting failed." }

Write-Host "`nALL PHASE 12 CODE CHECKS PASSED" -ForegroundColor Green
