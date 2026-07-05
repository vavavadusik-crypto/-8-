import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessRecord, filterRecordsForActor, requireRecordAccess } from "../../api/_lib/authorization.js";

const sessionActor = { authenticated: true, id: "user_a", workspaceId: "workspace_a", mode: "signed-session" };
const ownerActor = { authenticated: true, id: "owner", mode: "owner-token" };

const records = [
  { id: "rec_a", workspaceId: "workspace_a" },
  { id: "rec_b", workspaceId: "workspace_b" },
  { id: "rec_nested", project: { workspaceId: "workspace_a" } },
  { id: "rec_none" }
];

test("signed-session actor only sees records of its workspace", () => {
  const visible = filterRecordsForActor(records, sessionActor).map(record => record.id);
  assert.deepEqual(visible, ["rec_a", "rec_nested"]);
});

test("owner-token actor sees all records (bootstrap bypass by design)", () => {
  assert.equal(filterRecordsForActor(records, ownerActor).length, records.length);
});

test("non-array input yields an empty list", () => {
  assert.deepEqual(filterRecordsForActor(null, sessionActor), []);
  assert.deepEqual(filterRecordsForActor("nope", sessionActor), []);
});

test("cross-workspace record access throws 403", () => {
  assert.throws(() => requireRecordAccess({ id: "rec_b", workspaceId: "workspace_b" }, sessionActor, "read"), error => {
    assert.equal(error.status, 403);
    assert.equal(error.code, "forbidden");
    return true;
  });
});

test("same-workspace record access passes for direct and nested workspace ids", () => {
  assert.equal(requireRecordAccess(records[0], sessionActor, "read"), sessionActor);
  assert.equal(requireRecordAccess(records[2], sessionActor, "read"), sessionActor);
});

test("records without workspace metadata are hidden from session actors", () => {
  assert.equal(canAccessRecord({ id: "rec_none" }, sessionActor), false);
  assert.throws(() => requireRecordAccess({ id: "rec_none" }, sessionActor, "read"));
});

test("actor without workspace cannot match anything", () => {
  const broken = { ...sessionActor, workspaceId: "" };
  assert.equal(canAccessRecord(records[0], broken), false);
});
