import { tr, locale, actionLabel } from "./localization";
import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  X,
  LoaderCircle,
  MapPin,
  BedDouble,
  Bath,
  Maximize2,
  Heart,
  House,
  Building2,
  LandPlot,
  SlidersHorizontal,
  Search,
  Check,
  UploadCloud,
  ImageOff,
  Plus,
  FileText,
  Phone,
  Mail,
} from "lucide-react";
import type { Property, AssignedAgent, ReviewEvent } from "./types";
import { money, statusLabel, date } from "./types";
import { useEstate } from "./context";
import { api, upload } from "./api";

export function Button({
  children,
  variant = "",
  className = "",
  busy = false,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  busy?: boolean;
}) {
  return (
    <button
      className={`btn ${variant} ${className}`}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy && <LoaderCircle className="spin" size={17} />} {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{tr(title)}</h2>
        <button
          className="icon-btn"
          aria-label={tr("Close dialog")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{tr(label)}</span>
      {children}
      {hint && <small>{tr(hint)}</small>}
    </label>
  );
}
export function Form({
  onSubmit,
  children,
  className = "",
}: {
  onSubmit: (form: HTMLFormElement) => Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(e.currentTarget);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={className} onSubmit={submit}>
      <fieldset disabled={busy}>{children}</fieldset>
      {error && (
        <p className="error" role="alert">
          {tr(error)}
        </p>
      )}
      {busy && (
        <p className="saving" role="status">
          <LoaderCircle className="spin" size={16} /> {tr("Saving your changes…")}</p>
      )}
    </form>
  );
}
export function Empty({
  icon = <House size={28} />,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{tr(title)}</h3>
      <p>{tr(description)}</p>
      {children}
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{statusLabel(status)}</span>;
}
export function Avatar({
  name,
  src,
  size = "",
}: {
  name: string;
  src?: string;
  size?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      className={`avatar ${size}`}
      src={src}
      alt={tr("{v0}'s profile", {v0: name})}
      onError={() => setFailed(true)}
    />
  ) : (
    <span className={`avatar ${size}`}>
      {name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function PropertyImage({
  src,
  alt,
  className = "",
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return !src || failed ? (
    <div className={`image-empty ${className}`}>
      <ImageOff size={32} />
      <span>{tr("Photo coming soon")}</span>
    </div>
  ) : (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
export function PropertyCard({
  p,
  compact = false,
}: {
  p: Property;
  compact?: boolean;
}) {
  const c = useEstate();
  const saved = c.workspace.favorites.includes(p.id);
  async function favorite() {
    if (!c.user) return c.signIn();
    try {
      await api("/favorites/" + p.id, saved ? "DELETE" : "POST");
      await c.refresh();
      c.notify(saved ? "Removed from saved properties" : "Property saved");
    } catch (e) {
      c.notify((e as Error).message);
    }
  }
  return (
    <article className={`property-card ${compact ? "compact" : ""}`}>
      <div className="property-visual">
        <button
          onClick={() => c.openProperty(p.id)}
          aria-label={tr("View {v0}", {v0: p.title})}
        >
          <PropertyImage
            src={p.images[0]}
            alt={p.is_demo ? tr("Illustrative stock photograph") : p.title}
          />
        </button>
        <span className="listing-type">
          {p.purpose === "sale" ? tr("For sale") : tr("For rent")}
        </span>
        {p.is_demo && <span className="demo-tag">{tr("Demo")}</span>}
        <button
          className={`save-button ${saved ? "saved" : ""}`}
          aria-label={saved ? tr("Unsave {v0}", {v0: p.title}) : tr("Save {v0}", {v0: p.title})}
          onClick={favorite}
        >
          <Heart size={17} fill={saved ? "currentColor" : "none"} />
        </button>
        {p.availability !== "available" && (
          <span className="availability-label">
            {statusLabel(p.availability)}
          </span>
        )}
      </div>
      <div className="property-body">
        <div className="property-price">
          {money(p.price)}
          {p.purpose === "rent" && <small>{tr("/ month")}</small>}
          <span>{tr(p.type)}</span>
        </div>
        <h3>
          <button onClick={() => c.openProperty(p.id)}>{p.title}</button>
        </h3>
        <p className="location">
          <MapPin size={14} />
          {p.locality}{tr(", Beawar")}</p>
        <div className="property-specs">
          {p.bedrooms > 0 && (
            <span>
              <BedDouble size={16} />
              {p.bedrooms} {tr("beds")}</span>
          )}
          {p.bathrooms > 0 && (
            <span>
              <Bath size={16} />
              {p.bathrooms} {tr("baths")}</span>
          )}
          <span>
            <Maximize2 size={15} />
            {p.area.toLocaleString(locale())} {tr("sq ft")}</span>
        </div>
        <div className="card-footer">
          <span>
            {p.is_demo
              ? tr("Illustrative listing")
              : p.agent_name || tr("Listed by owner")}
          </span>
          <button onClick={() => c.openProperty(p.id)}>{tr("View details")}</button>
        </div>
      </div>
    </article>
  );
}
export interface FiltersValue {
  q: string;
  type: string;
  purpose: string;
  locality: string;
  budget: string;
  sort: string;
  saved: boolean;
  availability: string;
}
export const initialFilters: FiltersValue = {
  q: "",
  type: "All types",
  purpose: "all",
  locality: "All areas",
  budget: "all",
  sort: "newest",
  saved: false,
  availability: "available",
};
export function useFiltered(
  properties: Property[],
  f: FiltersValue,
  favorites: string[],
) {
  return properties
    .filter(
      (p) =>
        (!f.q ||
          `${p.title} ${p.locality} ${p.address}`
            .toLowerCase()
            .includes(f.q.toLowerCase())) &&
        (f.type === "All types" || p.type === f.type) &&
        (f.purpose === "all" || p.purpose === f.purpose) &&
        (f.locality === "All areas" || p.locality === f.locality) &&
        (f.budget === "all" || p.price <= Number(f.budget)) &&
        (!f.saved || favorites.includes(p.id)) &&
        (f.availability === "all" || p.availability === f.availability),
    )
    .sort((a, b) =>
      f.sort === "price-low"
        ? a.price - b.price
        : f.sort === "price-high"
          ? b.price - a.price
          : f.sort === "area"
            ? b.area - a.area
            : b.created_at.localeCompare(a.created_at),
    );
}
export function Filters({
  value: f,
  onChange,
  areas,
}: {
  value: FiltersValue;
  onChange: (f: FiltersValue) => void;
  areas: string[];
}) {
  const [extra, setExtra] = useState(false);
  const update = (key: keyof FiltersValue, value: any) =>
    onChange({ ...f, [key]: value });
  return (
    <div className="filters-wrap">
      <div className="search-filter">
        <label className="search-input">
          <Search size={20} />
          <input
            placeholder={tr("Search a locality, address or property…")}
            aria-label={tr("Search properties")}
            value={f.q}
            onChange={(e) => update("q", e.target.value)}
          />
        </label>
        <label className="select-filter">
          <MapPin size={17} />
          <select
            aria-label={tr("Filter by locality")}
            value={f.locality}
            onChange={(e) => update("locality", e.target.value)}
          >
            <option>{tr("All areas")}</option>
            {areas.map((a) => (
              <option key={a} value={a}>{tr(a)}</option>
            ))}
          </select>
        </label>
        <label className="select-filter">
          <House size={17} />
          <select
            aria-label={tr("Filter by property type")}
            value={f.type}
            onChange={(e) => update("type", e.target.value)}
          >
            {["All types", "House", "Apartment", "Plot", "Commercial"].map(
              (a) => (
                <option key={a} value={a}>{tr(a)}</option>
              ),
            )}
          </select>
        </label>
        <Button
          variant={extra ? "dark" : "outline"}
          onClick={() => setExtra(!extra)}
          aria-expanded={extra}
        >
          <SlidersHorizontal size={17} />
          {tr("Filters")}</Button>
      </div>
      {extra && (
        <div className="extra-filters">
          <Field label={tr("Maximum asking price")}>
            <select
              value={f.budget}
              onChange={(e) => update("budget", e.target.value)}
            >
              <option value="all">{tr("Any price")}</option>
              {[15000, 30000, 3000000, 5000000, 10000000].map((n) => (
                <option key={n} value={n}>
                  {money(n)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tr("Availability")}>
            <select
              value={f.availability}
              onChange={(e) => update("availability", e.target.value)}
            >
              <option value="available">{tr("Available")}</option>
              <option value="all">{tr("All listings")}</option>
              <option value="sold">{tr("Sold")}</option>
              <option value="rented">{tr("Rented")}</option>
            </select>
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={f.saved}
              onChange={(e) => update("saved", e.target.checked)}
            />
            {tr("Saved properties only")}</label>
          <Button variant="ghost" onClick={() => onChange(initialFilters)}>
            {tr("Reset filters")}</Button>
        </div>
      )}
    </div>
  );
}
export interface Uploaded {
  id: string;
  name: string;
  url?: string;
}
export function FileUpload({
  kind,
  files,
  onChange,
  label,
  multiple = true,
}: {
  kind: string;
  files: Uploaded[];
  onChange: (v: Uploaded[]) => void;
  label: string;
  multiple?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="file-upload">
      <label className="upload-zone">
        <UploadCloud size={24} />
        <strong>{busy ? tr("Uploading…") : label}</strong>
        <span>
          {kind === "document" ? tr("PDF, JPG, PNG or WebP") : tr("JPG, PNG or WebP")} {tr("· up to 6 MB each")}</span>
        <input
          disabled={busy}
          type="file"
          accept={
            kind === "document"
              ? ".pdf,.jpg,.jpeg,.png,.webp"
              : ".jpg,.jpeg,.png,.webp"
          }
          multiple={multiple}
          onChange={async (e) => {
            const chosen = Array.from(e.target.files || []);
            if (!chosen.length) return;
            setBusy(true);
            setError("");
            let next = multiple ? [...files] : [];
            try {
              if (next.length + chosen.length > 10)
                throw new Error("Choose up to 10 files.");
              for (const f of chosen) {
                next = [...next, await upload(f, kind)];
                onChange(next);
              }
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="uploaded-files">
          {files.map((f) => (
            <li key={f.id}>
              <FileText size={15} />
              <span>{f.name}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                aria-label={tr("Remove {v0}", {v0: f.name})}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {tr(error)}
        </p>
      )}
    </div>
  );
}
export const dataForm = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form).entries()) as Record<string, string>;

export function AssignedAgentCard({ agent }: { agent?: AssignedAgent | null }) {
  return <section className="assigned-agent">
    <span className="eyebrow">{tr("Your assigned agent")}</span>
    {agent ? <><div className="assigned-agent-person"><Avatar name={agent.name} src={agent.avatar} /><strong>{agent.name}</strong></div>
    <div className="assigned-agent-contact">
      {agent.mobile && <a href={"tel:" + agent.mobile.replace(/[^+0-9]/g, "")}><Phone size={15} />{agent.mobile}</a>}
      {agent.email && <a href={"mailto:" + agent.email}><Mail size={15} />{agent.email}</a>}
    </div></> : <p className="muted">{tr("An agent has not been assigned yet.")}</p>}
  </section>;
}
export function SubmissionHistory({ events = [] }: { events?: ReviewEvent[] }) {
  if (!events.length) return null;
  return <details className="submission-history"><summary>{tr("Private review history")}</summary>
    <p className="muted">{tr("Visible only in your submissions. Reviewer names are not shown on public property listings.")}</p>
    <ol>{events.map((event, i) => <li key={event.created_at + i}>
      <div><Badge status={event.action.split(".")[1]} /><time>{date(event.created_at)}</time></div>
      <p><strong>{event.actor}</strong>{event.details && <> · {event.details}</>}</p>
    </li>)}</ol>
  </details>;
}
