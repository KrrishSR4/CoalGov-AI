import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
let handle: Promise<SQLite.SQLiteDatabase> | null = null;
export async function database() {
  if (!handle)
    handle = SQLite.openDatabaseAsync("coalgov-field.db").then(async (db) => {
      await db.execAsync(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS cache (owner TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(owner,key));
CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, owner TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);`);
      return db;
    });
  return handle;
}
export async function cachePut(owner: string, key: string, value: unknown) {
  const db = await database();
  await db.runAsync(
    "INSERT OR REPLACE INTO cache(owner,key,value) VALUES(?,?,?)",
    owner,
    key,
    JSON.stringify(value),
  );
}
export async function cacheGet<T>(
  owner: string,
  key: string,
  fallback: T,
): Promise<T> {
  const db = await database();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM cache WHERE owner=? AND key=?",
    owner,
    key,
  );
  return row ? JSON.parse(row.value) : fallback;
}
export type Pending = {
  id: string;
  owner: string;
  body: string;
  state: string;
  error: string;
  created_at: string;
};
export async function enqueue(
  owner: string,
  body: any,
  id = Crypto.randomUUID(),
) {
  const db = await database();
  await db.runAsync(
    "INSERT INTO outbox(id,owner,body,state,error,created_at) VALUES(?,?,?,'pending','',?)",
    id,
    owner,
    JSON.stringify(body),
    new Date().toISOString(),
  );
  return id;
}
export async function pending(owner: string) {
  return (await database()).getAllAsync<Pending>(
    "SELECT * FROM outbox WHERE owner=? ORDER BY created_at",
    owner,
  );
}
export async function updatePending(
  id: string,
  owner: string,
  body: any,
  state: string,
  error = "",
) {
  await (
    await database()
  ).runAsync(
    "UPDATE outbox SET body=?,state=?,error=? WHERE id=? AND owner=?",
    JSON.stringify(body),
    state,
    error,
    id,
    owner,
  );
}
export async function removePending(id: string, owner: string) {
  await (
    await database()
  ).runAsync("DELETE FROM outbox WHERE id=? AND owner=?", id, owner);
}
