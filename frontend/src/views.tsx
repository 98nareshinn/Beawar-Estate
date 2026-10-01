import { Bookings } from "./marketplace";
import { tr, locale, actionLabel } from "./localization";
import { useState } from "react";
import {
  House,
  Building2,
  KeyRound,
  LandPlot,
  Plus,
  MapPin,
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Heart,
  FileText,
  Ruler,
  ChartNoAxesCombined,
  CheckCircle2,
  ShieldCheck,
  CalendarDays,
  Newspaper,
  ExternalLink,
  UsersRound,
  Clock3,
  Bookmark,
  Mail,
  LockKeyhole,
  X,
  Scale,
  Trash2,
} from "lucide-react";
import { useEstate } from "./context";
import { api } from "./api";
import {
  money,
  date,
  statusLabel,
  type Property,
  type Service,
  type News,
} from "./types";
import {
  Button,
  AssignedAgentCard,
  SubmissionHistory,
  Field,
  Form,
  Modal,
  Empty,
  Badge,
  Avatar,
  PropertyCard,
  Filters,
  initialFilters,
  useFiltered,
  dataForm,
  PropertyImage,
} from "./ui";
import { TicketForm, PropertyForm, NewsForm } from "./forms";

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{tr(eyebrow)}</div>
        <h1>{tr(title)}</h1>
        {description && <p>{tr(description)}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Dashboard() {
  const c = useEstate();
  const [f, setF] = useState(initialFilters);
  const all = c.data.properties;
  const properties = useFiltered(all, f, c.workspace.favorites);
  const areas = [...new Set(all.map((p) => p.locality))];
  const stats = [
    {
      label: "Properties to explore",
      value: all.filter((p) => p.availability === "available").length,
      detail: "Across Beawar",
      icon: House,
    },
    {
      label: "Homes & spaces for sale",
      value: all.filter(
        (p) => p.purpose === "sale" && p.availability === "available",
      ).length,
      detail: "Find your next address",
      icon: Building2,
    },
    {
      label: "Available to rent",
      value: all.filter(
        (p) => p.purpose === "rent" && p.availability === "available",
      ).length,
      detail: "Move in, make it yours",
      icon: KeyRound,
    },
    {
      label: "Localities covered",
      value: areas.length,
      detail: "One city. More possibilities.",
      icon: MapPin,
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow={tr("BEAWAR, RAJASTHAN")}
        title={tr("Your city. Your next address.")}
        description={tr("Discover homes, plots and possibilities, all in one place.")}
      >
        <Button onClick={c.newProperty}>
          <Plus size={18} />
          {tr("List a property")}</Button>
      </PageHeader>
      <div className="stats-grid">
        {stats.map((s, i) => (
          <div className={`stat-card stat-${i}`} key={tr(s.label)}>
            <div>
              <p>{tr(s.label)}</p>
              <strong>{String(s.value).padStart(2, "0")}</strong>
              <span>{tr(s.detail)}</span>
            </div>
            <span className="stat-icon">
              <s.icon size={22} />
            </span>
          </div>
        ))}
      </div>
      <Filters value={f} onChange={setF} areas={areas} />
      <div className="dashboard-layout">
        <section className="listing-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">{tr("CURATED BY YOUR LOCAL TEAM")}</div>
              <h2>
                {tr("Fresh on the market")}<span className="count">{properties.length}</span>
              </h2>
            </div>
            <div className="segmented">
              <button
                className={f.purpose === "all" ? "active" : ""}
                onClick={() => setF({ ...f, purpose: "all" })}
              >
                {tr("All")}</button>
              <button
                className={f.purpose === "sale" ? "active" : ""}
                onClick={() => setF({ ...f, purpose: "sale" })}
              >
                {tr("Buy")}</button>
              <button
                className={f.purpose === "rent" ? "active" : ""}
                onClick={() => setF({ ...f, purpose: "rent" })}
              >
                {tr("Rent")}</button>
            </div>
          </div>
          {all.some((p) => p.is_demo) && (
            <p className="demo-note">
              <span>{tr("DEMO COLLECTION")}</span>{tr("Sample prices and stock images. Real listings appear after approval.")}</p>
          )}
          {properties.length ? (
            <div className="property-grid">
              {properties.slice(0, 6).map((p) => (
                <PropertyCard key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <Empty
              title={tr("Let's find a better match")}
              description={tr("Try another area, property type or price range.")}
            >
              <Button variant="outline" onClick={() => setF(initialFilters)}>
                {tr("Reset filters")}</Button>
            </Empty>
          )}
          {properties.length > 0 && (
            <Button
              variant="outline"
              className="view-all"
              onClick={() => c.navigate("properties")}
            >
              {tr("Explore property database")}</Button>
          )}
        </section>
        <aside className="dashboard-aside">
          <div className="city-card">
            <div className="eyebrow">{tr("ROOTED IN BEAWAR")}</div>
            <h2>
              {tr("Local knowledge.")}<br />{tr("A little more certainty.")}</h2>
            <p>
              {tr("A space for your property search and the people who help you move.")}</p>
            <div className="city-card-bottom">
              <span className="city-stamp">
                <MapPin size={22} />
              </span>
              <span>
                {tr("Beawar")}<br />
                <small>{tr("Rajasthan, India")}</small>
              </span>
            </div>
          </div>
          <section className="panel area-panel">
            <div className="section-heading">
              <h3>{tr("Explore by area")}</h3>
              <MapPin size={18} />
            </div>
            <p className="muted">{tr("In the current inventory")}</p>
            {areas.slice(0, 4).map((area) => {
              const count = all.filter((p) => p.locality === area).length;
              return (
                <button
                  className="area-row"
                  key={area}
                  onClick={() =>
                    setF({
                      ...f,
                      locality: f.locality === area ? "All areas" : area,
                    })
                  }
                >
                  <span>
                    {area}
                    <span className="area-bar">
                      <i
                        style={{
                          width: (100 * count) / Math.max(1, all.length) + "%",
                        }}
                      />
                    </span>
                  </span>
                  <strong>{count}</strong>
                </button>
              );
            })}
            {!areas.length && (
              <p className="muted">{tr("Areas appear as listings are approved.")}</p>
            )}
          </section>
          <section className="services-teaser">
            <span className="mini-icon">
              <Ruler size={23} />
            </span>
            <h3>{tr("More than a listing.")}</h3>
            <p>
              {tr("From site measurements to finding the right home. Get the right help.")}</p>
            <Button variant="outline" onClick={() => c.navigate("services")}>
              {tr("Explore services")}</Button>
          </section>
        </aside>
      </div>
    </>
  );
}

export function Properties() {
  const c = useEstate(),
    [f, setF] = useState(initialFilters),
    [mode, setMode] = useState("grid"),
    [compare, setCompare] = useState<string[]>([]),
    [showCompare, setShowCompare] = useState(false);
  const rows = useFiltered(c.data.properties, f, c.workspace.favorites);
  const compared = c.data.properties.filter((p) => compare.includes(p.id));
  function toggle(id: string) {
    if (compare.includes(id)) setCompare(compare.filter((x) => x !== id));
    else if (compare.length < 3) setCompare([...compare, id]);
    else c.notify("Compare up to three properties at a time.");
  }
  return (
    <>
      <PageHeader
        eyebrow={tr("PROPERTY DATABASE")}
        title={tr("Every possibility, in one place.")}
        description={tr("Explore, shortlist and compare properties across Beawar.")}
      >
        <Button onClick={c.newProperty}>
          <Plus size={17} />
          {tr("List a property")}</Button>
      </PageHeader>
      <Filters
        value={f}
        onChange={setF}
        areas={[...new Set(c.data.properties.map((p) => p.locality))]}
      />
      <div className="database-toolbar">
        <div className="segmented">
          <button
            className={f.purpose === "all" ? "active" : ""}
            onClick={() => setF({ ...f, purpose: "all" })}
          >
            {tr("All properties")}</button>
          <button
            className={f.purpose === "sale" ? "active" : ""}
            onClick={() => setF({ ...f, purpose: "sale" })}
          >
            {tr("For sale")}</button>
          <button
            className={f.purpose === "rent" ? "active" : ""}
            onClick={() => setF({ ...f, purpose: "rent" })}
          >
            {tr("For rent")}</button>
        </div>
        <div className="toolbar-actions">
          <span className="muted">{rows.length} {tr("results")}</span>
          <select
            aria-label={tr("Sort properties")}
            value={f.sort}
            onChange={(e) => setF({ ...f, sort: e.target.value })}
          >
            <option value="newest">{tr("Newest first")}</option>
            <option value="price-low">{tr("Price: low to high")}</option>
            <option value="price-high">{tr("Price: high to low")}</option>
            <option value="area">{tr("Largest area")}</option>
          </select>
          <div className="view-toggle">
            <button
              aria-label={tr("Grid view")}
              className={mode === "grid" ? "active" : ""}
              onClick={() => setMode("grid")}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              aria-label={tr("Table view")}
              className={mode === "table" ? "active" : ""}
              onClick={() => setMode("table")}
            >
              <List size={19} />
            </button>
          </div>
        </div>
      </div>
      {rows.some((p) => p.is_demo) && (
        <p className="demo-note">
          <span>{tr("DEMO COLLECTION")}</span>{tr("Illustrative listings, prices and photos.")}</p>
      )}
      {rows.length ? (
        mode === "grid" ? (
          <div className="property-grid database-grid">
            {rows.map((p) => (
              <div key={p.id}>
                <PropertyCard p={p} />
                <label className="compare-check">
                  <input
                    type="checkbox"
                    checked={compare.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  {tr("Compare property")}</label>
              </div>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("Compare")}</th>
                  <th>{tr("Property")}</th>
                  <th>{tr("Area")}</th>
                  <th>{tr("Type")}</th>
                  <th>{tr("Price")}</th>
                  <th>{tr("Availability")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={tr("Compare {v0}", {v0: p.title})}
                        checked={compare.includes(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                    </td>
                    <td>
                      <button
                        className="table-property"
                        onClick={() => c.openProperty(p.id)}
                      >
                        <PropertyImage src={p.images[0]} alt="" />
                        <span>
                          <strong>{p.title}</strong>
                          <small>
                            {p.locality}
                            {p.is_demo ? tr("· Demo") : ""}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>{p.area.toLocaleString(locale())} {tr("sq ft")}</td>
                    <td>{tr(p.type)}</td>
                    <td>
                      <strong>{money(p.price)}</strong>
                      {p.purpose === "rent" ? tr("/mo") : ""}
                    </td>
                    <td>
                      <Badge status={p.availability} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <Empty
          title={tr("No properties match your search")}
          description={tr("Try broadening your filters or check back for new listings.")}
        >
          <Button variant="outline" onClick={() => setF(initialFilters)}>
            {tr("Clear filters")}</Button>
        </Empty>
      )}
      {compare.length > 0 && (
        <div className="compare-bar">
          <Scale size={20} />
          <span>{compare.length} {tr("of 3 properties selected")}</span>
          <Button
            onClick={() => setShowCompare(true)}
            disabled={compare.length < 2}
          >
            {tr("Compare properties")}</Button>
          <button
            className="icon-btn"
            onClick={() => setCompare([])}
            aria-label={tr("Clear comparison")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {showCompare && (
        <Modal
          title={tr("Side-by-side comparison")}
          onClose={() => setShowCompare(false)}
          wide
        >
          <div className="table-wrap">
            <table className="comparison">
              <thead>
                <tr>
                  <th>{tr("At a glance")}</th>
                  {compared.map((p) => (
                    <th key={p.id}>
                      <PropertyImage src={p.images[0]} alt="" />
                      {p.title}
                      {p.is_demo && <small>{tr("Demo listing")}</small>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Price",
                    (p: Property) =>
                      money(p.price) + (p.purpose === "rent" ? " " + tr("/mo") : ""),
                  ],
                  [
                    "Area",
                    (p: Property) => p.area.toLocaleString(locale()) + " " + tr("sq ft"),
                  ],
                  ["Locality", (p: Property) => p.locality],
                  ["Type", (p: Property) => tr(p.type)],
                  ["Bedrooms", (p: Property) => String(p.bedrooms || "—")],
                  ["Amenities", (p: Property) => p.amenities.map(a => tr(a)).join(", ") || "—"],
                ].map(([label, fn]) => (
                  <tr key={tr(label as string)}>
                    <th>{tr(label as string)}</th>
                    {compared.map((p) => (
                      <td key={p.id}>{(fn as (p: Property) => string)(p)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}

const serviceIcons: Record<string, typeof House> = {
  ruler: Ruler,
  file: FileText,
  chart: ChartNoAxesCombined,
  home: House,
  key: KeyRound,
  building: Building2,
};
export function Services() {
  const c = useEstate(),
    [category, setCategory] = useState("All services"),
    [request, setRequest] = useState<Service | null>(null);
  return (
    <>
      <PageHeader
        eyebrow={tr("SERVICES")}
        title={tr("The right help. At every step.")}
        description={tr("Practical property support, from the first measurement to your next move.")}
      />
      <div className="service-banner">
        <div>
          <span className="eyebrow">{tr("YOUR LOCAL PROPERTY TEAM")}</span>
          <h2>{tr("A little expertise goes a long way.")}</h2>
          <p>
            {tr("Tell us what you need. Your team will confirm the scope, availability and charges.")}</p>
        </div>
        <span className="banner-icon">
          <Ruler size={50} />
        </span>
      </div>
      <div className="chip-row">
        {[
          "All services",
          "Property essentials",
          "Buy & sell",
          "Home improvement",
        ].map((t) => (
          <button
            className={category === t ? "active" : ""}
            key={tr(t)}
            onClick={() => setCategory(t)}
          >
            {tr(t)}
          </button>
        ))}
      </div>
      <div className="service-grid">
        {c.data.services
          .filter((s) => category === "All services" || s.category === category)
          .map((s, i) => {
            const Icon = serviceIcons[s.icon] || House;
            return (
              <article className="service-card" key={s.id}>
                <div className="service-card-top">
                  <span className={`service-icon tone-${i % 3}`}>
                    <Icon size={26} />
                  </span>
                  <span className="eyebrow">{tr(s.category)}</span>
                </div>
                <h3>{tr(s.name)}</h3>
                <p>{tr(s.description)}</p>
                <div className="service-duration">
                  <Clock3 size={14} />
                  {tr(s.duration)}
                </div>
                <Button
                  variant="outline"
                  onClick={() => (c.user ? setRequest(s) : c.signIn())}
                >
                  {tr("Request this service")}</Button>
              </article>
            );
          })}
      </div>
      <section className="how-it-works">
        <h3>{tr("A simple way to get things moving")}</h3>
        <div>
          {[
            [
              "01",
              "Share your requirement",
              "Choose a service and tell us what you need.",
            ],
            [
              "02",
              "Get a confirmation",
              "Your team reviews the request and contacts you.",
            ],
            [
              "03",
              "Track it in one place",
              "Follow progress under My submissions.",
            ],
          ].map(([num, title, body]) => (
            <article key={num}>
              <span>{num}</span>
              <div>
                <h4>{tr(title)}</h4>
                <p>{tr(body)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      {request && (
        <TicketForm service={request} onClose={() => setRequest(null)} />
      )}
    </>
  );
}

const resources = [
  {
    name: "Rajasthan RERA",
    category: "OFFICIAL RESOURCE",
    description:
      "Search registered projects and agents on the state regulator’s website.",
    url: "https://rera.rajasthan.gov.in/",
    icon: ShieldCheck,
  },
  {
    name: "Nagar Parishad Beawar",
    category: "CITY RESOURCE",
    description:
      "Visit the municipal website for local notices and civic information.",
    url: "https://www.lsg.urban.rajasthan.gov.in/content/raj/udh/nagar-parishad-beawar/en/home.html",
    icon: Building2,
  },
];
export function NewsView() {
  const c = useEstate(),
    [publish, setPublish] = useState(false),
    [selected, setSelected] = useState<News | null>(null),
    [filter, setFilter] = useState("All updates"),
    [remove, setRemove] = useState<News | null>(null);
  const rows = c.data.news.filter(
    (n) => filter === "All updates" || n.category === filter,
  );
  return (
    <>
      <PageHeader
        eyebrow={tr("NEWS & UPDATES")}
        title={tr("Stay close to what’s happening.")}
        description={tr("City updates, property announcements and useful local resources.")}
      >
        {c.can("manage_content") && (
          <Button onClick={() => setPublish(true)}>
            <Plus size={18} />
            {tr("Publish an update")}</Button>
        )}
      </PageHeader>
      <div className="resources-grid">
        {resources.map((r) => (
          <a
            className="resource-card"
            href={r.url}
            key={tr(r.name)}
            target="_blank"
            rel="noreferrer"
          >
            <span className="service-icon">
              <r.icon size={25} />
            </span>
            <div>
              <div className="eyebrow">{tr(r.category)}</div>
              <h3>{tr(r.name)}</h3>
              <p>{tr(r.description)}</p>
            </div>
            <ExternalLink size={18} />
          </a>
        ))}
      </div>
      <div className="section-heading">
        <h2>{tr("From the city & your team")}</h2>
      </div>
      <div className="chip-row">
        {[
          "All updates",
          "City news",
          "Market update",
          "Community",
          "Announcement",
        ].map((t) => (
          <button
            key={tr(t)}
            className={filter === t ? "active" : ""}
            onClick={() => setFilter(t)}
          >
            {tr(t)}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="news-grid">
          {rows.map((n) => (
            <article className="news-card" key={n.id}>
              <div className="news-category">
                <Newspaper size={18} />
                {tr(n.category)}
                <span>{date(n.published_at)}</span>
              </div>
              <h3>{n.title}</h3>
              <p>
                {n.body.slice(0, 180)}
                {n.body.length > 180 ? "…" : ""}
              </p>
              <div className="card-footer">
                <button onClick={() => setSelected(n)}>{tr("Read update")}</button>
                {c.can("manage_content") && (
                  <button
                    aria-label={tr("Remove {v0}", {v0: n.title})}
                    onClick={() => setRemove(n)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Newspaper size={29} />}
          title={tr("City updates start here")}
          description={tr("Published updates from your team will appear here. Use the official resources above for current notices.")}
        />
      )}
      {publish && <NewsForm onClose={() => setPublish(false)} />}{" "}
      {selected && (
        <Modal title={tr(selected.category)} onClose={() => setSelected(null)}>
          <p className="eyebrow">{date(selected.published_at)}</p>
          <h2>{selected.title}</h2>
          <p className="body-copy">{selected.body}</p>
          {selected.source_url && (
            <a
              className="btn outline"
              href={selected.source_url}
              target="_blank"
              rel="noreferrer"
            >
              {selected.source_name || tr("Original source")}
              <ExternalLink size={16} />
            </a>
          )}
        </Modal>
      )}
      {remove && (
        <Modal title={tr("Remove this update?")} onClose={() => setRemove(null)}>
          <p>{remove.title}</p>
          <Form
            onSubmit={async () => {
              await api("/news/" + remove.id, "DELETE");
              await c.refresh();
              setRemove(null);
              c.notify("Update removed");
            }}
          >
            <div className="form-actions">
              <Button
                variant="outline"
                type="button"
                onClick={() => setRemove(null)}
              >
                {tr("Cancel")}</Button>
              <Button variant="danger" type="submit">
                {tr("Remove update")}</Button>
            </div>
          </Form>
        </Modal>
      )}
    </>
  );
}

export function Submissions() {
  const c = useEstate(),
    [tab, setTab] = useState("properties"),
    [edit, setEdit] = useState<Property | null>(null),
    [newRequest, setNewRequest] = useState(false);
  if (!c.user)
    return (
      <>
        <PageHeader
          eyebrow={tr("MY SUBMISSIONS")}
          title={tr("Your properties. Your progress.")}
        />
        <div className="sign-in-gate">
          <div>
            <span className="service-icon">
              <LockKeyhole size={27} />
            </span>
            <h2>{tr("A home for your property journey.")}</h2>
            <p>
              {tr("Sign in to add a property, track approvals, manage service requests and revisit your saved places.")}</p>
            <Button onClick={c.signIn}>{tr("Sign in or create an account")}</Button>
            <div className="gate-features">
              <span>
                <CheckCircle2 size={17} />
                {tr("Private document uploads")}</span>
              <span>
                <CheckCircle2 size={17} />
                {tr("Clear approval status")}</span>
              <span>
                <CheckCircle2 size={17} />
                {tr("All your requests in one place")}</span>
            </div>
          </div>
          <PropertyImage
            src="/images/apartment-interior.jpg"
            alt={tr("Illustrative apartment interior")}
          />
        </div>
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow={tr("YOUR WORKSPACE")}
        title={tr("Make your next move, {v0}.", {v0: c.user.name.split(" ")[0]})}
        description={tr("Follow every listing and request, from draft to done.")}
      >
        <Button variant="outline" onClick={() => setNewRequest(true)}><Plus size={17} />{tr("New request")}</Button>
        <Button onClick={c.newProperty}>
          <Plus size={18} />
          {tr("New property")}</Button>
      </PageHeader>
      <div className="mini-stats">
        <div>
          <span>{tr("My properties")}</span>
          <strong>{c.workspace.submissions.length}</strong>
        </div>
        <div>
          <span>{tr("Awaiting review")}</span>
          <strong>
            {
              c.workspace.submissions.filter((p) => p.status === "pending")
                .length
            }
          </strong>
        </div>
        <div>
          <span>{tr("Published")}</span>
          <strong>
            {
              c.workspace.submissions.filter((p) => p.status === "approved")
                .length
            }
          </strong>
        </div>
        <div>
          <span>{tr("Saved places")}</span>
          <strong>{c.workspace.favorites.length}</strong>
        </div>
      </div>
      <div className="underlined-tabs">
        {[
          ["properties", "My properties", c.workspace.submissions.length],
          [
            "requests",
            "Service & viewing requests",
            c.workspace.tickets.length,
          ],
          ["saved", "Saved properties", c.workspace.favorites.length],
          ["bookings", "My service bookings", ""],
          ...(c.user.role === "agent" ? [["assigned", "Assigned to me", c.workspace.assignedProperties.length]] : []),
        ].map(([key, label, count]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(String(key))}
          >
            {tr(label)}
            <span>{count}</span>
          </button>
        ))}
      </div>
      {tab === "properties" &&
        (c.workspace.submissions.length ? (
          <div className="submission-list">
            {c.workspace.submissions.map((p) => (
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
                    {p.is_demo ? tr("· Demo") : ""}
                  </p>
                  <p className="muted">
                    {tr("Submitted")}{" "}{date(p.created_at)}
                    {p.review_note ? ` · ${p.review_note}` : ""}
                  </p>
                  <AssignedAgentCard agent={p.assigned_agent} />
                  <SubmissionHistory events={p.review_history} />
                  <div className="inline-actions">
                    <Button
                      variant="outline"
                      onClick={() => c.openProperty(p.id)}
                    >
                      {tr("View details")}</Button>
                    {!p.is_demo && (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          try {
                            const r = await api("/properties/" + p.id);
                            setEdit(r.property);
                          } catch (e) {
                            c.notify((e as Error).message);
                          }
                        }}
                      >
                        {tr("Edit / resubmit")}</Button>
                    )}
                    {p.status === "approved" && !p.is_demo && (
                      <select
                        aria-label={tr("Availability of {v0}", {v0: p.title})}
                        value={p.availability}
                        onChange={async (e) => {
                          try {
                            await api(
                              "/properties/" + p.id + "/availability",
                              "PATCH",
                              { availability: e.target.value },
                            );
                            await c.refresh();
                            c.notify("Availability updated");
                          } catch (err) {
                            c.notify((err as Error).message);
                          }
                        }}
                      >
                        <option value="available">{tr("Available")}</option>
                        <option
                          value={p.purpose === "sale" ? "sold" : "rented"}
                        >
                          {p.purpose === "sale" ? tr("Sold") : tr("Rented")}
                        </option>
                      </select>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={<FileText size={28} />}
            title={tr("Your first listing starts here")}
            description={tr("Add a property and track its progress through review and approval.")}
          >
            <Button onClick={c.newProperty}>
              <Plus size={17} />
              {tr("Add a property")}</Button>
          </Empty>
        ))}
      {tab === "requests" &&
        (c.workspace.tickets.length ? (
          <div className="request-list">
            {c.workspace.tickets.map((t) => (
              <article className="panel" key={t.id}>
                <div className="section-heading">
                  <h3>{t.subject}</h3>
                  <Badge status={t.status} />
                </div>
                <p className="body-copy">{t.message}</p>
                <AssignedAgentCard agent={t.assigned_agent} />
                <SubmissionHistory events={t.review_history} />
                {t.note && <p className="notice">{tr("Team response:")}{" "}{t.note}</p>}
                <p className="muted">
                  {date(t.created_at)} {tr("· Request")}{" "}{t.id.slice(0, 8)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={<CalendarDays size={28} />}
            title={tr("No requests yet")}
            description={tr("Request a service or arrange a viewing from a real property listing.")}
          >
            <Button variant="outline" onClick={() => c.navigate("services")}>
              {tr("Explore services")}</Button>
          </Empty>
        ))}
      {tab === "bookings" && <Bookings/>}
      {tab === "saved" &&
        (c.workspace.favorites.length ? (
          <div className="property-grid database-grid">
            {c.data.properties
              .filter((p) => c.workspace.favorites.includes(p.id))
              .map((p) => (
                <PropertyCard p={p} key={p.id} />
              ))}
          </div>
        ) : (
          <Empty
            icon={<Heart size={28} />}
            title={tr("Keep your favourites close")}
            description={tr("Tap the heart on any property to save it here.")}
          >
            <Button variant="outline" onClick={() => c.navigate("properties")}>
              {tr("Explore properties")}</Button>
          </Empty>
        ))}
      {tab === "assigned" && c.user.role === "agent" && (
        c.workspace.assignedProperties.length ? <div className="property-grid database-grid">{c.workspace.assignedProperties.map(p=><PropertyCard key={p.id} p={p} />)}</div> : <Empty title={tr("No properties assigned yet")} description={tr("Properties assigned to you by your manager will appear here.")} />
      )}
      {newRequest && <TicketForm onClose={() => setNewRequest(false)} />}
      {edit && <PropertyForm existing={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
