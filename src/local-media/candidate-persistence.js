import {
  buildPublishCandidate,
  getPublishProjectSnapshotSha256,
  summarizeAssetRights
} from "../../api/_lib/publish-candidates.js";
import {
  appendAudit as appendAuditDefault,
  getRecord as getRecordDefault,
  getStorageStatus as getStorageStatusDefault,
  listRecords as listRecordsDefault,
  saveRecord as saveRecordDefault
} from "../../api/_lib/storage.js";

export function createLocalVerifiedCandidatePersister({
  getStorageStatus = getStorageStatusDefault,
  getRecord = getRecordDefault,
  listRecords = listRecordsDefault,
  saveRecord = saveRecordDefault,
  appendAudit = appendAuditDefault,
  now = () => new Date().toISOString()
} = {}) {
  for (const [name, fn] of Object.entries({ getStorageStatus, getRecord, listRecords, saveRecord, appendAudit, now })) {
    if (typeof fn !== "function") throw new TypeError(`${name} must be a function`);
  }

  return async function persistLocalVerifiedCandidate({ projectId, project, verifiedRender } = {}) {
    const id = safeId(projectId, "verified_candidate_project_id_required");
    const storage = getStorageStatus();
    if (!storage?.writeEnabled) fail("verified_candidate_storage_not_writable", 503);
    const persisted = await getRecord("projects", id);
    if (!persisted) fail("verified_candidate_project_not_found", 404);
    requireOwnership(persisted);
    if (!project || typeof project !== "object" || Array.isArray(project)) {
      fail("verified_candidate_render_project_required");
    }
    requireVerifiedRender(verifiedRender);

    const renderedRecord = {
      id: persisted.id,
      workspaceId: persisted.workspaceId,
      ownerUserId: persisted.ownerUserId,
      project: {
        ...structuredClone(project),
        id: persisted.project?.id || persisted.id,
        workspaceId: persisted.workspaceId,
        ownerUserId: persisted.ownerUserId
      }
    };
    const persistedSnapshot = getPublishProjectSnapshotSha256(persisted);
    const renderedSnapshot = getPublishProjectSnapshotSha256(renderedRecord);
    if (persistedSnapshot !== renderedSnapshot) {
      fail("verified_candidate_project_snapshot_mismatch", 409);
    }

    const assets = (await listRecords("assets")).filter(asset =>
      asset?.projectId === persisted.id
      && asset?.workspaceId === persisted.workspaceId
      && asset?.ownerUserId === persisted.ownerUserId
    );
    const candidate = buildPublishCandidate({
      projectRecord: persisted,
      recipe: verifiedRender.recipe,
      platforms: verifiedRender.platforms,
      artifacts: verifiedRender.artifacts,
      manifestSha256: verifiedRender.manifestSha256,
      rights: summarizeAssetRights(assets),
      evidence: {
        status: "server_verified",
        verifier: "local-media-worker-r1"
      },
      createdAt: now()
    });

    const existing = await getRecord("publishCandidates", candidate.id);
    if (existing) {
      if (existing.digest !== candidate.digest || existing.status !== "sealed") {
        fail("verified_candidate_id_collision", 409);
      }
      return existing;
    }

    await saveRecord("publishCandidates", candidate);
    await appendAudit("publish_candidate.worker_verified", {
      id: candidate.id,
      projectId: candidate.projectId,
      workspaceId: candidate.workspaceId,
      ownerUserId: candidate.ownerUserId,
      digest: candidate.digest,
      evidenceStatus: candidate.evidence.status,
      rightsStatus: candidate.rights.status,
      approvable: candidate.approvable
    });
    return candidate;
  };
}

function requireVerifiedRender(value) {
  if (!value || typeof value !== "object" || value.verifier !== "local-media-worker-r1") {
    fail("verified_candidate_worker_evidence_required");
  }
  if (!value.recipe || !Array.isArray(value.artifacts) || !value.manifestSha256) {
    fail("verified_candidate_render_evidence_incomplete");
  }
}

function requireOwnership(record) {
  if (!record?.workspaceId || !record?.ownerUserId) {
    fail("verified_candidate_project_ownership_required", 409);
  }
}

function safeId(value, code) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) fail(code);
  return id;
}

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}
