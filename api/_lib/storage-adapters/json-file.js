import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function createJsonFileStorageAdapter(options) {
  const { dataRoot, assertCollection, assertSafeId } = options;

  return {
    id: "json-file",
    kind: "local-file",
    async listRecords(collection) {
      assertCollection(collection);
      const dir = collectionPath(dataRoot, collection);
      let entries = [];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (_) {
        return [];
      }

      const records = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        try {
          const record = JSON.parse(await readFile(join(dir, entry.name), "utf8"));
          records.push(record);
        } catch (_) {}
      }
      return records.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    },
    async getRecord(collection, id) {
      assertCollection(collection);
      assertSafeId(id);
      try {
        return JSON.parse(await readFile(recordPath(dataRoot, collection, id), "utf8"));
      } catch (_) {
        return null;
      }
    },
    async saveRecord(collection, record) {
      assertCollection(collection);
      assertSafeId(record.id);
      const dir = collectionPath(dataRoot, collection);
      await mkdir(dir, { recursive: true });
      const target = recordPath(dataRoot, collection, record.id);
      const tmp = `${target}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(record, null, 2));
      await rename(tmp, target);
      return record;
    },
    async deleteRecord(collection, id) {
      assertCollection(collection);
      assertSafeId(id);
      await rm(recordPath(dataRoot, collection, id), { force: true });
    }
  };
}

function recordPath(dataRoot, collection, id) {
  return join(collectionPath(dataRoot, collection), `${id}.json`);
}

function collectionPath(dataRoot, collection) {
  return join(dataRoot, collection);
}
