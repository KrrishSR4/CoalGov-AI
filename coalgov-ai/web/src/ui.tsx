import { createContext, useContext, useEffect, useRef, useState } from "react";
import { X, LoaderCircle, Search, Inbox, ArrowUpRight } from "lucide-react";
import { api, label } from "./api";
export const Context = createContext<any>(null);
export const useApp = () => useContext(Context);
export function useResource(path: string, initial: any = []) {
  const { revision } = useApp();
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    api(path)
      .then((v) => {
        if (active) {
          setData(v);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, loading, error, setData };
}
export function Status({ value }: { value: string }) {
  return <span className={"badge " + value}>{label(value) || "unknown"}</span>;
}
export function Risk({ score }: { score: number }) {
  return (
    <span
      className={
        "risk " + (score >= 70 ? "high" : score >= 40 ? "medium" : "low")
      }
    >
      <i />
      {score}
      <span>/100</span>
    </span>
  );
}
export function Empty({ text = "No records yet", children }: any) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <strong>{text}</strong>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={20} /> Loading records…
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  const { refresh } = useApp();
  return message ? (
    <div role="alert" className="error-box">
      {message}
      <button onClick={refresh}>Retry</button>
    </div>
  ) : null;
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search records…",
}: any) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Modal({ title, children, onClose, wide = false }: any) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      d?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({ label: caption, children }: any) {
  return (
    <label className="field">
      <span>{caption}</span>
      {children}
    </label>
  );
}
export function FormDialog({
  title,
  fields,
  onSubmit,
  onClose,
  submit = "Save",
}: any) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.currentTarget));
          setBusy(true);
          try {
            await onSubmit(data);
            onClose();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {fields.map((f: any) => (
          <Field key={f.name} label={f.label}>
            {f.options ? (
              <select
                name={f.name}
                required={f.required !== false}
                defaultValue={f.value ?? ""}
              >
                <option value="">Select {f.label.toLowerCase()}</option>
                {f.options.map((o: any) => (
                  <option key={o.id ?? o} value={o.id ?? o}>
                    {o.name ?? label(o)}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.name}
                defaultValue={f.value ?? ""}
                required={f.required !== false}
                minLength={f.minLength || 3}
                maxLength={10000}
              />
            ) : (
              <input
                name={f.name}
                type={f.type || "text"}
                defaultValue={f.value ?? ""}
                required={f.required !== false}
                min={f.min}
                max={f.max}
                step={f.step}
                minLength={f.minLength}
                maxLength={f.maxLength || 250}
              />
            )}
          </Field>
        ))}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : submit}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PageTitle({
  eyebrow = "WORKSPACE",
  title,
  description,
  action,
}: any) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
