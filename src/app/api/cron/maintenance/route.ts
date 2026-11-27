import { reportFailure } from "@/server/observability/safe-events";
import { isMaintenanceAuthorized, resolveMaintenancePolicy } from "@/server/maintenance/policy";

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function GET(request: Request) {
  if (request.method !== "GET") return reply({ error: "Method not allowed" }, 405);
  // Authenticate before configuration disclosure or database loading.
  if (!isMaintenanceAuthorized(process.env.CRON_SECRET, request.headers.get("authorization"))) {
    return reply({ error: "Unauthorized" }, 401);
  }
  const policy = resolveMaintenancePolicy(process.env);
  if (!policy) return reply({ error: "Maintenance disabled" }, 503);
  if (new URL(request.url).search) return reply({ error: "Unexpected query string" }, 400);
  try {
    const { runMaintenance } = await import("@/server/maintenance/run");
    return reply(await runMaintenance(policy));
  } catch {
    // Never log database exceptions, tokens, identifiers or request headers.
    reportFailure("maintenance_failed");
    return reply({ error: "Maintenance unsuccessful" }, 503);
  }
}
