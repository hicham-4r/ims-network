$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

if ((git branch --show-current) -ne 'feat/realtime-phase16') {
    throw 'STOP: Must be on feat/realtime-phase16.'
}

$path = Join-Path $root 'src/app/api/ws/route.ts'
if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw 'STOP: WebSocket route missing.'
}

$script:content = [System.IO.File]::ReadAllText($path).Replace("`r`n", "`n")

function Replace-ExactlyOnce {
    param(
        [Parameter(Mandatory=$true)][string]$Old,
        [Parameter(Mandatory=$true)][string]$New
    )
    $first = $script:content.IndexOf($Old, [StringComparison]::Ordinal)
    $last = $script:content.LastIndexOf($Old, [StringComparison]::Ordinal)
    if ($first -lt 0 -or $first -ne $last) {
        throw "STOP: Route differs from expected version. No changes written. Anchor: $($Old.Substring(0, [Math]::Min(50, $Old.Length)))"
    }
    $script:content = $script:content.Replace($Old, $New)
}

Replace-ExactlyOnce 'const privateHeaders = {' (
    "import { attachRelayForAuthenticatedSocket } from `"@/server/realtime/relay-runtime`";`n`nconst privateHeaders = {"
)

$oldRegistration = @'
    if (!unregister) {
      ws.close(1013, "Connection capacity reached");
      return;
    }
'@
$newRegistration = @'
    if (!unregister) {
      ws.close(1013, "Connection capacity reached");
      return;
    }

    // Relay stays OFF until explicitly enabled on Preview. The socket
    // is already registered against its Better Auth session identity.
    let detachRelay: () => void;
    try {
      detachRelay = attachRelayForAuthenticatedSocket(actorUserId);
    } catch {
      unregister();
      ws.close(1013, "Realtime unavailable");
      return;
    }
'@
Replace-ExactlyOnce $oldRegistration $newRegistration

$oldTimeout = @'
    const timeout = setTimeout(() => {
      unregister();
      ws.terminate();
    }, 30_000);
'@
$newTimeout = @'
    const timeout = setTimeout(() => {
      release();
      ws.terminate();
    }, 30_000);
'@
Replace-ExactlyOnce $oldTimeout $newTimeout

$oldRelease = @'
    const release = () => {
      clearTimeout(timeout);
      unregister();
    };
'@
$newRelease = @'
    const release = () => {
      clearTimeout(timeout);
      detachRelay();
      unregister();
    };
'@
Replace-ExactlyOnce $oldRelease $newRelease

[System.IO.File]::WriteAllText($path, $script:content, [System.Text.UTF8Encoding]::new($false))
Write-Host 'Phase 16 relay bridge wired behind the OFF-by-default Preview flag.' -ForegroundColor Green
