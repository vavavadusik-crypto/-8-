export function filterRecordsForActor(records, actor) {
  if (!Array.isArray(records)) return [];
  if (!actorRequiresOwnership(actor)) return records;
  return records.filter(record => canAccessRecord(record, actor));
}

export function requireRecordAccess(record, actor, action = "read") {
  if (!actorRequiresOwnership(actor) || canAccessRecord(record, actor)) return actor;

  const error = new Error("forbidden");
  error.status = 403;
  error.code = "forbidden";
  error.note = `Actor cannot ${action} this record.`;
  throw error;
}

export function canAccessRecord(record, actor) {
  if (!record || !actor) return false;
  const actorWorkspaceId = String(actor.workspaceId || "");
  const recordWorkspaceId = String(record.workspaceId || record.project?.workspaceId || "");
  return Boolean(actorWorkspaceId && recordWorkspaceId && actorWorkspaceId === recordWorkspaceId);
}

// Per-record ownership (workspace / tenant isolation) is enforced ONLY for
// signed-session actors — real logged-in accounts in a multi-user deployment.
// The "owner-token" and "development" actor modes intentionally bypass ownership:
// they represent the single operator of a self-hosted / local instance who owns
// every record by definition. This is safe for single-tenant self-host, but an
// owner-token / development actor MUST NOT be exposed on a shared multi-tenant
// deployment. See SECURITY.md → "Deployment trust model".
function actorRequiresOwnership(actor) {
  return actor?.mode === "signed-session";
}
