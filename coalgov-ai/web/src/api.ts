export const API = (import.meta as any).env.VITE_API_URL || "";
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: any,
  ) {
    super(
      typeof detail === "string"
        ? detail
        : detail?.message || JSON.stringify(detail),
    );
  }
}
export async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(API + "/api" + path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      "X-CoalGov-Client": "web",
      ...init.headers,
    },
  });
  if (!res.ok) {
    let data: any;
    try {
      data = await res.json();
    } catch {
      data = { detail: res.statusText };
    }
    throw new ApiError(res.status, data.detail);
  }
  return res.json();
}
export const post = (path: string, data: any = {}) =>
  api(path, { method: "POST", body: JSON.stringify(data) });
export const put = (path: string, data: any) =>
  api(path, { method: "PUT", body: JSON.stringify(data) });
export async function download(path: string, filename: string) {
  const r = await fetch(API + "/api" + path, { credentials: "include" });
  if (!r.ok) throw new Error("Download failed");
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const date = (value: string) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : "—";
export const fullDate = (value: string) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const label = (value: string) => value?.replaceAll("_", " ");
