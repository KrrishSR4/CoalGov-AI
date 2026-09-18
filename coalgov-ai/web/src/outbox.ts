// Device-local drafts are partitioned by account. Nothing is removed until the
// server returns a durable receipt for this exact operation ID.
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("coalgov-field", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("outbox", { keyPath: "operation_id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export async function queued(userId: string) {
  const db = await open();
  return new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction("outbox");
    const r = tx.objectStore("outbox").getAll();
    r.onsuccess = () => resolve(r.result.filter((x) => x.user_id === userId));
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function saveDraft(row: any, replaces?: string) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").put(row);
    if (replaces) tx.objectStore("outbox").delete(replaces);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
export async function removeDraft(id: string) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
