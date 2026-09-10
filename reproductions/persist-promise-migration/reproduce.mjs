import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

import { createStore } from 'zustand/vanilla';
import { persist, createJSONStorage } from 'zustand/middleware';

const database = new Dexie('zustand-migration-audit');
database.version(1).stores({ metadata: 'id' });
await database.table('metadata').put({ id: 'schema', revision: 2 });
const original = { drafts: [{ id: 'draft-1', text: 'The only saved copy of my draft' }] };

async function scenario(kind) {
  let stored = JSON.stringify({ state: original, version: 1 });
  const writes = [];
  const completion = [];
  let migrationPromise;
  let migrationCalls = 0;
  let complete;
  const hydrationCompleted = new Promise((resolve) => { complete = resolve; });
  const storage = createJSONStorage(() => ({
    getItem: () => stored,
    setItem: (_, value) => { stored = value; writes.push(JSON.parse(value)); },
    removeItem: () => { stored = null; },
  }));
  const options = {
    name: 'drafts', storage, version: 2,
    partialize: ({ drafts }) => ({ drafts }),
    migrate: (state) => {
      migrationCalls++;
      if (kind === 'cross-realm') {
        migrationPromise = runInNewContext('Promise.resolve(state)', { state });
      } else {
        const result = database.table('metadata').get('schema').then(() => state);
        migrationPromise = kind === 'native-wrapper' ? Promise.resolve(result) : result;
      }
      return migrationPromise;
    },
    onRehydrateStorage: () => (state, error) => {
      completion.push({ drafts: state?.drafts, error: error?.message ?? null });
      complete();
    },
  };
  const store = createStore(persist(() => ({ drafts: [], panelOpen: false }), options));
  await hydrationCompleted;
  const resolvedMigration = await migrationPromise;
  const diskAfterHydration = JSON.parse(stored);
  const reloaded = createStore(persist(() => ({ drafts: [], panelOpen: false }), options));

  const result = {
    kind,
    automaticHydration: true,
    nativePromiseInstance: migrationPromise instanceof Promise,
    resolvedMigration,
    stateAfterHydration: store.getState().drafts,
    diskAfterHydration,
    stateAfterReload: reloaded.getState().drafts,
    migrationCalls,
    completion,
    writes,
  };
  assert.deepEqual(resolvedMigration, original);
  return result;
}

try {
  const results = [];
  for (const kind of ['native-wrapper', 'dexie', 'cross-realm']) results.push(await scenario(kind));
  console.log(JSON.stringify({ mode: 'zustand@5.0.15', results }, null, 2));
  for (const result of results) {
    assert.deepEqual(result.stateAfterReload, original.drafts, `${result.kind}: migration must preserve saved drafts`);
  }
} finally {
  await database.delete();
}
