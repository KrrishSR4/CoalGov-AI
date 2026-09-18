import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import NetInfo from "@react-native-community/netinfo";
import { Session, request, ownerKey } from "./src/api";
import {
  cacheGet,
  cachePut,
  enqueue,
  pending,
  Pending,
  removePending,
  updatePending,
} from "./src/db";
import { synchronize } from "./src/sync";
import { FieldOperations } from "./src/Operations";

const SESSION_KEY = "coalgov-session-v1";
const categories = [
  "Ventilation",
  "Electrical",
  "Environment",
  "Equipment",
  "Workforce",
  "Fire",
  "Transport",
  "Other",
];
const pretty = (s: string) => s.replaceAll("_", " ");
const date = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const emptyData = {
  mines: [] as any[],
  cases: [] as any[],
  inspections: [] as any[],
  production: [] as any[],
  grievances: [] as any[],
  dashboard: null as any,
};

function Button({ title, onPress, secondary = false, disabled = false }: any) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text>
    </Pressable>
  );
}
function Input({ label, ...props }: any) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#91a398"
        style={[
          s.input,
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
        ]}
        {...props}
      />
    </View>
  );
}
function Chip({ title, selected, onPress }: any) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && s.chipSelected]}
    >
      <Text style={[s.chipText, selected && { color: "#126e59" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Badge({ value }: any) {
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{pretty(value)}</Text>
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [boot, setBoot] = useState(true);
  const [data, setData] = useState(emptyData);
  const [screen, setScreen] = useState("Overview");
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<Pending[]>([]);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [inspection, setInspection] = useState<any>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    SecureStore.getItemAsync(SESSION_KEY)
      .then((value) => {
        if (value) setSession(JSON.parse(value));
        setBoot(false);
      })
      .catch(() => setBoot(false));
    Animated.timing(opacity, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, []);
  useEffect(
    () =>
      NetInfo.addEventListener((state) =>
        setOnline(
          state.isConnected === true && state.isInternetReachable !== false,
        ),
      ),
    [],
  );
  const refresh = async (active = session) => {
    if (!active) return;
    const owner = ownerKey(active);
    setQueue(await pending(owner));
    try {
      const [mines, cases, inspections, dashboard, production, grievances] =
        await Promise.all([
          request(active, "/mines"),
          request(active, "/cases"),
          active.user.role === "contractor"
            ? Promise.resolve([])
            : request(active, "/inspections"),
          request(active, "/dashboard"),
          active.user.role === "contractor"
            ? Promise.resolve([])
            : request(active, "/production"),
          request(active, "/grievances"),
        ]);
      const fresh = {
        mines,
        cases,
        inspections,
        dashboard,
        production,
        grievances,
      };
      await cachePut(owner, "snapshot", fresh);
      setData(fresh);
      setNotice("");
    } catch (e: any) {
      setNotice(
        e.status === 401
          ? "Your session expired. Sign in again to sync."
          : "Showing the last saved records. New observations can still be saved offline.",
      );
    }
  };
  const sync = async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      const r = await synchronize(session);
      await refresh();
      setNotice(
        `${r.synced} operations synchronized. ${r.remaining} remain on this device.`,
      );
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!session) return;
    let active = true;
    cacheGet(ownerKey(session), "snapshot", emptyData).then((v) => {
      if (active) setData({ ...emptyData, ...v });
    });
    refresh(session);
    return () => {
      active = false;
    };
  }, [session]);
  useEffect(() => {
    if (online && session) sync();
  }, [online, session]);
  const login = async (value: Session) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(value));
    setSession(value);
    setScreen("Overview");
  };
  const logout = async () => {
    if (!session || busy) return;
    try {
      await request(session, "/auth/logout", "POST", {});
    } catch {}
    await SecureStore.deleteItemAsync(SESSION_KEY);
    setSession(null);
    setData(emptyData);
    setQueue([]);
    setSelected(null);
    setInspection(null);
  };
  if (boot)
    return (
      <SafeAreaProvider>
        <View style={s.center}>
          <ActivityIndicator color="#107560" />
          <Text style={s.muted}>Opening field workspace…</Text>
        </View>
      </SafeAreaProvider>
    );
  if (!session)
    return (
      <SafeAreaProvider>
        <SafeAreaView style={s.root}>
          <Login onLogin={login} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  const mineName = (id: string) =>
    data.mines.find((m) => m.id === id)?.name || id;
  const canReport = [
    "admin",
    "official",
    "officer",
    "agency",
    "contractor",
  ].includes(session.user.role);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.root}>
        <StatusBar style="dark" />
        <View style={s.header}>
          <View>
            <Text style={s.brand}>
              CoalGov <Text style={{ color: "#5a9749" }}>AI</Text>
            </Text>
            <Text style={s.headerSub}>FIELD WORKSPACE</Text>
          </View>
          <Pressable
            onPress={logout}
            disabled={busy}
            accessibilityLabel="Sign out"
          >
            <Text style={s.logout}>Sign out</Text>
          </Pressable>
        </View>
        <View style={s.connection}>
          <Text style={{ color: online ? "#4b856d" : "#b78842" }}>
            ● {online ? "Connected" : "Offline mode"}
          </Text>
          <Pressable onPress={() => setScreen("Queue")}>
            <Text style={s.queueLink}>
              {queue.length} pending {queue.length === 1 ? "draft" : "drafts"}
            </Text>
          </Pressable>
        </View>
        <Animated.View style={{ flex: 1, opacity }}>
          <ScrollView
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={busy}
                onRefresh={async () => {
                  setBusy(true);
                  await refresh();
                  setBusy(false);
                }}
                tintColor="#14725d"
              />
            }
          >
            {notice ? (
              <View style={s.notice}>
                <Text style={s.noticeText}>{notice}</Text>
              </View>
            ) : null}
            {screen === "Overview" ? (
              <>
                <Text style={s.eyebrow}>
                  {pretty(session.user.role).toUpperCase()}
                </Text>
                <Text style={s.title}>Your field overview</Text>
                <Text style={s.subtitle}>
                  Hello, {session.user.name.split(" ")[0]}. Here is the work
                  around your mines.
                </Text>
                {data.dashboard?.demo_data && (
                  <View style={s.demo}>
                    <Text style={s.demoText}>
                      DEMO · Fictional observations and locations
                    </Text>
                  </View>
                )}
                <View style={s.stats}>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>Open observations</Text>
                    <Text style={s.statValue}>
                      {data.dashboard?.open_cases ?? "—"}
                    </Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={s.statLabel}>High risk</Text>
                    <Text style={[s.statValue, { color: "#c46e50" }]}>
                      {data.dashboard?.critical ?? "—"}
                    </Text>
                  </View>
                </View>
                {canReport && (
                  <Button
                    title="＋ Report a field observation"
                    onPress={() => setScreen("Report")}
                  />
                )}
                <Text style={s.sectionTitle}>Priority observations</Text>
                {data.cases
                  .filter((c) => c.status !== "closed")
                  .sort((a, b) => b.risk_score - a.risk_score)
                  .slice(0, 5)
                  .map((c) => (
                    <CaseCard
                      key={c.id}
                      c={c}
                      mineName={mineName}
                      onPress={() => setSelected(c)}
                    />
                  ))}
                {!data.cases.length && (
                  <Text style={s.muted}>No observations saved yet.</Text>
                )}
                <Text style={s.sectionTitle}>Your mines</Text>
                {data.mines.map((m) => (
                  <View key={m.id} style={s.card}>
                    <Text style={s.cardTitle}>{m.name}</Text>
                    <Text style={s.muted}>
                      {m.subsidiary} · {m.state}
                    </Text>
                  </View>
                ))}
              </>
            ) : screen === "Report" ? (
              canReport ? (
                <Report
                  session={session}
                  mines={data.mines}
                  inspection={inspection}
                  onSaved={async () => {
                    setInspection(null);
                    setQueue(await pending(ownerKey(session)));
                    setScreen("Queue");
                    setNotice(
                      "Saved on this device. Use Sync drafts to send the observation and its evidence.",
                    );
                  }}
                />
              ) : (
                <Text style={s.muted}>
                  This role has read access. Use the web dashboard for
                  oversight.
                </Text>
              )
            ) : screen === "Cases" ? (
              <>
                <Text style={s.title}>Observations & actions</Text>
                <Text style={s.subtitle}>
                  Open a case to review it or submit corrective work.
                </Text>
                {data.cases.map((c) => (
                  <CaseCard
                    key={c.id}
                    c={c}
                    mineName={mineName}
                    onPress={() => setSelected(c)}
                  />
                ))}
              </>
            ) : screen === "Inspections" ? (
              <>
                <Text style={s.title}>Field inspections</Text>
                <Text style={s.subtitle}>
                  View the last saved inspection schedule.
                </Text>
                {data.inspections.map((i) => (
                  <View style={s.card} key={i.id}>
                    <Badge value={i.status} />
                    <Text style={[s.cardTitle, { marginTop: 12 }]}>
                      {i.title}
                    </Text>
                    <Text style={s.muted}>
                      {mineName(i.mine_id)} · {date(i.scheduled_at)}
                    </Text>
                    {i.checklist.map((c: any, k: number) => (
                      <Text style={s.checkItem} key={k}>
                        {c.result === "pass" ? "✓" : "○"} {c.label} ({c.result})
                      </Text>
                    ))}
                    {canReport && (
                      <Button
                        secondary
                        title="Report a finding"
                        onPress={() => {
                          setInspection(i);
                          setScreen("Report");
                        }}
                      />
                    )}
                    {i.officer_id === session.user.id &&
                      i.status !== "completed" && (
                        <Button
                          secondary
                          title="Complete checklist"
                          onPress={() =>
                            setSelected({ ...i, isInspection: true })
                          }
                        />
                      )}
                  </View>
                ))}
                {!data.inspections.length && (
                  <Text style={s.muted}>
                    No inspections assigned to your accessible mines.
                  </Text>
                )}
              </>
            ) : screen === "Production" || screen === "Grievances" ? (
              <FieldOperations
                key={screen}
                kind={screen === "Production" ? "production" : "grievances"}
                session={session}
                mines={data.mines}
                rows={
                  screen === "Production" ? data.production : data.grievances
                }
                online={online}
                onQueued={async () => {
                  setQueue(await pending(ownerKey(session)));
                  setScreen("Queue");
                  setNotice(
                    "Saved on this device. Use Sync drafts when connected.",
                  );
                }}
              />
            ) : (
              <>
                <Text style={s.title}>Offline queue</Text>
                <Text style={s.subtitle}>
                  Drafts remain here until both the record and evidence are
                  confirmed.
                </Text>
                <Button
                  title={busy ? "Synchronizing…" : "Sync drafts"}
                  disabled={busy || !online}
                  onPress={sync}
                />
                {queue.length ? (
                  queue.map((row) => (
                    <QueueCard
                      key={row.id}
                      row={row}
                      session={session}
                      onChanged={async () =>
                        setQueue(await pending(ownerKey(session)))
                      }
                    />
                  ))
                ) : (
                  <View style={s.card}>
                    <Text style={s.cardTitle}>All caught up</Text>
                    <Text style={s.muted}>
                      No unsynchronized work on this device.
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </Animated.View>
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={s.nav}
          >
            {[
              "Overview",
              ...(canReport ? ["Report"] : []),
              "Cases",
              ...(session.user.role !== "contractor" ? ["Inspections"] : []),
              ...(session.user.role !== "contractor" ? ["Production"] : []),
              ...(canReport ? ["Grievances"] : []),
              "Queue",
            ].map((x) => (
              <Pressable
                key={x}
                accessibilityRole="tab"
                accessibilityState={{ selected: screen === x }}
                onPress={() => setScreen(x)}
                style={[s.navItem, screen === x && s.navSelected]}
              >
                <Text style={[s.navText, screen === x && s.navTextSelected]}>
                  {x}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {selected && (
          <Modal animationType="slide" onRequestClose={() => setSelected(null)}>
            <SafeAreaView style={s.root}>
              <View style={s.header}>
                <Text style={s.brand}>
                  {selected.isInspection ? "Inspection" : "Observation"}
                </Text>
                <Button
                  secondary
                  title="Close"
                  onPress={() => setSelected(null)}
                />
              </View>
              {selected.isInspection ? (
                <InspectionEditor
                  session={session}
                  record={selected}
                  onDone={async () => {
                    setSelected(null);
                    setScreen("Queue");
                    await refresh();
                  }}
                />
              ) : (
                <CaseView
                  session={session}
                  record={selected}
                  online={online}
                  onQueued={async () => {
                    setSelected(null);
                    setQueue(await pending(ownerKey(session)));
                    setScreen("Queue");
                  }}
                />
              )}
            </SafeAreaView>
          </Modal>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Login({ onLogin }: any) {
  const [base, setBase] = useState(
    process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.10:8000",
  );
  const [email, setEmail] = useState("officer@coalgov.demo");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <ScrollView
      contentContainerStyle={s.login}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.brand}>CoalGov AI</Text>
      <Text style={[s.title, { marginTop: 45 }]}>
        Governance, in the field.
      </Text>
      <Text style={s.subtitle}>
        Capture observations and evidence. Stay productive when connectivity
        drops.
      </Text>
      <Input
        label="Server address"
        value={base}
        onChangeText={setBase}
        autoCapitalize="none"
        keyboardType="url"
      />
      <Input
        label="Email address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button
        title={busy ? "Signing in…" : "Sign in"}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            const url = base.trim().replace(/\/$/, "");
            if (!/^https?:\/\//.test(url))
              throw new Error("Enter a full HTTP or HTTPS server address.");
            const result = await request(
              { base: url, token: "", user: null },
              "/auth/login",
              "POST",
              { email, password },
            );
            await onLogin({
              base: url,
              token: result.access_token,
              user: result.user,
            });
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Text style={s.muted}>
        For local testing, use your computer’s LAN address. Your phone and
        computer must share the same network.
      </Text>
    </ScrollView>
  );
}

function CaseCard({ c, mineName, onPress }: any) {
  return (
    <Pressable style={s.card} onPress={onPress} accessibilityRole="button">
      <View style={s.row}>
        <Badge value={c.status} />
        <Text
          style={[
            s.risk,
            { color: c.risk_score >= 70 ? "#c46e50" : "#708c4d" },
          ]}
        >
          {c.risk_score}/100
        </Text>
      </View>
      <Text style={[s.cardTitle, { marginTop: 12 }]}>{c.title}</Text>
      <Text style={s.muted}>
        {mineName(c.mine_id)} · {c.category}
      </Text>
      <Text style={s.cardFooter}>Due {date(c.due_at)} →</Text>
    </Pressable>
  );
}

async function takePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted)
    throw new Error("Camera permission is needed to attach a photo.");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.65,
    allowsEditing: true,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return null;
  const dir = FileSystem.documentDirectory + "evidence/";
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const destination = dir + Crypto.randomUUID() + ".jpg";
  await FileSystem.copyAsync({ from: result.assets[0].uri, to: destination });
  return destination;
}

function Report({ session, mines, inspection, onSaved }: any) {
  const [mine, setMine] = useState(inspection?.mine_id || mines[0]?.id || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Ventilation");
  const [kind, setKind] = useState("observation");
  const [severity, setSeverity] = useState(3);
  const [likelihood, setLikelihood] = useState(3);
  const [coords, setCoords] = useState<any>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <Text style={s.title}>Report observation</Text>
      <Text style={s.subtitle}>
        {inspection
          ? "Finding from: " + inspection.title
          : "Capture the condition now. Sync it when the network returns."}
      </Text>
      <Text style={s.fieldLabel}>Mine</Text>
      <View style={s.chips}>
        {mines.map((m: any) => (
          <Chip
            key={m.id}
            title={m.name}
            selected={mine === m.id}
            onPress={() => setMine(m.id)}
          />
        ))}
      </View>
      <Input
        label="Observation title"
        value={title}
        onChangeText={setTitle}
        maxLength={220}
      />
      <Input
        label="Describe what you observed"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={10000}
      />
      <Text style={s.fieldLabel}>Category</Text>
      <View style={s.chips}>
        {categories.map((c) => (
          <Chip
            key={c}
            title={c}
            selected={c === category}
            onPress={() => setCategory(c)}
          />
        ))}
      </View>
      <Text style={s.fieldLabel}>Record type</Text>
      <View style={s.chips}>
        {["observation", "violation", "incident"].map((c) => (
          <Chip
            key={c}
            title={pretty(c)}
            selected={c === kind}
            onPress={() => setKind(c)}
          />
        ))}
      </View>
      <Text style={s.fieldLabel}>Severity · 1 low, 5 severe</Text>
      <View style={s.chips}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Chip
            key={n}
            title={String(n)}
            selected={n === severity}
            onPress={() => setSeverity(n)}
          />
        ))}
      </View>
      <Text style={s.fieldLabel}>Likelihood · 1 unlikely, 5 likely</Text>
      <View style={s.chips}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Chip
            key={n}
            title={String(n)}
            selected={n === likelihood}
            onPress={() => setLikelihood(n)}
          />
        ))}
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>Location & evidence</Text>
        <Text style={s.muted}>
          {coords
            ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
            : "Location has not been captured."}
        </Text>
        <Button
          secondary
          title="Capture GPS location"
          onPress={async () => {
            try {
              const p = await Location.requestForegroundPermissionsAsync();
              if (!p.granted)
                throw new Error("Location permission was declined.");
              const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
              });
              setCoords(pos.coords);
            } catch (e: any) {
              setError(e.message);
            }
          }}
        />
        <Button
          secondary
          title={photo ? "Retake evidence photo" : "Take evidence photo"}
          onPress={async () => {
            try {
              const uri = await takePhoto();
              if (uri) {
                if (photo)
                  await FileSystem.deleteAsync(photo, { idempotent: true });
                setPhoto(uri);
              }
            } catch (e: any) {
              setError(e.message);
            }
          }}
        />
        {photo && (
          <Image
            source={{ uri: photo }}
            style={s.photo}
            accessibilityLabel="Captured field evidence"
          />
        )}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button
        disabled={busy}
        title={busy ? "Saving…" : "Save draft on this device"}
        onPress={async () => {
          if (
            !mine ||
            title.trim().length < 5 ||
            description.trim().length < 10
          ) {
            setError(
              "Choose a mine and enter a title of 5+ characters and a description of 10+ characters.",
            );
            return;
          }
          setBusy(true);
          try {
            const id = Crypto.randomUUID();
            await enqueue(
              ownerKey(session),
              {
                operation: {
                  operation_id: id,
                  kind: "create_case",
                  payload: {
                    mine_id: mine,
                    title,
                    description,
                    category,
                    kind,
                    severity,
                    likelihood,
                    latitude: coords?.latitude ?? null,
                    longitude: coords?.longitude ?? null,
                    captured_at: new Date().toISOString(),
                    ...(inspection ? { inspection_id: inspection.id } : {}),
                  },
                },
                photoUri: photo,
                mineId: mine,
                purpose: "observation",
              },
              id,
            );
            await onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function CaseView({ session, record, online, onQueued }: any) {
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const assigned =
    record.assigned_to === session.user.id &&
    ["assigned", "in_progress"].includes(record.status);
  return (
    <ScrollView contentContainerStyle={s.body}>
      <Badge value={record.status} />
      <Text style={s.title}>{record.title}</Text>
      <Text style={s.subtitle}>{record.description}</Text>
      <Text style={s.sectionTitle}>Risk score: {record.risk_score}/100</Text>
      {record.risk_reasons.map((r: any) => (
        <View style={s.card} key={r.factor}>
          <View style={s.row}>
            <Text style={s.cardTitle}>{r.factor}</Text>
            <Text style={s.risk}>+{r.points}</Text>
          </View>
          <Text style={s.muted}>{r.detail}</Text>
        </View>
      ))}
      {record.action_text ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>Corrective action</Text>
          <Text style={s.muted}>{record.action_text}</Text>
        </View>
      ) : null}
      {assigned && (
        <>
          <Text style={s.sectionTitle}>Record corrective work</Text>
          <Text style={s.muted}>
            Capture a photo and describe the work. Evidence uploads before the
            action is submitted when you synchronize.
          </Text>
          <Button
            title={
              photo
                ? "Retake corrective evidence photo"
                : "Take corrective evidence photo"
            }
            secondary
            disabled={busy}
            onPress={async () => {
              try {
                const uri = await takePhoto();
                if (uri) {
                  if (photo)
                    await FileSystem.deleteAsync(photo, { idempotent: true });
                  setPhoto(uri);
                }
              } catch (e: any) {
                setError(e.message);
              }
            }}
          />
          {photo && <Image source={{ uri: photo }} style={s.photo} />}
          <Input
            label="Corrective work completed"
            value={note}
            onChangeText={setNote}
            multiline
          />
          <Button
            disabled={busy}
            title="Queue corrective action"
            onPress={async () => {
              if (note.trim().length < 10) {
                setError(
                  "Describe the corrective work in at least 10 characters.",
                );
                return;
              }
              try {
                const id = Crypto.randomUUID();
                await enqueue(
                  ownerKey(session),
                  {
                    operation: {
                      operation_id: id,
                      kind: "transition_case",
                      entity_id: record.id,
                      payload: {
                        action: "submit_action",
                        version: record.version,
                        note,
                      },
                    },
                    mineId: record.mine_id,
                    photoUri: photo,
                    purpose: "corrective_action",
                  },
                  id,
                );
                await onQueued();
              } catch (e: any) {
                setError(e.message);
              }
            }}
          />
        </>
      )}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Text style={s.muted}>
        Assignment, independent verification, and final closure are available in
        the web dashboard.
      </Text>
    </ScrollView>
  );
}

function QueueCard({ row, session, onChanged }: any) {
  const body = JSON.parse(row.body);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<any>(null);
  return (
    <View style={s.card}>
      <Badge value={row.state} />
      <Text style={[s.cardTitle, { marginTop: 10 }]}>
        {body.operation.payload.title ||
          (body.operation.kind.includes("production")
            ? `Production ${body.operation.payload.work_date} · Shift ${body.operation.payload.shift}`
            : body.operation.kind === "transition_grievance"
              ? "Grievance " + body.operation.payload.action
              : null) ||
          (body.operation.kind === "update_inspection"
            ? "Inspection checklist"
            : "Corrective action")}
      </Text>
      <Text style={s.muted}>
        {date(row.created_at)}
        {body.photoUri ? " · Photo attached" : ""}
      </Text>
      {row.error ? <Text style={s.error}>{row.error}</Text> : null}
      {body.operation.kind === "create_production" && (
        <Text style={s.muted}>
          Mine: {body.operation.payload.mine_id}
          {"\n"}Coal: {body.operation.payload.coal_tonnes} t · Dispatch:{" "}
          {body.operation.payload.dispatch_tonnes} t · Target:{" "}
          {body.operation.payload.target_tonnes} t{"\n"}Downtime:{" "}
          {body.operation.payload.downtime_minutes} min{"\n"}
          {body.operation.payload.notes}
        </Text>
      )}
      {body.operation.kind === "create_grievance" && (
        <Text style={s.muted}>
          {body.operation.payload.category} · {body.operation.payload.priority}
          {"\n"}
          {body.operation.payload.description}
        </Text>
      )}
      {["error", "conflict"].includes(row.state) && (
        <Button
          secondary
          disabled={busy}
          title="Review before retrying"
          onPress={async () => {
            setBusy(true);
            try {
              if (body.operation.kind === "transition_case") {
                const current = await request(
                  session,
                  "/cases/" + body.operation.entity_id,
                );
                setReview(current);
              } else if (body.operation.kind === "update_inspection") {
                const records = await request(session, "/inspections");
                const current = records.find(
                  (x: any) => x.id === body.operation.entity_id,
                );
                if (!current) throw new Error("Inspection is not accessible.");
                setReview(current);
              } else if (
                ["update_production", "transition_grievance"].includes(
                  body.operation.kind,
                )
              ) {
                const path =
                  body.operation.kind === "update_production"
                    ? "/production/"
                    : "/grievances/";
                setReview(
                  await request(session, path + body.operation.entity_id),
                );
              } else {
                Alert.alert(
                  "Retained draft",
                  "This draft was rejected by validation. Create a corrected report; this original remains here for reference.",
                );
              }
            } catch (e: any) {
              Alert.alert("Cannot load latest record", e.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}{" "}
      {review && (
        <View style={s.notice}>
          <Text style={s.cardTitle}>
            Server: {pretty(review.status)}, version {review.version}
          </Text>
          {body.operation.kind === "update_production" && (
            <Text style={s.muted}>
              Server figures: {review.coal_tonnes} t coal,{" "}
              {review.dispatch_tonnes} t dispatched, {review.target_tonnes} t
              target, {review.downtime_minutes} min downtime.{"\n"}Your figures:{" "}
              {body.operation.payload.coal_tonnes} t coal,{" "}
              {body.operation.payload.dispatch_tonnes} t dispatched,{" "}
              {body.operation.payload.target_tonnes} t target,{" "}
              {body.operation.payload.downtime_minutes} min downtime.
            </Text>
          )}
          {review.resolution && (
            <Text style={s.muted}>Server resolution: {review.resolution}</Text>
          )}
          <Text style={s.muted}>
            Your note:{" "}
            {body.operation.payload.note || body.operation.payload.notes}
          </Text>
          <Text style={s.muted}>
            Retry only after checking that your note is still correct.
          </Text>
          <Button
            title="Use reviewed server version"
            onPress={async () => {
              const id = Crypto.randomUUID();
              await enqueue(
                ownerKey(session),
                {
                  ...body,
                  serverId: undefined,
                  operation: {
                    ...body.operation,
                    operation_id: id,
                    payload: {
                      ...body.operation.payload,
                      version: review.version,
                    },
                  },
                },
                id,
              );
              await removePending(row.id, ownerKey(session));
              await onChanged();
            }}
          />
        </View>
      )}
      {["error", "conflict"].includes(row.state) &&
        [
          "create_production",
          "update_production",
          "create_grievance",
          "transition_grievance",
        ].includes(body.operation.kind) && (
          <Button
            secondary
            title="Discard this rejected draft"
            onPress={() =>
              Alert.alert(
                "Discard draft?",
                "This permanently removes this unsynchronized operation from this device. Review or recreate it first if needed.",
                [
                  { text: "Keep draft", style: "cancel" },
                  {
                    text: "Discard",
                    style: "destructive",
                    onPress: async () => {
                      await removePending(row.id, ownerKey(session));
                      await onChanged();
                    },
                  },
                ],
              )
            }
          />
        )}
    </View>
  );
}

function InspectionEditor({ session, record, onDone }: any) {
  const [items, setItems] = useState(record.checklist);
  const [notes, setNotes] = useState(record.notes || "");
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView contentContainerStyle={s.body}>
      <Text style={s.title}>{record.title}</Text>
      {items.map((item: any, i: number) => (
        <View style={s.card} key={i}>
          <Text style={s.cardTitle}>{item.label}</Text>
          <View style={s.chips}>
            {["pending", "pass", "fail", "na"].map((r) => (
              <Chip
                key={r}
                title={r}
                selected={r === item.result}
                onPress={() =>
                  setItems(
                    items.map((x: any, j: number) =>
                      i === j ? { ...x, result: r } : x,
                    ),
                  )
                }
              />
            ))}
          </View>
        </View>
      ))}
      <Input
        label="Inspection notes"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      <Button
        disabled={busy}
        title="Save checklist to offline queue"
        onPress={async () => {
          setBusy(true);
          try {
            if (items.some((x: any) => x.result === "pending"))
              throw new Error("Complete every checklist item first.");
            const id = Crypto.randomUUID();
            await enqueue(
              ownerKey(session),
              {
                operation: {
                  operation_id: id,
                  kind: "update_inspection",
                  entity_id: record.id,
                  payload: {
                    version: record.version,
                    status: "completed",
                    checklist: items,
                    notes,
                  },
                },
                mineId: record.mine_id,
              },
              id,
            );
            await onDone();
          } catch (e: any) {
            Alert.alert("Could not save inspection", e.message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Text style={s.muted}>
        The checklist stays on this device until synchronization confirms it.
        Changes on another device produce a conflict for review.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f7f4" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e9df",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    fontSize: 24,
    fontWeight: "800",
    color: "#153a30",
    letterSpacing: -0.8,
  },
  headerSub: {
    fontSize: 10,
    letterSpacing: 1.8,
    color: "#869c84",
    marginTop: 3,
  },
  logout: { fontSize: 14, color: "#6d8b6a" },
  connection: {
    paddingVertical: 11,
    paddingHorizontal: 22,
    backgroundColor: "#eef5e9",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  queueLink: { fontSize: 13, color: "#7e9859" },
  body: { padding: 22, paddingBottom: 38, gap: 15 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "#869e77",
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    color: "#193e32",
    letterSpacing: -0.6,
    marginTop: 4,
  },
  subtitle: { fontSize: 15, lineHeight: 23, color: "#7b9371", marginBottom: 6 },
  muted: { fontSize: 14, lineHeight: 22, color: "#748e6a" },
  stats: { flexDirection: "row", gap: 13 },
  stat: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2ebdc",
    borderRadius: 12,
  },
  statLabel: { fontSize: 13, color: "#829976" },
  statValue: {
    fontSize: 35,
    fontWeight: "700",
    color: "#256b50",
    marginTop: 13,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#325934",
    marginTop: 17,
  },
  button: {
    backgroundColor: "#127460",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    marginVertical: 4,
  },
  buttonText: { fontSize: 15, color: "#fff", fontWeight: "600" },
  secondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9e7cc",
  },
  secondaryText: { color: "#6b8d4f" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#e0ead8",
    padding: 18,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600",
    color: "#3d643b",
  },
  cardFooter: { fontSize: 12, color: "#97ad7d", marginTop: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    backgroundColor: "#edf4e7",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    color: "#7b9b5e",
    textTransform: "capitalize",
    fontWeight: "600",
  },
  risk: { fontSize: 14, fontWeight: "700", color: "#779d54" },
  field: { gap: 8, marginVertical: 6 },
  fieldLabel: { fontSize: 14, color: "#6d8a59", fontWeight: "600" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dce7d3",
    borderRadius: 7,
    paddingHorizontal: 13,
    paddingVertical: 13,
    color: "#395f30",
    fontSize: 16,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 5,
    marginBottom: 8,
  },
  chip: {
    backgroundColor: "#f8fbf3",
    borderWidth: 1,
    borderColor: "#dfeacf",
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 7,
  },
  chipSelected: { backgroundColor: "#dfeecd", borderColor: "#afd098" },
  chipText: { fontSize: 13, color: "#89a16e" },
  photo: { width: "100%", height: 220, borderRadius: 8, marginVertical: 9 },
  nav: {
    flexGrow: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#dfe8d4",
    flexDirection: "row",
    gap: 3,
  },
  navItem: {
    minWidth: 82,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 7,
  },
  navSelected: { backgroundColor: "#e7f0da" },
  navText: { fontSize: 11, color: "#9fb184" },
  navTextSelected: { color: "#618c44", fontWeight: "700" },
  notice: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#deebcc",
    backgroundColor: "#f1f7e7",
    borderRadius: 8,
    gap: 8,
  },
  noticeText: { fontSize: 13, lineHeight: 20, color: "#7f9a5d" },
  error: { fontSize: 13, lineHeight: 21, color: "#b16e47", marginVertical: 7 },
  login: { flexGrow: 1, padding: 28, paddingTop: 50, gap: 18 },
  demo: { backgroundColor: "#eef4e4", padding: 11, borderRadius: 6 },
  demoText: { fontSize: 11, color: "#8ba06c", fontWeight: "600" },
  checkItem: { fontSize: 14, lineHeight: 23, color: "#829f64" },
});
