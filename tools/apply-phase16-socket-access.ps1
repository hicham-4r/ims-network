$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

if ((git branch --show-current) -ne 'feat/realtime-phase16') {
    throw 'STOP: This change is only allowed on feat/realtime-phase16.'
}

foreach ($required in @(
    'src/server/realtime/socket-access-core.ts',
    'src/server/realtime/socket-access-db.ts',
    'src/server/realtime/authorized-local-socket.ts'
)) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $required) -PathType Leaf)) {
        throw "STOP: Missing required file: $required"
    }
}

$path = Join-Path $root 'src/app/api/ws/route.ts'
if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw 'STOP: Existing WebSocket route not found.'
}

$script:content = [System.IO.File]::ReadAllText($path).Replace("`r`n", "`n")
if ($script:content.Contains('createAuthorizedLocalSocket') -or
    $script:content.Contains('verifySocketSessionAccess')) {
    throw 'STOP: Socket access appears to be integrated already.'
}

function Replace-ExactlyOnce {
    param(
        [Parameter(Mandatory=$true)][string]$Old,
        [Parameter(Mandatory=$true)][string]$New
    )
    $first = $script:content.IndexOf($Old, [StringComparison]::Ordinal)
    $last = $script:content.LastIndexOf($Old, [StringComparison]::Ordinal)
    if ($first -lt 0 -or $first -ne $last) {
        throw "STOP: Route differs from expected Phase 16.17 code. No changes written. Anchor: $($Old.Substring(0, [Math]::Min(65, $Old.Length)))"
    }
    $script:content = $script:content.Replace($Old, $New)
}

Replace-ExactlyOnce 'const privateHeaders = {' @'
import { createAuthorizedLocalSocket } from "@/server/realtime/authorized-local-socket";
import { verifySocketSessionAccess } from "@/server/realtime/socket-access-db";

const privateHeaders = {
'@

Replace-ExactlyOnce '  let actorUserId = "";' @'
  let actorUserId = "";
  let actorSessionId = "";
'@

Replace-ExactlyOnce '    actorUserId = session.user.id;' @'
    actorUserId = session.user.id;
    actorSessionId = session.session.id;
'@

Replace-ExactlyOnce '    const unregister = registerLocalSocket(actorUserId, ws);' @'
    // Authorization is revalidated before each outgoing relay notice,
    // not on an idle polling timer. Each session is checked individually.
    const authorized = createAuthorizedLocalSocket(
      ws,
      () => verifySocketSessionAccess({
        userId: actorUserId,
        sessionId: actorSessionId,
      }),
      () => release(),
    );
    const unregister = registerLocalSocket(actorUserId, authorized.socket);
'@

Replace-ExactlyOnce @'
    if (!unregister) {
      ws.close(1013, "Connection capacity reached");
      return;
    }
'@ @'
    if (!unregister) {
      authorized.dispose();
      ws.close(1013, "Connection capacity reached");
      return;
    }
'@

Replace-ExactlyOnce @'
    } catch {
      unregister();
      ws.close(1013, "Realtime unavailable");
      return;
    }
'@ @'
    } catch {
      authorized.dispose();
      unregister();
      ws.close(1013, "Realtime unavailable");
      return;
    }
'@

Replace-ExactlyOnce @'
    const release = () => {
      clearTimeout(timeout);
      detachRelay();
      unregister();
    };
'@ @'
    const release = () => {
      clearTimeout(timeout);
      authorized.dispose();
      detachRelay();
      unregister();
    };
'@

# All replacements completed in memory; only now modify the route.
[System.IO.File]::WriteAllText(
    $path, $script:content, [System.Text.UTF8Encoding]::new($false)
)
Write-Host 'Phase 16 socket access checks wired into notifications.' -ForegroundColor Green
