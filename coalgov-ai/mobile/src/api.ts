export type Session = { base: string; token: string; user: any };
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
export async function request(
  session: Session,
  path: string,
  method = "GET",
  data?: any,
) {
  const body =
    data instanceof FormData
      ? data
      : data !== undefined
        ? JSON.stringify(data)
        : undefined;
  const response = await fetch(session.base + "/api" + path, {
    method,
    body,
    credentials: "omit",
    headers: {
      ...(data instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(session.token ? { Authorization: "Bearer " + session.token } : {}),
    },
  });
  const json = await response.json();
  if (!response.ok) throw new ApiError(response.status, json.detail);
  return json;
}
export const ownerKey = (session: Session) =>
  session.base + "|" + session.user.id;
