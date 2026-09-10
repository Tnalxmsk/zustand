# Zustand migration Promise data loss reproduction

This reproduction uses the published `zustand@5.0.15` and `dexie@4.4.5` packages.
Node.js 22+ is recommended. No browser, credentials, or external services are needed.
`fake-indexeddb` supplies an in-memory IndexedDB implementation; migration returns
an actual Dexie Promise from a database operation.

```sh
git clone --depth 1 --branch repro/persist-promise-migration https://github.com/Tnalxmsk/zustand.git
cd zustand/reproductions/persist-promise-migration
npm ci
npm test
```

**The test is expected to fail on 5.0.15.** It first prints the observed results,
then asserts that saved drafts survive migration and store recreation.

A saved draft at version 1 is lost when `migrate` directly returns a Dexie Promise.
The stored record becomes `{ "state": { "drafts": [] }, "version": 2 }`, and
hydration reports no error. Since the version has advanced, recreating the store
does not rerun migration. This happens during automatic hydration at startup,
without a user editing the store.

The control wraps the same operation in native `Promise.resolve`, which preserves
the data. A native Promise from another realm also reproduces the failure.
All test data is generated locally; no existing user storage is accessed.
