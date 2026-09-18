import React, { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { ownerKey, request, Session } from "./api";
import { enqueue } from "./db";

const indiaDate = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const pretty = (value: string) => value.replaceAll("_", " ");
const when = (value: string) =>
  value ? new Date(value).toLocaleString("en-IN") : "—";
const categories = [
  "Wages",
  "Working conditions",
  "Facilities",
  "Conduct",
  "Contract",
  "Other",
];

function Button({ title, onPress, disabled = false, secondary = false }: any) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, secondary && s.secondary, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, secondary && { color: "#126e59" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Input({ label, ...props }: any) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#788d88"
        style={[
          s.input,
          props.multiline && { minHeight: 95, textAlignVertical: "top" },
        ]}
        {...props}
      />
    </View>
  );
}
function Choice({ label, options, value, onChange }: any) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.choices}>
        {options.map((o: any) => (
          <Pressable
            key={o.id || o}
            accessibilityRole="button"
            accessibilityState={{ selected: value === (o.id || o) }}
            style={[s.chip, value === (o.id || o) && s.chosen]}
            onPress={() => onChange(o.id || o)}
          >
            <Text style={s.chipText}>{o.name || pretty(o)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function GeoCapture({ coordinates, onChange }: any) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <View>
      <Button
        title={
          busy
            ? "Capturing GPS…"
            : coordinates
              ? "Update GPS location"
              : "Capture GPS (optional)"
        }
        secondary
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            const permission =
              await Location.requestForegroundPermissionsAsync();
            if (permission.status !== "granted")
              throw new Error(
                "Location permission was not granted. You can save without GPS.",
              );
            const value = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            onChange({
              latitude: value.coords.latitude,
              longitude: value.coords.longitude,
            });
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {coordinates && (
        <Text style={s.muted}>
          {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}
        </Text>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

type Props = {
  kind: "production" | "grievances";
  session: Session;
  mines: any[];
  rows: any[];
  online: boolean;
  onQueued: () => Promise<void>;
};

export function FieldOperations({
  kind,
  session,
  mines,
  rows,
  online,
  onQueued,
}: Props) {
  const [form, setForm] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState("");
  const production = kind === "production";
  const canCreate = production
    ? ["admin", "official", "officer"].includes(session.user.role)
    : ["admin", "official", "officer", "agency", "contractor"].includes(
        session.user.role,
      );
  const mineName = (id: string) => mines.find((x) => x.id === id)?.name || id;
  if (form)
    return (
      <>
        <Button
          title="Back to register"
          secondary
          onPress={() => setForm(null)}
        />
        {production ? (
          <ProductionForm
            session={session}
            mines={mines}
            record={form.id ? form : null}
            onQueued={onQueued}
          />
        ) : (
          <GrievanceForm session={session} mines={mines} onQueued={onQueued} />
        )}
      </>
    );
  if (selected)
    return (
      <>
        <Button
          title="Back to register"
          secondary
          onPress={() => setSelected(null)}
        />
        {production ? (
          <View style={s.card}>
            <Text style={s.heading}>
              {selected.work_date} · Shift {selected.shift}
            </Text>
            <Text style={s.muted}>
              {mineName(selected.mine_id)} · {pretty(selected.status)}
            </Text>
            <Text style={s.body}>
              Coal: {selected.coal_tonnes} t{`\n`}Dispatch:{" "}
              {selected.dispatch_tonnes} t{`\n`}Target: {selected.target_tonnes}{" "}
              t{`\n`}Downtime: {selected.downtime_minutes} minutes
            </Text>
            <Text style={s.body}>{selected.notes || "No shift notes."}</Text>
            {!!selected.review_note && (
              <View style={s.callout}>
                <Text style={s.label}>Review note</Text>
                <Text style={s.body}>{selected.review_note}</Text>
              </View>
            )}
            {selected.status === "returned" &&
              selected.created_by === session.user.id && (
                <Button
                  title="Correct and resubmit offline"
                  onPress={() => {
                    setForm(selected);
                    setSelected(null);
                  }}
                />
              )}
            <Text style={s.muted}>
              Independent review is available in the web dashboard.
            </Text>
          </View>
        ) : (
          <GrievanceDetail
            session={session}
            record={selected}
            mineName={mineName}
            onQueued={onQueued}
          />
        )}
      </>
    );
  return (
    <>
      <Text style={s.title}>
        {production ? "Production reporting" : "Grievance register"}
      </Text>
      <Text style={s.muted}>
        {production
          ? "Record each shift’s output and view review status."
          : "Raise a concern and follow its resolution. Details are available to the reporter and responsible staff."}
      </Text>
      <Text style={s.muted}>
        {online
          ? "Pull to refresh the saved register."
          : "Showing saved records. New entries remain on this device until synchronized."}
      </Text>
      {canCreate && (
        <Button
          title={production ? "＋ New shift report" : "＋ Raise a grievance"}
          onPress={() => setForm({})}
        />
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
      {rows.map((row) => (
        <Pressable
          key={row.id}
          style={s.card}
          accessibilityRole="button"
          onPress={async () => {
            setError("");
            if (!online) {
              setSelected(row);
              return;
            }
            try {
              setSelected(await request(session, "/" + kind + "/" + row.id));
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          <Text style={s.status}>{pretty(row.status).toUpperCase()}</Text>
          <Text style={s.heading}>
            {production ? `${row.work_date} · Shift ${row.shift}` : row.title}
          </Text>
          <Text style={s.muted}>{mineName(row.mine_id)}</Text>
          <Text style={s.body}>
            {production
              ? `${row.coal_tonnes} t produced · ${row.target_tonnes} t target`
              : `${row.category} · ${row.priority} priority`}
          </Text>
          <Text style={s.link}>Open details →</Text>
        </Pressable>
      ))}
      {!rows.length && (
        <View style={s.card}>
          <Text style={s.heading}>No saved records yet</Text>
          <Text style={s.muted}>Create a record or reconnect and refresh.</Text>
        </View>
      )}
      <Text style={s.muted}>
        The mobile register caches the latest 250 records. Use the web register
        for older records and exports.
      </Text>
    </>
  );
}

function ProductionForm({ session, mines, record, onQueued }: any) {
  const [mine, setMine] = useState(record?.mine_id || mines[0]?.id || "");
  const [workDate, setWorkDate] = useState(record?.work_date || indiaDate());
  const [shift, setShift] = useState(record?.shift || "A");
  const [coal, setCoal] = useState(String(record?.coal_tonnes ?? ""));
  const [dispatch, setDispatch] = useState(
    String(record?.dispatch_tonnes ?? ""),
  );
  const [target, setTarget] = useState(String(record?.target_tonnes ?? ""));
  const [downtime, setDowntime] = useState(
    String(record?.downtime_minutes ?? "0"),
  );
  const [notes, setNotes] = useState(record?.notes || "");
  const [coordinates, setCoordinates] = useState<any>(
    record?.latitude != null
      ? { latitude: record.latitude, longitude: record.longitude }
      : null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  return (
    <View style={s.form}>
      <Text style={s.title}>
        {record ? "Correct shift report" : "New shift report"}
      </Text>
      {record ? (
        <Text style={s.body}>
          {workDate} · Shift {shift}. Mine, date and shift stay fixed during
          correction.
        </Text>
      ) : (
        <>
          <Choice
            label="Mine"
            options={mines}
            value={mine}
            onChange={setMine}
          />
          <Input
            label="Work date in India (YYYY-MM-DD)"
            value={workDate}
            onChangeText={setWorkDate}
            maxLength={10}
            placeholder="2026-09-15"
          />
          <Choice
            label="Shift (8 hours)"
            options={["A", "B", "C"]}
            value={shift}
            onChange={setShift}
          />
        </>
      )}
      <Input
        label="Coal produced (tonnes)"
        value={coal}
        onChangeText={setCoal}
        keyboardType="decimal-pad"
        maxLength={12}
      />
      <Input
        label="Coal dispatched (tonnes)"
        value={dispatch}
        onChangeText={setDispatch}
        keyboardType="decimal-pad"
        maxLength={12}
      />
      <Input
        label="Shift target (tonnes)"
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
        maxLength={12}
      />
      <Input
        label="Downtime (minutes, 0–480)"
        value={downtime}
        onChangeText={setDowntime}
        keyboardType="number-pad"
        maxLength={3}
      />
      <Input
        label="Shift notes (optional)"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={10000}
      />
      <GeoCapture coordinates={coordinates} onChange={setCoordinates} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button
        title={busy ? "Saving…" : "Save to offline queue"}
        disabled={busy}
        onPress={async () => {
          if (saving.current) return;
          saving.current = true;
          setBusy(true);
          setError("");
          try {
            if (!mine) throw new Error("Select a mine.");
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(workDate) ||
              Number.isNaN(Date.parse(workDate)) ||
              new Date(workDate).toISOString().slice(0, 10) !== workDate ||
              workDate > indiaDate()
            )
              throw new Error(
                "Enter a valid work date that is not in the future.",
              );
            if (
              ![coal, dispatch, target].every(
                (x) => /^\d+(\.\d{1,2})?$/.test(x) && Number(x) <= 1000000,
              )
            )
              throw new Error(
                "Enter nonnegative tonnes with at most two decimal places (maximum 1,000,000).",
              );
            if (!/^\d+$/.test(downtime) || Number(downtime) > 480)
              throw new Error(
                "Downtime must be an integer from 0 to 480 minutes.",
              );
            const id = Crypto.randomUUID();
            const payload = {
              mine_id: mine,
              work_date: workDate,
              shift,
              coal_tonnes: coal,
              dispatch_tonnes: dispatch,
              target_tonnes: target,
              downtime_minutes: Number(downtime),
              notes,
              captured_at: new Date().toISOString(),
              ...coordinates,
              ...(record ? { version: record.version } : {}),
            };
            await enqueue(
              ownerKey(session),
              {
                mineId: mine,
                operation: {
                  operation_id: id,
                  kind: record ? "update_production" : "create_production",
                  ...(record ? { entity_id: record.id } : {}),
                  payload,
                },
              },
              id,
            );
            await onQueued();
          } catch (e: any) {
            setError(e.message);
          } finally {
            saving.current = false;
            setBusy(false);
          }
        }}
      />
      <Text style={s.muted}>
        One report per mine, date and shift. A different official must approve
        the submitted figures.
      </Text>
    </View>
  );
}

function GrievanceForm({ session, mines, onQueued }: any) {
  const [mine, setMine] = useState(mines[0]?.id || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Facilities");
  const [priority, setPriority] = useState("normal");
  const [coordinates, setCoordinates] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  return (
    <View style={s.form}>
      <Text style={s.title}>Raise a grievance</Text>
      <Text style={s.muted}>
        The reporter, assigned handler, mine officials and administrators can
        see this record. It is not anonymous.
      </Text>
      <Choice label="Mine" options={mines} value={mine} onChange={setMine} />
      <Input
        label="Subject"
        value={title}
        onChangeText={setTitle}
        maxLength={220}
      />
      <Choice
        label="Category"
        options={categories}
        value={category}
        onChange={setCategory}
      />
      <Choice
        label="Priority"
        options={["normal", "high", "urgent"]}
        value={priority}
        onChange={setPriority}
      />
      <Input
        label="What happened and what resolution do you need?"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={10000}
      />
      <GeoCapture coordinates={coordinates} onChange={setCoordinates} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button
        title={busy ? "Saving…" : "Save to offline queue"}
        disabled={busy}
        onPress={async () => {
          if (saving.current) return;
          saving.current = true;
          setBusy(true);
          setError("");
          try {
            if (
              !mine ||
              title.trim().length < 5 ||
              description.trim().length < 10
            )
              throw new Error(
                "Select a mine, add a subject of at least 5 characters, and describe the issue in at least 10 characters.",
              );
            const id = Crypto.randomUUID();
            await enqueue(
              ownerKey(session),
              {
                mineId: mine,
                operation: {
                  operation_id: id,
                  kind: "create_grievance",
                  payload: {
                    mine_id: mine,
                    title,
                    description,
                    category,
                    priority,
                    captured_at: new Date().toISOString(),
                    ...coordinates,
                  },
                },
              },
              id,
            );
            await onQueued();
          } catch (e: any) {
            setError(e.message);
          } finally {
            saving.current = false;
            setBusy(false);
          }
        }}
      />
      <Text style={s.muted}>
        Response targets start when the server receives the grievance: normal 7
        days, high 3 days, urgent 1 day.
      </Text>
    </View>
  );
}

function GrievanceDetail({ session, record: r, mineName, onQueued }: any) {
  const actions = r.status !== "closed" ? ["comment"] : [];
  if (
    r.assigned_to === session.user.id &&
    ["assigned", "in_progress"].includes(r.status)
  )
    actions.push("start", "resolve");
  if (r.created_by === session.user.id && r.status === "resolved")
    actions.push("close");
  if (
    r.created_by === session.user.id &&
    ["resolved", "closed"].includes(r.status)
  )
    actions.push("reopen");
  const [action, setAction] = useState(actions[0] || "comment");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  return (
    <View style={s.form}>
      <Text style={s.title}>{r.title}</Text>
      <Text style={s.status}>
        GR-{r.id.slice(0, 8).toUpperCase()} · {pretty(r.status)}
      </Text>
      <Text style={s.muted}>
        {mineName(r.mine_id)} · {r.priority} priority
      </Text>
      <Text style={s.body}>{r.description}</Text>
      <Text style={s.muted}>Response target: {when(r.due_at)}</Text>
      {!!r.resolution && (
        <View style={s.callout}>
          <Text style={s.label}>Proposed resolution</Text>
          <Text style={s.body}>{r.resolution}</Text>
        </View>
      )}
      {!!actions.length && (
        <>
          <Choice
            label="Update grievance"
            options={actions}
            value={action}
            onChange={setAction}
          />
          <Input
            label={
              action === "close"
                ? "Confirm you accept the resolution"
                : "Explanation or resolution"
            }
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={10000}
          />
          {!!error && <Text style={s.error}>{error}</Text>}
          <Button
            title={busy ? "Saving…" : "Save update to offline queue"}
            disabled={busy}
            onPress={async () => {
              if (saving.current) return;
              saving.current = true;
              setBusy(true);
              setError("");
              try {
                if (note.trim().length < 10)
                  throw new Error(
                    "Add an explanation of at least 10 characters.",
                  );
                const id = Crypto.randomUUID();
                await enqueue(
                  ownerKey(session),
                  {
                    mineId: r.mine_id,
                    operation: {
                      operation_id: id,
                      kind: "transition_grievance",
                      entity_id: r.id,
                      payload: { version: r.version, action, note },
                    },
                  },
                  id,
                );
                await onQueued();
              } catch (e: any) {
                setError(e.message);
              } finally {
                saving.current = false;
                setBusy(false);
              }
            }}
          />
        </>
      )}
      <Text style={s.muted}>
        Assignment is available in the web dashboard. Closure requires the
        reporter’s acceptance.
      </Text>
      {r.timeline?.map((event: any) => (
        <View style={s.card} key={event.id}>
          <Text style={s.label}>
            {pretty(event.action)} · {when(event.occurred_at)}
          </Text>
          <Text style={s.body}>{event.note}</Text>
          <Text style={s.muted}>
            {event.integrity_verified
              ? "Audit fingerprint verified"
              : "Fingerprint mismatch — review required"}
          </Text>
        </View>
      ))}
      {!r.timeline && (
        <Text style={s.muted}>
          Connect and reopen this record to load the full conversation.
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  title: {
    fontSize: 25,
    color: "#193b36",
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 10,
  },
  heading: {
    fontSize: 17,
    color: "#193b36",
    fontWeight: "600",
    lineHeight: 24,
  },
  muted: { fontSize: 13, color: "#5b746d", lineHeight: 20, marginVertical: 6 },
  body: { fontSize: 15, color: "#29483f", lineHeight: 24 },
  label: { fontSize: 13, fontWeight: "600", color: "#29483f", marginBottom: 8 },
  status: {
    color: "#147561",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 5,
  },
  link: { fontSize: 13, color: "#147561", fontWeight: "600", marginTop: 8 },
  card: {
    borderWidth: 1,
    borderColor: "#dae5df",
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 14,
    marginVertical: 8,
    gap: 5,
  },
  callout: {
    padding: 15,
    backgroundColor: "#e9f3ed",
    borderRadius: 10,
    marginVertical: 10,
  },
  field: { marginVertical: 9 },
  form: { gap: 4 },
  input: {
    backgroundColor: "#fff",
    borderColor: "#c9dbd2",
    borderWidth: 1,
    borderRadius: 9,
    padding: 13,
    color: "#233e35",
    fontSize: 15,
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    borderColor: "#d4e1da",
    borderWidth: 1,
    backgroundColor: "#fff",
  },
  chosen: { borderColor: "#3b9377", backgroundColor: "#e2f0e9" },
  chipText: { color: "#235845", fontSize: 13 },
  button: {
    backgroundColor: "#126e59",
    borderRadius: 9,
    padding: 14,
    marginVertical: 8,
    alignItems: "center",
  },
  secondary: {
    backgroundColor: "#e9f2ec",
    borderWidth: 1,
    borderColor: "#c7ded1",
  },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  error: { color: "#a34127", fontSize: 13, lineHeight: 20, marginVertical: 8 },
});
