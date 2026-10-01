import { tr, locale, actionLabel } from "./localization";
import { useEffect, useState } from "react";
import {
  UsersRound,
  Plus,
  ShieldCheck,
  FileText,
  Clock3,
  CheckCircle2,
  LockKeyhole,
  Settings2,
  Mail,
  Phone,
  MapPin,
  Building2,
  UserRound,
  Search,
  Download,
  Check,
  Image,
  AlertCircle,
} from "lucide-react";
import { useEstate } from "./context";
import { api } from "./api";
import {
  date,
  money,
  statusLabel,
  roleLabel,
  type Property,
  type Agent,
  type User,
  type Ticket,
} from "./types";
import { PageHeader } from "./views";
import {
  Button,
  Modal,
  Empty,
  Field,
  Form,
  Badge,
  Avatar,
  PropertyImage,
  FileUpload,
  dataForm,
  type Uploaded,
} from "./ui";
import { AgentForm, UserForm } from "./forms";

export function Approvals() {
  const c = useEstate(),
    [tab, setTab] = useState("properties"),
    [selected, setSelected] = useState<Property | null>(null),
    [ticket, setTicket] = useState<Ticket | null>(null);
  const needsDocs = c.workspace.queue.filter(
    (p) => p.document_review !== "reviewed",
  ).length;
  return (
    <>
      <PageHeader
        eyebrow={tr("APPROVALS")}
        title={tr("A second look makes a difference.")}
        description={tr("Review incoming submissions and keep the public inventory up to date.")}
      />
      <div className="mini-stats">
        <div>
          <span>{tr("Property submissions")}</span>
          <strong>{c.workspace.queue.length}</strong>
        </div>
        <div>
          <span>{tr("Document reviews pending")}</span>
          <strong>{needsDocs}</strong>
        </div>
        <div>
          <span>{tr("Service & viewing requests")}</span>
          <strong>{c.workspace.reviewTickets.length}</strong>
        </div>
        <div>
          <span>{tr("Your access")}</span>
          <strong className="small-value">
            {c.can("approve") ? tr("Approver") : tr("Document reviewer")}
          </strong>
        </div>
      </div>
      <div className="notice">
        <ShieldCheck size={20} />
        {c.can("review_documents")
          ? tr("You can open private documents and record their review. Approval requires approval permission.")
          : tr("You can review listing details and make approval decisions. Private documents remain restricted to authorized admins.")}
      </div>
      <div className="underlined-tabs">
        <button
          className={tab === "properties" ? "active" : ""}
          onClick={() => setTab("properties")}
        >
          {tr("Property submissions")}<span>{c.workspace.queue.length}</span>
        </button>
        {c.can("approve") && (
          <button
            className={tab === "tickets" ? "active" : ""}
            onClick={() => setTab("tickets")}
          >
            {tr("Requests")}<span>{c.workspace.reviewTickets.length}</span>
          </button>
        )}
      </div>
      {tab === "properties" &&
        (c.workspace.queue.length ? (
          <div className="submission-list">
            {c.workspace.queue.map((p) => (
              <article className="submission-card" key={p.id}>
                <PropertyImage src={p.images[0]} alt={p.title} />
                <div>
                  <div className="submission-title">
                    <h3>{p.title}</h3>
                    <Badge status={p.status} />
                  </div>
                  <p className="location">
                    <MapPin size={14} />
                    {p.locality} · {money(p.price)}
                  </p>
                  <p className="muted">
                    {tr("Submitted")}{" "}{date(p.created_at)} {tr("· Documents:")}{" "}
                    {p.document_review === "reviewed"
                      ? tr("review recorded")
                      : tr("review pending / no documents")}
                  </p>
                  <div className="inline-actions">
                    <Button
                      variant="outline"
                      onClick={() => c.openProperty(p.id)}
                    >
                      {tr("View details")}</Button>
                    <Button onClick={() => setSelected(p)}>
                      {tr("Review submission")}</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={<CheckCircle2 size={30} />}
            title={tr("You're all caught up")}
            description={tr("New property submissions will appear here when they are ready for your review.")}
          />
        ))}
      {tab === "tickets" &&
        (c.workspace.reviewTickets.length ? (
          <div className="request-list">
            {c.workspace.reviewTickets.map((t) => (
              <article key={t.id} className="panel">
                <div className="section-heading">
                  <h3>{t.subject}</h3>
                  <Badge status={t.status} />
                </div>
                <p>{t.message}</p>
                <p className="muted">
                  {t.submitter} · {date(t.created_at)}
                </p>
                <Button variant="outline" onClick={() => setTicket(t)}>
                  {tr("Review request")}</Button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={tr("No pending requests")}
            description={tr("New service and viewing requests will appear here.")}
          />
        ))}
      {selected && (
        <Modal
          title={tr("Review property submission")}
          onClose={() => setSelected(null)}
          wide
        >
          <div className="review-summary">
            <PropertyImage src={selected.images[0]} alt={selected.title} />
            <div>
              <h3>{selected.title}</h3>
              <p>
                {selected.locality} · {money(selected.price)}
              </p>
              <Badge status={selected.status} />
            </div>
          </div>
          <p className="body-copy">{selected.description}</p>
          <div className="detail-facts">
            <div>
              <strong>{selected.type}</strong>
              <span>{tr("Property type")}</span>
            </div>
            <div>
              <strong>{selected.area}</strong>
              <span>{tr("Square feet")}</span>
            </div>
            <div>
              <strong>{selected.bedrooms}</strong>
              <span>{tr("Bedrooms")}</span>
            </div>
          </div>
          {c.can("review_documents") && (
            <div className="document-section">
              <h3>{tr("Private documents")}</h3>
              {selected.documents?.length ? (
                selected.documents.map((d) => (
                  <a
                    key={d.id}
                    href={"/api/files/" + d.id}
                    className="document-link"
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
              {selected.document_review === "reviewed" ? (
                <p className="notice">
                  <CheckCircle2 size={17} />
                  {tr("Document review recorded.")}</p>
              ) : selected.documents?.length ? (
                <Form
                  onSubmit={async (form) => {
                    await api(
                      "/properties/" + selected.id + "/review-documents",
                      "POST",
                      dataForm(form),
                    );
                    const r = await api("/properties/" + selected.id);
                    setSelected(r.property);
                    await c.refresh();
                    c.notify("Document review recorded");
                  }}
                >
                  <Field label={tr("Document review note")}>
                    <textarea
                      name="note"
                      required
                      minLength={5}
                      maxLength={2000}
                      rows={2}
                      placeholder={tr("Record what was checked and any concerns…")}
                    />
                  </Field>
                  <Button type="submit" variant="outline">
                    {tr("Mark document review complete")}</Button>
                </Form>
              ) : null}
            </div>
          )}
          {c.can("approve") && (
            <Form
              onSubmit={async (form) => {
                await api(
                  "/properties/" + selected.id + "/decision",
                  "POST",
                  dataForm(form),
                );
                await c.refresh();
                setSelected(null);
                c.notify("Approval decision saved");
              }}
            >
              <Field label={tr("Decision")}>
                <select name="decision">
                  <option value="approved">{tr("Approve and publish")}</option>
                  <option value="changes_requested">{tr("Request changes")}</option>
                  <option value="rejected">{tr("Reject")}</option>
                </select>
              </Field>
              <Field
                label={tr("Review note")}
                hint={tr("Required for rejection or requested changes.")}
              >
                <textarea name="note" maxLength={2000} rows={3} />
              </Field>
              <p className="muted">
                {tr("You cannot approve your own submission. Attached documents must be reviewed by an authorized admin before approval.")}</p>
              <Button type="submit">{tr("Save decision")}</Button>
            </Form>
          )}
        </Modal>
      )}
      {ticket && (
        <Modal title={tr("Review request")} onClose={() => setTicket(null)}>
          <h3>{ticket.subject}</h3>
          <p className="body-copy">{ticket.message}</p>
          <Form
            onSubmit={async (form) => {
              await api("/tickets/" + ticket.id, "PATCH", dataForm(form));
              await c.refresh();
              setTicket(null);
              c.notify("Request updated");
            }}
          >
            <Field label={tr("Status")}>
              <select name="status">
                <option value="approved">{tr("Approve")}</option>
                <option value="rejected">{tr("Reject")}</option>
                <option value="resolved">{tr("Resolved")}</option>
              </select>
            </Field>
            <Field label={tr("Response to requester")}>
              <textarea
                name="note"
                required
                minLength={3}
                maxLength={2000}
                rows={3}
              />
            </Field>
            <Button type="submit">{tr("Save response")}</Button>
          </Form>
        </Modal>
      )}
    </>
  );
}

export function Agents() {
  const c = useEstate(),
    [form, setForm] = useState<Agent | "new" | null>(null),
    [selected, setSelected] = useState<Agent | null>(null),
    [managed, setManaged] = useState<Property[]>([]),
    [managedTickets, setManagedTickets] = useState<Ticket[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const agents = c.workspace.agents;
  useEffect(() => {
    if (c.can("manage_agents"))
      Promise.all([api("/managed-properties"), api("/managed-tickets")])
        .then(([p,t]) => { setManaged(p.properties); setManagedTickets(t.tickets); })
        .catch((e) => setError(e.message));
  }, [c.workspace]);
  const rows = agents.filter((a) =>
    (a.name + " " + a.areas).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow={tr("YOUR LOCAL NETWORK")}
        title={tr("Good people. Better connections.")}
        description={tr("Meet your agents and see the properties they look after.")}
      >
        {c.can("manage_agents") && (
          <Button onClick={() => setForm("new")}>
            <Plus size={18} />
            {tr("Add agent")}</Button>
        )}
      </PageHeader>
      <div className="agents-banner">
        <div>
          <UsersRound size={28} />
          <span>
            <strong>{agents.length}</strong> {tr("agents in your directory")}</span>
        </div>
        <label className="search-input">
          <Search size={19} />
          <input
            aria-label={tr("Search agents")}
            placeholder={tr("Search by name or area…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && <p className="error">{tr(error)}</p>}
      {rows.length ? (
        <div className="agent-grid">
          {rows.map((a) => (
            <article className="agent-card" key={a.id}>
              <div className="agent-card-heading">
                <Avatar name={a.name} src={a.avatar} size="large" />
                <span className="badge">
                  {!a.active ? tr("Inactive") : tr("Agent")}
                </span>
              </div>
              <h3>{a.name}</h3>
              <p className="location">
                <MapPin size={15} />
                {a.areas || tr("Beawar")}
              </p>
              <p className="agent-bio">
                {a.bio || tr("Property assistance in Beawar.")}
              </p>
              {c.can("manage_agents") && (
                <div className="agent-contact">
                  {a.mobile && (
                    <span>
                      <Phone size={14} />
                      {a.mobile}
                    </span>
                  )}
                  {a.email && (
                    <span>
                      <Mail size={14} />
                      {a.email}
                    </span>
                  )}
                </div>
              )}
              <div className="agent-card-footer">
                <span>
                  <strong>{a.property_count}</strong> {tr("properties")}</span>
                <Button variant="outline" onClick={() => setSelected(a)}>
                  {tr("View portfolio")}</Button>
                {c.can("manage_agents") && (
                  <Button variant="ghost" onClick={() => setForm(a)}>
                    {tr("Edit")}</Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<UsersRound size={30} />}
          title={
            query
              ? tr("No agents match this search")
              : tr("Your local network starts here")
          }
          description={
            query
              ? tr("Try a different name or area.")
              : tr("Add agents manually, or create an Agent login in Head admin to add them to the directory.")
          }
        >
          {c.can("manage_agents") && (
            <Button onClick={() => setForm("new")}>
              <Plus size={17} />
              {tr("Add your first agent")}</Button>
          )}
        </Empty>
      )}
      {form && (
        <AgentForm
          existing={form === "new" ? undefined : form}
          onClose={() => setForm(null)}
        />
      )}{" "}
      {selected && (
        <Modal
          title={tr("{v0} · Portfolio", {v0: selected.name})}
          onClose={() => setSelected(null)}
          wide
        >
          {managed
            .filter((p) => p.agent_id === selected.id)
            .map((p) => (
              <div className="assignment-row" key={p.id}>
                <div>
                  <strong>{p.title}</strong>
                  <p>
                    {p.locality} · {money(p.price)} ·{" "}
                    {p.is_demo ? tr("Demo") : statusLabel(p.status)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(null);
                    c.openProperty(p.id);
                  }}
                >
                  {tr("View")}</Button>
              </div>
            ))}
          {!managed.some(
            (p) => p.agent_id === selected.id,
          ) && <p className="muted">{tr("No properties assigned yet.")}</p>}
          {c.can("manage_agents") && (
            <Form
              onSubmit={async (form) => {
                const d = dataForm(form);
                await api("/properties/" + d.propertyId + "/agent", "PATCH", {
                  agentId: selected.id,
                });
                await c.refresh();
                c.notify("Property assigned");
              }}
            >
              <Field label={tr("Assign a property")}>
                <select name="propertyId" required defaultValue="">
                  <option value="" disabled>
                    {tr("Select a property")}</option>
                  {managed
                    .filter((p) => p.agent_id !== selected.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                        {p.agent_name ? tr("(currently {v0})", {v0: p.agent_name}) : ""}
                      </option>
                    ))}
                </select>
              </Field>
              <Button
                type="submit"
                disabled={!selected.active || !managed.some((p) => p.agent_id !== selected.id)}
              >
                {tr("Assign to")}{" "}{selected.name.split(" ")[0]}
              </Button>
            </Form>
          )}
          <section className="ticket-assignments"><h3>{tr("Assigned requests")}</h3>
            {managedTickets.filter(t=>t.agent_id===selected.id).map(t=><div className="assignment-row" key={t.id}><strong>{t.subject}</strong><Badge status={t.status} /></div>)}
            {!managedTickets.some(t=>t.agent_id===selected.id) && <p className="muted">{tr("No requests assigned yet.")}</p>}
            <Form onSubmit={async form=>{const d=dataForm(form);await api("/tickets/"+d.ticketId+"/agent","PATCH",{agentId:selected.id});await c.refresh();c.notify("Request assigned");}}>
              <Field label={tr("Assign a request")}><select name="ticketId" required defaultValue=""><option value="" disabled>{tr("Select a request")}</option>{managedTickets.filter(t=>t.agent_id!==selected.id).map(t=><option key={t.id} value={t.id}>{t.subject}</option>)}</select></Field>
              <Button type="submit" disabled={!selected.active || !managedTickets.some(t=>t.agent_id!==selected.id)}>{tr("Assign request")}</Button>
            </Form>
          </section>
        </Modal>
      )}
    </>
  );
}

export function HeadAdmin() {
  const c = useEstate(),
    [form, setForm] = useState<User | "new" | null>(null),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("people");
  const users = c.workspace.users.filter((u) =>
    `${u.name} ${u.email} ${tr(roleLabel[u.role])}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow={tr("HEAD ADMIN")}
        title={tr("The right access, for the right people.")}
        description={tr("Create accounts, set permissions and manage your property team.")}
      >
        <Button onClick={() => setForm("new")}>
          <Plus size={18} />
          {tr("Create account")}</Button>
      </PageHeader>
      <div className="mini-stats">
        <div>
          <span>{tr("Total accounts")}</span>
          <strong>{c.workspace.users.length}</strong>
        </div>
        <div>
          <span>{tr("Admins")}</span>
          <strong>
            {c.workspace.users.filter((u) => u.role.includes("admin")).length}
          </strong>
        </div>
        <div>
          <span>{tr("Approvers")}</span>
          <strong>
            {
              c.workspace.users.filter(
                (u) => u.permissions.includes("approve") && u.active,
              ).length
            }
          </strong>
        </div>
        <div>
          <span>{tr("Agents & team")}</span>
          <strong>
            {
              c.workspace.users.filter((u) =>
                ["agent", "team"].includes(u.role),
              ).length
            }
          </strong>
        </div>
      </div>
      <div className="underlined-tabs">
        <button
          className={tab === "people" ? "active" : ""}
          onClick={() => setTab("people")}
        >
          {tr("People & permissions")}</button>
        <button
          className={tab === "activity" ? "active" : ""}
          onClick={() => setTab("activity")}
        >
          {tr("Activity log")}</button>
      </div>
      {tab === "people" ? (
        <>
          <label className="search-input standalone">
            <Search size={19} />
            <input
              placeholder={tr("Search a name, email or role…")}
              aria-label={tr("Search accounts")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("Team member")}</th>
                  <th>{tr("Role")}</th>
                  <th>{tr("Access")}</th>
                  <th>{tr("Status")}</th>
                  <th>{tr("Action")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={u.name} src={u.avatar} />
                        <div>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                          {u.mobile && <small>{u.mobile}</small>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${u.role}`}>
                        {tr(roleLabel[u.role])}
                      </span>
                    </td>
                    <td>
                      <div className="permission-tags">
                        {u.role === "head_admin" ? (
                          <span>{tr("Full access")}</span>
                        ) : u.permissions.length ? (
                          u.permissions.map((p) => (
                            <span key={p}>{tr(p.replaceAll("_", " "))}</span>
                          ))
                        ) : (
                          <span>{tr("Submit & track")}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${u.active ? "approved" : "rejected"}`}
                      >
                        {u.active ? tr("Active") : tr("Inactive")}
                      </span>
                    </td>
                    <td>
                      {u.role === "head_admin" ? (
                        <span className="muted">
                          <LockKeyhole size={15} />
                          {tr("Protected")}</span>
                      ) : (
                        <Button variant="outline" onClick={() => setForm(u)}>
                          {tr("Manage")}</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="access-guide">
            <h3>{tr("How access works")}</h3>
            <div>
              {[
                [
                  "Head admin",
                  "Creates accounts, sets permissions and manages the entire workspace.",
                ],
                [
                  "Admin",
                  "Reviews private documents. Other permissions are chosen by the head admin.",
                ],
                [
                  "Approver",
                  "Approves listings and requests; private documents stay restricted.",
                ],
                [
                  "Agent / team member",
                  "Uploads properties and tracks their own submissions.",
                ],
              ].map(([title, copy]) => (
                <article key={tr(title)}>
                  <ShieldCheck size={19} />
                  <h4>{tr(title)}</h4>
                  <p>{tr(copy)}</p>
                </article>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="panel activity-log">
          {c.workspace.audit.length ? (
            c.workspace.audit.map((a) => (
              <div key={a.id}>
                <span className="activity-icon">
                  <Clock3 size={17} />
                </span>
                <div>
                  <strong>
                    {actionLabel(a.action)}
                  </strong>
                  <p>
                    {a.actor || tr("System")}
                    {a.details ? " · " + a.details : ""}
                  </p>
                </div>
                <time>{date(a.created_at)}</time>
              </div>
            ))
          ) : (
            <Empty
              title={tr("No activity yet")}
              description={tr("Account changes, approvals and submissions will be recorded here.")}
            />
          )}
        </div>
      )}
      {form && (
        <UserForm
          existing={form === "new" ? undefined : form}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}

export function Settings() {
  const c = useEstate(),
    [tab, setTab] = useState("profile"),
    [avatar, setAvatar] = useState<Uploaded[]>([]),
    [logo, setLogo] = useState<Uploaded[]>([]),
    [confirm, setConfirm] = useState(false);
  if (!c.user)
    return (
      <>
        <PageHeader eyebrow={tr("SETTINGS")} title={tr("Make it your own.")} />
        <Empty
          icon={<UserRound size={29} />}
          title={tr("Sign in to manage your profile")}
          description={tr("Update your details and profile photo from one place.")}
        >
          <Button onClick={c.signIn}>{tr("Sign in")}</Button>
        </Empty>
      </>
    );
  const settings = c.data.settings;
  return (
    <>
      <PageHeader
        eyebrow={tr("SETTINGS")}
        title={tr("A few details. A more personal space.")}
        description={tr("Manage your profile, security and website preferences.")}
      />
      <div className="settings-layout">
        <div className="settings-menu">
          {[
            ["profile", "My profile", UserRound],
            ["security", "Password & security", LockKeyhole],
            ...(c.user.role === "head_admin"
              ? [["brand", "Website & policies", Settings2]]
              : []),
          ].map(([key, label, Icon]) => {
            const I = Icon as typeof UserRound;
            return (
              <button
                key={key as string}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key as string)}
              >
                <I size={19} />
                {tr(label as string)}
              </button>
            );
          })}
        </div>
        <div className="panel settings-panel">
          {tab === "profile" && (
            <>
              <h2>{tr("My profile")}</h2>
              <p className="muted">
                {tr("Your Google profile photo appears when you use configured Google sign-in. You can also upload your own.")}</p>
              <div className="profile-preview">
                <Avatar
                  name={c.user.name}
                  src={avatar[0]?.url || c.user.avatar}
                  size="large"
                />
                <div>
                  <strong>{c.user.name}</strong>
                  <p>{tr(roleLabel[c.user.role])}</p>
                </div>
              </div>
              <Form
                onSubmit={async (form) => {
                  const d = dataForm(form);
                  const r = await api("/me", "PATCH", {
                    ...d,
                    ...(avatar[0] ? { avatarId: avatar[0].id } : {}),
                  });
                  c.setUser(r.user);
                  await c.refresh();
                  setAvatar([]);
                  c.notify("Profile updated");
                }}
              >
                <div className="form-grid">
                  <Field label={tr("Full name")}>
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={80}
                      defaultValue={c.user.name}
                    />
                  </Field>
                  <Field label={tr("Mobile number")}>
                    <input
                      name="mobile"
                      type="tel"
                      defaultValue={c.user.mobile}
                    />
                  </Field>
                </div>
                <Field label={tr("Email address")}>
                  <input value={c.user.email} readOnly />
                </Field>
                <FileUpload
                  kind="avatar"
                  files={avatar}
                  onChange={setAvatar}
                  label={tr("Upload a profile photo")}
                  multiple={false}
                />
                <div className="form-actions">
                  <Button type="submit">{tr("Save profile")}</Button>
                </div>
              </Form>
            </>
          )}
          {tab === "security" && (
            <>
              <h2>{tr("Password & security")}</h2>
              <p className="muted">
                {tr("Changing your password signs you out on other devices.")}</p>
              <Form
                onSubmit={async (form) => {
                  await api("/me/password", "POST", dataForm(form));
                  form.reset();
                  c.notify(
                    "Password changed. Other sessions have been signed out.",
                  );
                }}
              >
                <Field label={tr("Current password")}>
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <Field label={tr("New password")} hint={tr("Use at least 12 characters.")}>
                  <input
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </Field>
                <Button type="submit">{tr("Change password")}</Button>
              </Form>
              <div className="notice">
                <ShieldCheck size={20} />
                {tr("Permissions are enforced by the server. Contact your head admin if you need a different role.")}</div>
            </>
          )}
          {tab === "brand" && (
            <>
              <h2>{tr("Website & policies")}</h2>
              <Form
                onSubmit={async (form) => {
                  await api("/settings", "PATCH", {
                    ...dataForm(form),
                    ...(logo[0] ? { logoId: logo[0].id } : {}),
                  });
                  await c.refresh();
                  setLogo([]);
                  c.notify("Website settings saved");
                }}
              >
                <div className="form-grid">
                  <Field label={tr("Brand name")}>
                    <input
                      name="brandName"
                      required
                      defaultValue={settings.brandName}
                      minLength={2}
                      maxLength={60}
                    />
                  </Field>
                  <Field label={tr("Tagline")}>
                    <input
                      name="tagline"
                      defaultValue={settings.tagline}
                      maxLength={120}
                    />
                  </Field>
                </div>
                {settings.logo && (
                  <img
                    className="current-logo"
                    src={settings.logo}
                    alt={tr("Current brand logo")}
                  />
                )}
                <FileUpload
                  kind="logo"
                  files={logo}
                  onChange={setLogo}
                  label={tr("Upload your logo")}
                  multiple={false}
                />
                <div className="form-grid">
                  <Field label={tr("Contact email")}>
                    <input
                      name="contactEmail"
                      type="email"
                      defaultValue={settings.contactEmail}
                    />
                  </Field>
                  <Field label={tr("Contact phone")}>
                    <input
                      name="contactPhone"
                      type="tel"
                      defaultValue={settings.contactPhone}
                    />
                  </Field>
                </div>
                <Field label={tr("Privacy policy")}>
                  <textarea
                    name="privacy"
                    required
                    minLength={20}
                    maxLength={10000}
                    rows={6}
                    defaultValue={settings.privacy}
                  />
                </Field>
                <Field label={tr("Terms of use")}>
                  <textarea
                    name="terms"
                    required
                    minLength={20}
                    maxLength={10000}
                    rows={6}
                    defaultValue={settings.terms}
                  />
                </Field>
                <Button type="submit">{tr("Save website settings")}</Button>
              </Form>
              {c.data.properties.some((p) => p.is_demo) && (
                <div className="danger-zone">
                  <div>
                    <h3>{tr("Ready for real listings?")}</h3>
                    <p>
                      {tr("Remove all demo properties. Real submissions and accounts stay in place.")}</p>
                  </div>
                  <Button variant="danger" onClick={() => setConfirm(true)}>
                    {tr("Remove demo data")}</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {confirm && (
        <Modal
          title={tr("Remove sample properties?")}
          onClose={() => setConfirm(false)}
        >
          <p>
            {tr("This removes all properties marked Demo and their saved-property entries. Real listings are not affected.")}</p>
          <Form
            onSubmit={async () => {
              await api("/demo", "DELETE");
              await c.refresh();
              setConfirm(false);
              c.notify("Demo properties removed");
            }}
          >
            <div className="form-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirm(false)}
              >
                {tr("Cancel")}</Button>
              <Button type="submit" variant="danger">
                {tr("Remove demo properties")}</Button>
            </div>
          </Form>
        </Modal>
      )}
    </>
  );
}
