import { Session, request, ownerKey } from "./api";
import { pending, updatePending, removePending } from "./db";
import * as FileSystem from "expo-file-system/legacy";
const flights = new Map<
  string,
  Promise<{ synced: number; remaining: number }>
>();
export function synchronize(session: Session) {
  const owner = ownerKey(session);
  if (flights.has(owner)) return flights.get(owner)!;
  const flight = performSync(session).finally(() => flights.delete(owner));
  flights.set(owner, flight);
  return flight;
}
async function performSync(session: Session) {
  const owner = ownerKey(session);
  let synced = 0;
  for (const row of await pending(owner)) {
    if (row.state === "conflict" || row.state === "error") continue;
    const body = JSON.parse(row.body);
    try {
      if (
        body.operation.kind === "transition_case" &&
        body.photoUri &&
        !body.evidenceUploaded
      ) {
        const form = new FormData();
        form.append("file", {
          uri: body.photoUri,
          name: "corrective-evidence.jpg",
          type: "image/jpeg",
        } as any);
        form.append("mine_id", body.mineId);
        form.append("case_id", body.operation.entity_id);
        form.append("purpose", "corrective_action");
        form.append("upload_id", row.id);
        await request(session, "/documents", "POST", form);
        body.evidenceUploaded = true;
        await updatePending(row.id, owner, body, "pending");
      }
      if (!body.serverId) {
        const result = await request(session, "/sync", "POST", {
          operations: [body.operation],
        });
        const item = result.results[0];
        if (item.status !== "synced") {
          await updatePending(
            row.id,
            owner,
            body,
            item.status,
            JSON.stringify(item.detail),
          );
          continue;
        }
        body.serverId = item.entity.id;
        body.serverVersion = item.entity.version;
        await updatePending(row.id, owner, body, "uploading");
      }
      if (body.photoUri && !body.evidenceUploaded) {
        const form = new FormData();
        form.append("file", {
          uri: body.photoUri,
          name: "field-evidence.jpg",
          type: "image/jpeg",
        } as any);
        form.append("mine_id", body.mineId);
        form.append("case_id", body.serverId);
        form.append("purpose", body.purpose || "observation");
        form.append("upload_id", row.id);
        await request(session, "/documents", "POST", form);
      }
      await removePending(row.id, owner);
      if (body.photoUri)
        await FileSystem.deleteAsync(body.photoUri, { idempotent: true }).catch(
          () => {},
        );
      synced++;
    } catch (error: any) {
      if ([401, 403].includes(error.status)) throw error;
      await updatePending(
        row.id,
        owner,
        body,
        error.status && error.status < 500 ? "error" : "pending",
        error.message,
      );
      if (!error.status || error.status >= 500) break;
    }
  }
  return { synced, remaining: (await pending(owner)).length };
}
