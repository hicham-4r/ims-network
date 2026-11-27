# Phase 14 Preview-only test launcher. Windows PowerShell 5.1 compatible.
# Never prints/stores the database connection string; never reads .env.local.
$ErrorActionPreference = 'Stop'
$ExpectedHost = 'ep-misty-salad-b9lmcmek.c-7.eu-central-1.aws.neon.tech'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $Root

$Branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $Branch -ne 'test/phase14-preview') {
    throw 'STOP: Switch to the local test/phase14-preview branch first.'
}

if (-not (Test-Path -LiteralPath '.\node_modules\.bin\tsx.cmd' -PathType Leaf)) {
    throw 'STOP: Project dependencies are missing. Do not run npm install blindly.'
}

$Check = Read-Host 'Type PREVIEW to authorize synthetic tests in ims-network-preview'
if ($Check -cne 'PREVIEW') {
    throw 'Cancelled: authorization phrase not entered.'
}

$Secret = Read-Host 'Paste the Neon ims-network-preview DIRECT PostgreSQL URL' -AsSecureString
$Ptr = [IntPtr]::Zero
$Plain = $null
$HadDb = Test-Path Env:DATABASE_URL
$OldDb = if ($HadDb) { $env:DATABASE_URL } else { $null }
$HadPooled = Test-Path Env:DATABASE_URL_POOLED
$OldPooled = if ($HadPooled) { $env:DATABASE_URL_POOLED } else { $null }
$HadFlag = Test-Path Env:IMS_PHASE14_PREVIEW_TEST
$OldFlag = if ($HadFlag) { $env:IMS_PHASE14_PREVIEW_TEST } else { $null }

try {
    $Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    $Plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr)

    $Uri = New-Object System.Uri($Plain)
    if (
        ($Uri.Scheme -ne 'postgresql' -and $Uri.Scheme -ne 'postgres') -or
        $Uri.Host -cne $ExpectedHost -or
        $Uri.AbsolutePath -cne '/neondb' -or
        $Uri.Host.Contains('-pooler')
    ) {
        throw 'STOP: Connection does not match the approved Preview Neon direct database.'
    }

    Write-Host 'Preview-only target guard: PASS' -ForegroundColor Green
    $env:DATABASE_URL = $Plain
    $env:DATABASE_URL_POOLED = $Plain
    $env:IMS_PHASE14_PREVIEW_TEST = 'EXPLICIT_PREVIEW_ONLY'

    # Single child process; after it exits, Preview credentials are restored/
    # removed in finally even if a test fails. Do not use npm db:migrate here.
    & '.\node_modules\.bin\tsx.cmd' '.\tools\test-phase14-preview.ts'
    if ($LASTEXITCODE -ne 0) {
        throw 'Preview integration runner failed. Check the non-secret PASS/FAIL output.'
    }
}
finally {
    if ($HadDb) { $env:DATABASE_URL = $OldDb }
    else { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
    if ($HadPooled) { $env:DATABASE_URL_POOLED = $OldPooled }
    else { Remove-Item Env:DATABASE_URL_POOLED -ErrorAction SilentlyContinue }
    if ($HadFlag) { $env:IMS_PHASE14_PREVIEW_TEST = $OldFlag }
    else { Remove-Item Env:IMS_PHASE14_PREVIEW_TEST -ErrorAction SilentlyContinue }
    if ($Ptr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)
    }
    if ($Secret) { $Secret.Dispose() }
    $Plain = $null
    $OldDb = $null
    $OldPooled = $null
}
