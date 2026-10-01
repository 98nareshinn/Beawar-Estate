import { LocationPicker, PropertyLocation, hasCoordinates, type Coordinates } from "./maps";
import { tr, locale, actionLabel } from "./localization";
import { PHONE_PATTERN } from "./validation";
import { useEffect, useRef, useState } from "react";
import {
  House,
  LockKeyhole,
  Check,
  Mail,
  ShieldCheck,
  Plus,
  MapPin,
  Heart,
  CalendarDays,
  FileText,
  Download,
  CheckCircle2,
  UserRound,
} from "lucide-react";
import { useEstate } from "./context";
import { api } from "./api";
import {
  money,
  date,
  roleLabel,
  statusLabel,
  type Property,
  type Service,
  type User,
  type Agent,
  type Role,
} from "./types";
import {
  Modal,
  Button,
  AssignedAgentCard,
  Field,
  Form,
  FileUpload,
  dataForm,
  PropertyImage,
  Badge,
  Avatar,
  type Uploaded,
} from "./ui";

export function AuthModal({ onClose }: { onClose: () => void }) {
  const c = useEstate(),
    [mode, setMode] = useState<"login" | "register">("login"),
    [googleError, setGoogleError] = useState("");
  const googleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!c.data.googleClientId) return;
    let disposed = false;
    function init() {
      const g = (window as any).google;
      if (!g || disposed) return;
      g.accounts.id.initialize({
        client_id: c.data.googleClientId,
        callback: async (response: { credential: string }) => {
          try {
            const r = await api("/auth/google", "POST", {
              credential: response.credential,
            });
            c.setUser(r.user);
            await c.refresh();
            onClose();
            c.notify(tr("Welcome back, {name}", {name:r.user.name}));
          } catch (e) {
            setGoogleError((e as Error).message);
          }
        },
      });
      if (googleRef.current)
        g.accounts.id.renderButton(googleRef.current, {
          theme: "outline",
          size: "large",
          width: 320,
          text: "continue_with",
        });
    }
    const existing = document.getElementById("google-identity");
    if (existing) init();
    else {
      const s = document.createElement("script");
      s.id = "google-identity";
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = init;
      s.onerror = () =>
        setGoogleError("Google could not load. Please sign in with email.");
      document.head.appendChild(s);
    }
    return () => {
      disposed = true;
    };
  }, [c.data.googleClientId]);
  return (
    <Modal
      title={
        mode === "login"
          ? tr("Welcome to your next chapter")
          : tr("Make yourself at home")
      }
      onClose={onClose}
    >
      <div className="auth-intro">
        <span className="brand-mark large">
          <House size={27} />
        </span>
        <h3>
          {mode === "login"
            ? tr("Good to have you here.")
            : tr("Your property journey starts here.")}
        </h3>
        <p>
          {mode === "login"
            ? tr("Sign in to manage submissions and saved properties.")
            : tr("Create a member account to submit and save properties.")}
        </p>
      </div>
      <div className="segmented auth-switch">
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
        >
          {tr("Sign in")}</button>
        <button
          className={mode === "register" ? "active" : ""}
          onClick={() => setMode("register")}
        >
          {tr("Create account")}</button>
      </div>
      <Form
        key={mode}
        onSubmit={async (form) => {
          const d = dataForm(form);
          const r = await api("/auth/" + mode, "POST", d);
          c.setUser(r.user);
          await c.refresh();
          onClose();
          c.notify(tr("Welcome, {name}", {name:r.user.name}));
        }}
      >
        {mode === "register" && (
          <Field label={tr("Full name")}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              placeholder={tr("Your full name")}
            />
          </Field>
        )}
        <Field label={tr("Email address")}>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder={tr("you@example.com")}
          />
        </Field>
        {mode === "register" && (
          <Field label={tr("Mobile number")}>
            <input
              type="tel"
              name="mobile"
              required
              autoComplete="tel"
              placeholder="+91"
              pattern={PHONE_PATTERN}
                maxLength={20}
            />
          </Field>
        )}
        <Field
          label={tr("Password")}
          hint={
            mode === "register"
              ? tr("Use at least 12 characters.")
              : tr("Team accounts are created by your head admin.")
          }
        >
          <input
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 12 : 1}
            maxLength={128}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />
        </Field>
        <Button type="submit" className="full">
          {mode === "login" ? tr("Sign in") : tr("Create account")}
        </Button>
      </Form>
      {c.data.googleClientId && (
        <>
          <div className="divider-label">{tr("or")}</div>
          <div className="google-login" ref={googleRef} />
          {googleError && <p className="error">{tr(googleError)}</p>}
        </>
      )}
      <p className="secure-note">
        <LockKeyhole size={14} />
        {tr("Your documents stay private.")}</p>
    </Modal>
  );
}

export function PropertyForm({
  onClose,
  existing,
}: {
  onClose: () => void;
  existing?: Property;
}) {
  const c = useEstate();
  const [photos, setPhotos] = useState<Uploaded[]>(
      existing?.images
        .filter((p) => p.startsWith("/api/files/"))
        .map((url) => ({
          id: url.split("/").pop()!,
          name: "Property photo",
          url,
        })) || [],
    ),
    [docs, setDocs] = useState<Uploaded[]>(existing?.documents || []);
  const [purpose, setPurpose] = useState(existing?.purpose || "sale");
  const [location,setLocation] = useState<Coordinates|null>(existing && hasCoordinates(existing) ? {latitude:existing.latitude,longitude:existing.longitude}:null);
  return (
    <Modal
      title={existing ? tr("Edit property") : tr("List a property")}
      onClose={onClose}
      wide
    >
      <p className="muted">
        {tr("Add the details once. Your team will review them before the listing goes public.")}</p>
      <Form
        onSubmit={async (form) => {
          const d = dataForm(form);
          await api(
            "/properties" + (existing ? "/" + existing.id : ""),
            existing ? "PATCH" : "POST",
            {
              title: d.title,
              description: d.description,
              type: d.type,
              placeType:d.placeType, latitude:location?.latitude,longitude:location?.longitude,
              purpose: d.purpose,
              price: Number(d.price),
              area: Number(d.area),
              locality: d.locality,
              address: d.address,
              bedrooms: Number(d.bedrooms),
              bathrooms: Number(d.bathrooms),
              amenities: (d.amenities || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              photoIds: photos.map((f) => f.id),
              documentIds: docs.map((f) => f.id),
              agentId: d.agentId || null,
              status: d.submitMode,
            },
          );
          await c.refresh();
          onClose();
          c.navigate("submissions");
          c.notify(
            d.submitMode === "draft"
              ? "Draft saved"
              : "Property sent for review",
          );
        }}
      >
        <div className="form-section-title">
          <span>01</span>
          <h3>{tr("The essentials")}</h3>
        </div>
        <Field label={tr("Property title")}>
          <input
            name="title"
            defaultValue={existing?.title}
            required
            minLength={5}
            maxLength={120}
            placeholder={tr("e.g. Spacious 3 BHK home on Ajmer Road")}
          />
        </Field>
        <div className="form-grid">
          <Field label={tr("Property type")}>
            <select name="type" defaultValue={existing?.type || "House"}>
              {["House", "Apartment", "Plot", "Commercial"].map((t) => (
                <option key={t} value={t}>{tr(t)}</option>
              ))}
            </select>
          </Field>
          <Field label={tr("Type of place")}><select name="placeType" defaultValue={existing?.place_type||"Single family home"}>{["Single family home","Townhouse","Apartment","Bungalow","Villa","Plot","Commercial space","Other"].map(t=><option key={t} value={t}>{tr(t)}</option>)}</select></Field>
          <Field label={tr("Listing for")}>
            <select
              name="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as "sale" | "rent")}
            >
              <option value="sale">{tr("Sale")}</option>
              <option value="rent">{tr("Rent")}</option>
            </select>
          </Field>
          <Field
            label={purpose === "rent" ? tr("Monthly rent (₹)") : tr("Asking price (₹)")}
          >
            <input
              name="price"
              type="number"
              min="1"
              max="1000000000000"
              step="any"
              required
              defaultValue={existing?.price}
              placeholder="8500000"
            />
          </Field>
          <Field label={tr("Area (sq ft)")}>
            <input
              name="area"
              type="number"
              min="1"
              max="1000000000"
              step="any"
              required
              defaultValue={existing?.area}
              placeholder="2400"
            />
          </Field>
          <Field label={tr("Bedrooms")}>
            <input
              name="bedrooms"
              type="number"
              min="0"
              max="100"
              required
              defaultValue={existing?.bedrooms || 0}
            />
          </Field>
          <Field label={tr("Bathrooms")}>
            <input
              name="bathrooms"
              type="number"
              min="0"
              max="100"
              required
              defaultValue={existing?.bathrooms || 0}
            />
          </Field>
        </div>
        <div className="form-section-title">
          <span>02</span>
          <h3>{tr("Location & details")}</h3>
        </div>
        <div className="form-grid">
          <Field label={tr("Locality / area")}>
            <input
              name="locality"
              list="areas"
              defaultValue={existing?.locality}
              required
              minLength={2}
              maxLength={100}
              placeholder={tr("Ajmer Road")}
            />
            <datalist id="areas">
              {["Ajmer Road", "Sendra Road", "College Road", "Chang Gate"].map(
                (a) => (
                  <option key={a} value={a}>{tr(a)}</option>
                ),
              )}
            </datalist>
          </Field>
          <Field label={tr("City")}>
            <input value={tr("Beawar, Rajasthan")} readOnly />
          </Field>
        </div>
        <Field label={tr("Address")}>
          <input
            name="address"
            defaultValue={existing?.address}
            required
            minLength={5}
            maxLength={300}
            placeholder={tr("Street, landmark, Beawar")}
          />
        </Field>
        <LocationPicker value={location} onChange={setLocation}/>
        <Field label={tr("Description")}>
          <textarea
            name="description"
            rows={4}
            defaultValue={existing?.description}
            required
            minLength={20}
            maxLength={5000}
            placeholder={tr("Tell buyers what makes this property special…")}
          />
        </Field>
        <Field
          label={tr("Amenities")}
          hint={tr("Separate with commas, e.g. Parking, Balcony, Garden")}
        >
          <input
            name="amenities"
            defaultValue={existing?.amenities.join(", ")}
            maxLength={1000}
          />
        </Field>
        {c.workspace.agents.length > 0 && (
          <Field label={tr("Assigned agent")}>
            <select name="agentId" defaultValue={existing?.agent_id || ""}>
              <option value="">{tr("Unassigned")}</option>
              {c.workspace.agents
                .filter((a) => a.active === undefined || !!a.active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <div className="form-section-title">
          <span>03</span>
          <h3>{tr("Photos & documents")}</h3>
        </div>
        <div className="form-grid">
          <FileUpload
            kind="photo"
            label={tr("Add property photos")}
            files={photos}
            onChange={setPhotos}
          />
          <FileUpload
            kind="document"
            label={tr("Add private documents")}
            files={docs}
            onChange={setDocs}
          />
        </div>
        <p className="notice">
          <ShieldCheck size={19} />
          {tr("Documents are only visible to you and authorized admins. Approvers see the listing and document-review status.")}</p>
        <Field label={tr("Save as")}>
          <select name="submitMode" defaultValue="pending">
            <option value="pending">{tr("Submit for approval")}</option>
            <option value="draft">{tr("Private draft")}</option>
          </select>
        </Field>
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            {tr("Cancel")}</Button>
          <Button type="submit">
            <Check size={17} />
            {tr("Save property")}</Button>
        </div>
      </Form>
    </Modal>
  );
}

export function TicketForm({
  onClose,
  service,
  property,
}: {
  onClose: () => void;
  service?: Service;
  property?: Property;
}) {
  const c = useEstate();
  return (
    <Modal
      title={property ? tr("Arrange a property visit") : service ? tr("Request a service") : tr("New request")}
      onClose={onClose}
    >
      <div className="request-summary">
        <span className="service-icon">
          <CalendarDays size={24} />
        </span>
        <div>
          <h3>{property?.title || tr(service?.name || "New request")}</h3>
          <p>
            {property
              ? tr("{v0}, Beawar", {v0: property.locality})
              : tr("The team will contact you to confirm scope, timing and charges.")}
          </p>
        </div>
      </div>
      <Form
        onSubmit={async (form) => {
          const d = dataForm(form);
          await api("/tickets", "POST", {
            category: property ? "viewing" : service?.id || d.category,
            subject: property ? "Viewing: " + property.title : service?.name || d.subject,
            message: d.message,
            mobile: d.mobile,
            propertyId: property?.id || null,
          });
          await c.refresh();
          onClose();
          c.notify("Request sent. Track it in My submissions.");
        }}
      >
        {!property && !service && <>
          <Field label={tr("Service")}><select name="category" required>{c.data.services.map(s=><option key={s.id} value={s.id}>{tr(s.name)}</option>)}</select></Field>
          <Field label={tr("Subject")}><input name="subject" required minLength={3} maxLength={160} /></Field>
        </>}
        <Field label={tr("Mobile number")}>
          <input
            name="mobile"
            type="tel"
            required
            defaultValue={c.user?.mobile}
            pattern={PHONE_PATTERN}
                maxLength={20}
          />
        </Field>
        <Field
          label={
            property ? tr("Preferred date, time & message") : tr("How can we help?")
          }
        >
          <textarea
            name="message"
            rows={5}
            required
            minLength={10}
            maxLength={3000}
            placeholder={
              property
                ? tr("I would like to visit on…")
                : tr("Tell us about the property, location and what you need…")
            }
          />
        </Field>
        <Button type="submit" className="full">
          {tr("Send request")}</Button>
      </Form>
    </Modal>
  );
}

export function PropertyDetail({
  p,
  onClose,
  onEdit,
  onRequest,
}: {
  p: Property;
  onClose: () => void;
  onEdit: (p: Property) => void;
  onRequest: (p: Property) => void;
}) {
  const c = useEstate();
  const [image, setImage] = useState(0),
    [loan, setLoan] = useState(Math.round(p.price * 0.8)),
    [rate, setRate] = useState(8.5),
    [years, setYears] = useState(20);
  const monthlyRate = rate / 1200,
    months = years * 12;
  const emi =
    monthlyRate === 0
      ? loan / months
      : (loan * monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);
  const mine = c.workspace.submissions.some((x) => x.id === p.id);
  return (
    <Modal title={tr("Property details")} onClose={onClose} wide>
      <div className="detail-photo">
        <PropertyImage
          src={p.images[image]}
          alt={p.is_demo ? tr("Illustrative stock photo") : p.title}
        />
        {p.is_demo && (
          <span className="demo-tag">{tr("Demo · illustrative photograph")}</span>
        )}
      </div>
      {p.images.length > 1 && (
        <div className="thumbnails">
          {p.images.map((src, i) => (
            <button
              key={src}
              onClick={() => setImage(i)}
              aria-label={tr("View photo {v0}", {v0: i + 1})}
              className={image === i ? "active" : ""}
            >
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
      <div className="detail-heading">
        <div>
          <div className="eyebrow">
            {tr(p.type)} {tr("· For")}{" "}{tr(p.purpose)}
          </div>
          <h2>{p.title}</h2>
          <p className="location">
            <MapPin size={16} />
            {p.locality}{tr(", Beawar")}</p>
        </div>
        <div className="detail-price">
          {money(p.price)}
          {p.purpose === "rent" && <small>{tr("/ month")}</small>}
        </div>
      </div>
      <div className="detail-facts">
        <div>
          <strong>{p.area.toLocaleString(locale())}</strong>
          <span>{tr("Square feet")}</span>
        </div>
        <div>
          <strong>{p.bedrooms || "—"}</strong>
          <span>{tr("Bedrooms")}</span>
        </div>
        <div>
          <strong>{p.bathrooms || "—"}</strong>
          <span>{tr("Bathrooms")}</span>
        </div>
        <div>
          <strong>{statusLabel(p.availability)}</strong>
          <span>{tr("Availability")}</span>
        </div>
      </div>
      {p.is_demo && (
        <p className="notice">
          {tr("This is a sample listing. Price, location and stock imagery are illustrative, and no enquiry can be made for this property.")}</p>
      )}
      <h3>{tr("About this property")}</h3>
      <p className="body-copy">{p.description}</p>
      <div className="amenities">
        {p.amenities.map((a) => (
          <span key={a}>
            <Check size={15} />
            {a}
          </span>
        ))}
      </div>
      <p className="muted">
        <MapPin size={15} /> {p.address}
      </p>
      <p className="muted">
        {tr("Listed")}{" "}{date(p.created_at)}
        {p.agent_name && tr("· Managed by {v0}", {v0: p.agent_name})}
      </p>
      <PropertyLocation p={p}/>
      {c.user && <AssignedAgentCard agent={p.assigned_agent} />}
      {!c.user && p.agent_name && <p className="notice">{tr("Sign in to view agent contact details.")}</p>}
      {p.documents && (
        <section className="document-section">
          <h3>
            <LockKeyhole size={18} /> {tr("Private documents")}</h3>
          {p.documents.length ? (
            p.documents.map((d) => (
              <a
                className="document-link"
                key={d.id}
                href={"/api/files/" + d.id}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={18} />
                {d.name}
                <Download size={17} />
              </a>
            ))
          ) : (
            <p className="muted">{tr("No documents attached.")}</p>
          )}
        </section>
      )}
      {p.review_note && <p className="notice">{tr("Review note:")}{" "}{p.review_note}</p>}
      {p.purpose === "sale" && (
        <details className="emi-calculator">
          <summary>{tr("Estimate a monthly loan payment")}</summary>
          <p className="muted">
            {tr("Illustrative calculation using your inputs. Excludes fees and taxes.")}</p>
          <div className="form-grid three">
            <Field label={tr("Loan amount (₹)")}>
              <input
                type="number"
                value={loan}
                min="1"
                onChange={(e) => setLoan(Math.max(1, Number(e.target.value)))}
              />
            </Field>
            <Field label={tr("Annual rate (%)")}>
              <input
                type="number"
                min="0"
                max="30"
                step="0.1"
                value={rate}
                onChange={(e) =>
                  setRate(Math.max(0, Math.min(30, Number(e.target.value))))
                }
              />
            </Field>
            <Field label={tr("Term (years)")}>
              <input
                type="number"
                min="1"
                max="40"
                value={years}
                onChange={(e) =>
                  setYears(Math.max(1, Math.min(40, Number(e.target.value))))
                }
              />
            </Field>
          </div>
          <p className="emi-result">
            {money(Math.round(emi))}
            <span> {tr("estimated monthly payment")}</span>
          </p>
        </details>
      )}
      <div className="form-actions">
        {mine && !p.is_demo && (
          <Button variant="outline" onClick={() => onEdit(p)}>
            {tr("Edit listing")}</Button>
        )}
        {!p.is_demo &&
          p.status === "approved" &&
          p.availability === "available" && (
            <Button
              onClick={() => {
                if (!c.user) {
                  onClose();
                  c.signIn();
                } else onRequest(p);
              }}
            >
              <CalendarDays size={17} />
              {tr("Request a viewing")}</Button>
          )}
        <Button variant="outline" onClick={onClose}>
          {tr("Close")}</Button>
      </div>
    </Modal>
  );
}

const permissionsFor: Record<Role, string[]> = {
  head_admin: [],
  admin: ["approve", "review_documents", "manage_agents", "manage_content", "manage_services"],
  approver: ["approve"],
  agent: [],
  team: ["manage_agents", "manage_content", "manage_services"],
  member: [],
};
const permLabels: Record<string, string> = {
  approve: "Approve properties & requests",
  review_documents: "Review private documents",
  manage_agents: "Manage agents & assignments",
  manage_content: "Publish news & updates",
  manage_services: "Manage providers & bookings",
};
export function UserForm({
  onClose,
  existing,
}: {
  onClose: () => void;
  existing?: User;
}) {
  const c = useEstate();
  const [role, setRole] = useState<Role>(existing?.role || "agent"),
    [permissions, setPermissions] = useState(existing?.permissions || []);
  return (
    <Modal
      title={existing ? tr("Manage account") : tr("Create team account")}
      onClose={onClose}
    >
      <p className="muted">
        {tr("Create a website login using an email address. This does not create an email mailbox.")}</p>
      <Form
        onSubmit={async (form) => {
          const d = dataForm(form);
          const payload = existing
            ? {
                role,
                permissions,
                active: d.active === "on",
                ...(d.password ? { password: d.password } : {}),
              }
            : {
                name: d.name,
                email: d.email,
                mobile: d.mobile,
                password: d.password,
                role,
                permissions,
              };
          await api(
            "/users" + (existing ? "/" + existing.id : ""),
            existing ? "PATCH" : "POST",
            payload,
          );
          await c.refresh();
          onClose();
          c.notify(
            existing ? "Account permissions updated" : "Team account created",
          );
        }}
      >
        {existing ? (
          <div className="account-summary">
            <Avatar name={existing.name} src={existing.avatar} />
            <div>
              <strong>{existing.name}</strong>
              <p>{existing.email}</p>
            </div>
          </div>
        ) : (
          <>
            <Field label={tr("Full name")}>
              <input name="name" required minLength={2} maxLength={80} />
            </Field>
            <div className="form-grid">
              <Field label={tr("Email")}>
                <input type="email" name="email" required autoComplete="off" />
              </Field>
              <Field label={tr("Mobile number")}>
                <input
                  name="mobile"
                  type="tel"
                  required
                  pattern={PHONE_PATTERN}
                maxLength={20}
                />
              </Field>
            </div>
          </>
        )}
        <Field
          label={existing ? tr("Reset password (optional)") : tr("Initial password")}
          hint={tr("At least 12 characters. Share the credentials privately.")}
        >
          <input
            name="password"
            type="password"
            required={!existing}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        <Field label={tr("Role")}>
          <select
            value={role}
            onChange={(e) => {
              const r = e.target.value as Role;
              setRole(r);
              setPermissions(
                r === "admin"
                  ? ["review_documents", "manage_agents", "manage_content"]
                  : r === "approver"
                    ? ["approve"]
                    : [],
              );
            }}
          >
            {(["admin", "approver", "agent", "team", "member"] as Role[]).map(
              (r) => (
                <option key={r} value={r}>
                  {tr(roleLabel[r])}
                </option>
              ),
            )}
          </select>
        </Field>
        <div className="permissions">
          <h4>{tr("Permissions")}</h4>
          {permissionsFor[role].length ? (
            permissionsFor[role].map((p) => (
              <label className="check" key={p}>
                <input
                  type="checkbox"
                  checked={permissions.includes(p)}
                  onChange={(e) =>
                    setPermissions(
                      e.target.checked
                        ? [...permissions, p]
                        : permissions.filter((x) => x !== p),
                    )
                  }
                />
                {tr(permLabels[p])}
              </label>
            ))
          ) : (
            <p className="muted">
              {tr("Can submit properties, request services and manage their own profile. Cannot approve submissions.")}</p>
          )}
        </div>
        {existing && (
          <label className="check">
            <input
              type="checkbox"
              name="active"
              defaultChecked={existing.active}
            />
            {tr("Account is active")}</label>
        )}
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            {tr("Cancel")}</Button>
          <Button type="submit">
            {existing ? tr("Save permissions") : tr("Create account")}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

export function AgentForm({
  onClose,
  existing,
}: {
  onClose: () => void;
  existing?: Agent;
}) {
  const c = useEstate();
  return (
    <Modal title={existing ? tr("Edit agent") : tr("Add an agent")} onClose={onClose}>
      <p className="muted">
        {tr("Add an agent to your directory. To give them login access, create an Agent account in Head admin.")}</p>
      <Form
        onSubmit={async (form) => {
          const d = dataForm(form);
          await api(
            "/agents" + (existing ? "/" + existing.id : ""),
            existing ? "PATCH" : "POST",
            {
              ...d,
              userId: existing?.user_id || null,
              active: !existing || d.active === "on",
            },
          );
          await c.refresh();
          onClose();
          c.notify("Agent saved");
        }}
      >
        <Field label={tr("Name")}>
          <input
            name="name"
            defaultValue={existing?.name}
            required
            minLength={2}
            maxLength={80}
          />
        </Field>
        <div className="form-grid">
          <Field label={tr("Email")}>
            <input name="email" type="email" defaultValue={existing?.email} />
          </Field>
          <Field label={tr("Mobile")}>
            <input
              name="mobile"
              type="tel"
              required
              defaultValue={existing?.mobile}
              pattern={PHONE_PATTERN}
                maxLength={20}
            />
          </Field>
        </div>
        <Field label={tr("Areas covered")}>
          <input
            name="areas"
            defaultValue={existing?.areas}
            maxLength={300}
            placeholder={tr("Ajmer Road, Sendra Road")}
          />
        </Field>
        <Field label={tr("About the agent")}>
          <textarea
            name="bio"
            defaultValue={existing?.bio}
            maxLength={1000}
            rows={3}
          />
        </Field>
        {existing && (
          <label className="check">
            <input
              type="checkbox"
              name="active"
              defaultChecked={!!existing.active}
            />
            {tr("Agent is active")}</label>
        )}
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            {tr("Cancel")}</Button>
          <Button type="submit">{tr("Save agent")}</Button>
        </div>
      </Form>
    </Modal>
  );
}

export function NewsForm({ onClose }: { onClose: () => void }) {
  const c = useEstate();
  return (
    <Modal title={tr("Publish a city update")} onClose={onClose}>
      <Form
        onSubmit={async (form) => {
          await api("/news", "POST", dataForm(form));
          await c.refresh();
          onClose();
          c.notify("Update published");
        }}
      >
        <Field label={tr("Title")}>
          <input name="title" required minLength={5} maxLength={160} />
        </Field>
        <Field label={tr("Category")}>
          <select name="category">
            {["City news", "Market update", "Community", "Announcement"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </Field>
        <Field label={tr("Update")}>
          <textarea
            name="body"
            required
            minLength={20}
            maxLength={6000}
            rows={6}
          />
        </Field>
        <div className="form-grid">
          <Field label={tr("Source name")}>
            <input name="sourceName" maxLength={100} />
          </Field>
          <Field label={tr("Source URL (optional)")}>
            <input
              name="sourceUrl"
              type="url"
              pattern="https://.*"
              placeholder={tr("https://")}
            />
          </Field>
        </div>
        <p className="notice">
          {tr("Publish verified information and include its original source when available.")}</p>
        <Button type="submit" className="full">
          {tr("Publish update")}</Button>
      </Form>
    </Modal>
  );
}
