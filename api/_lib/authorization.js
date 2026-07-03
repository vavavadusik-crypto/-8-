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

function actorRequiresOwnership(actor) {
  return actor?.mode === "signed-session";
}
