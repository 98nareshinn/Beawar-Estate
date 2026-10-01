import { NewsHub } from "./news-hub";
import { NotificationBell, MyChat } from "./chats";
import { Marketplace } from "./marketplace";
import { Explorer } from "./explorer";
import { tr, locale, actionLabel } from "./localization";
import { getPreferences, subscribePreferences, setPreferences } from "./preferences";
import { hasPermission, canOpenPage } from "./access";
import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import {
  House,
  LayoutDashboard,
  Grid2X2,
  Building2,
  Newspaper,
  FolderUp,
  CheckCircle2,
  UsersRound,
  ShieldCheck,
  Settings2,
  Plus,
  ChevronDown,
  MapPin,
  LogOut,
  UserRound,
  Menu,
  X,
  LoaderCircle,
  Mail,
  Sun,
  Moon,
  Languages,
} from "lucide-react";
import { Estate } from "./context";
import { api } from "./api";
import type { Page, PublicData, Workspace, User, Property, NotificationItem } from "./types";
import { roleLabel } from "./types";
import { Avatar, Button, Modal, Empty } from "./ui";
import { AuthModal, PropertyForm, PropertyDetail, TicketForm } from "./forms";
import {
  Dashboard,
  Properties,
  Services,
  NewsView,
  Submissions,
} from "./views";
import { Approvals, Agents, HeadAdmin, Settings } from "./management";

const emptyWorkspace: Workspace = {
  submissions: [],
  favorites: [],
  tickets: [],
  queue: [],
  reviewTickets: [],
  agents: [],
  users: [],
  audit: [],
  assignedProperties: [],
};
const emptyData: PublicData = {
  properties: [],
  agents: [],
  news: [],
  services: [],
  settings: {
    brandName: "Beawar Estate",
    tagline: "Your city. Your next address.",
  },
  googleClientId: "",
};
const pages: Page[] = [
  "dashboard",
  "services",
  "properties",
  "news",
  "submissions",
  "chat",
  "approvals",
  "agents",
  "admin",
  "settings",
];
function locationPage(): Page {
  const value = window.location.pathname
    .replace(/^\//, "")
    .split("/")[0] as Page;
  return pages.includes(value) ? value : "dashboard";
}
export default function App() {
  const preferences = useSyncExternalStore(subscribePreferences, getPreferences);
  const [data, setData] = useState(emptyData),
    [user, setUser] = useState<User | null>(null),
    [workspace, setWorkspace] = useState(emptyWorkspace),
    [notifications, setNotifications] = useState<NotificationItem[]>([]),
    [chatFocus, setChatFocus] = useState<NotificationItem | undefined>(),
    [page, setPage] = useState<Page>(locationPage),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [auth, setAuth] = useState(false),
    [propertyForm, setPropertyForm] = useState<Property | "new" | null>(null),
    [detail, setDetail] = useState<Property | null>(null),
    [request, setRequest] = useState<Property | null>(null),
    [toast, setToast] = useState(""),
    [policy, setPolicy] = useState<"privacy" | "terms" | null>(null);
  const refresh = useCallback(async () => {
    const [d, m] = await Promise.all([
      api<PublicData>("/public"),
      api<{ user: User | null }>("/me"),
    ]);
    setData(d);
    setUser(m.user);
    if (m.user) {
      const [nextWorkspace, nextNotifications] = await Promise.all([
        api<Workspace>("/me/workspace"),
        api<{ notifications: NotificationItem[] }>("/notifications"),
      ]);
      setWorkspace(nextWorkspace);
      setNotifications(nextNotifications.notifications);
    } else {
      setWorkspace(emptyWorkspace);
      setNotifications([]);
    }
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void load();
    const pop = () => setPage(locationPage());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [load]);
  useEffect(() => { const update=()=>{if(document.visibilityState==='visible') void refresh().catch(()=>{});};const timer=setInterval(update,60000);window.addEventListener("focus",update);return()=>{clearInterval(timer);window.removeEventListener("focus",update);};},[refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  function can(permission: string) { return hasPermission(user, permission); }
  function navigate(next: Page) {
    setPage(next);
    window.history.pushState({}, "", next === "dashboard" ? "/" : "/" + next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const newProperty = () => (user ? setPropertyForm("new") : setAuth(true));
  async function openProperty(id: string) {
    try {
      const r = await api("/properties/" + id);
      setDetail(r.property);
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  const nav: { id: Page; label: string; icon: typeof House; count?: number }[] =
    [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "services", label: "Services", icon: Grid2X2 },
      { id: "properties", label: "Property database", icon: Building2 },
      { id: "news", label: "News & updates", icon: Newspaper },
      { id: "submissions", label: "My submissions", icon: FolderUp },
      ...(user ? [{ id: "chat" as Page, label: "My Chat", icon: Mail, count: notifications.filter((item) => !item.read_at).length }] : []),
      ...(can("approve") || can("review_documents")
        ? [
            {
              id: "approvals" as Page,
              label: "Approvals",
              icon: CheckCircle2,
              count: workspace.queue.length,
            },
          ]
        : []),
      ...(can("manage_agents") ? [{ id: "agents" as Page, label: "Agents", icon: UsersRound }] : []),
      ...(user?.role === "head_admin"
        ? [{ id: "admin" as Page, label: "Head admin", icon: ShieldCheck }]
        : []),
    ];
  let content: React.ReactNode;
  const guarded = !canOpenPage(user,page);
  if (guarded)
    content = (
      <Empty
        icon={<ShieldCheck size={30} />}
        title={tr("This workspace requires permission")}
        description={tr("Sign in with an authorized account, or contact your head admin.")}
      >
        <Button onClick={() => setAuth(true)}>{tr("Sign in")}</Button>
      </Empty>
    );
  else
    content =
      page === "dashboard" ? (
        <Explorer />
      ) : page === "services" ? (
        <Marketplace />
      ) : page === "properties" ? (
        <Properties />
      ) : page === "news" ? (
        <NewsHub />
      ) : page === "submissions" ? (
        <Submissions />
      ) : page === "chat" ? (
        <MyChat focus={chatFocus} />
      ) : page === "approvals" ? (
        <Approvals />
      ) : page === "agents" ? (
        <Agents />
      ) : page === "admin" ? (
        <HeadAdmin />
      ) : (
        <Settings />
      );
  return (
    <Estate.Provider
      value={{
        data,
        user,
        workspace,
        setUser,
        refresh,
        notify: setToast,
        page,
        navigate,
        signIn: () => setAuth(true),
        can,
        openProperty,
        newProperty,
      }}
    >
      <a href="#main-content" className="skip-link">
        {tr("Skip to content")}</a>
      <header className="site-header">
        <div className="topbar">
          <button
            className="brand"
            onClick={() => navigate("dashboard")}
            aria-label={tr("Beawar Estate home")}
          >
            {data.settings.logo ? (
              <img src={data.settings.logo} alt="" />
            ) : (
              <span className="brand-mark">
                <House size={25} />
              </span>
            )}
            <span>
              {tr(data.settings.brandName)}
              <small>{tr("LOCAL ROOTS. NEW BEGINNINGS.")}</small>
            </span>
          </button>
          <div className="location-pill">
            <MapPin size={16} />
            <span>{tr("Beawar, Rajasthan")}</span>
            <span className="city-only">{tr("Your local property network")}</span>
          </div>
          <div className="header-actions">
            <div className="display-preferences">
              <label className="language-control"><Languages size={17} /><select aria-label={tr("Website language")} value={preferences.language} onChange={e=>setPreferences({language:e.target.value as "hi"|"en"})}><option value="hi">हिंदी</option><option value="en" lang="en">English</option></select></label>
              <button className="theme-toggle icon-btn" aria-label={preferences.theme === "light" ? tr("Switch to dark mode") : tr("Switch to light mode")} title={preferences.theme === "light" ? tr("Switch to dark mode") : tr("Switch to light mode")} onClick={()=>setPreferences({theme:preferences.theme === "light" ? "dark" : "light"})}>{preferences.theme === "light" ? <Moon size={19} /> : <Sun size={19} />}</button>
            </div>
            <Button
              variant="outline"
              className="header-list"
              onClick={newProperty}
            >
              <Plus size={17} />
              {tr("List property")}</Button>
            {user && <NotificationBell items={notifications} onRead={async (item) => { await api("/notifications/" + item.id + "/read", "POST"); setNotifications((current) => current.map((value) => value.id === item.id ? { ...value, read_at: value.read_at || new Date().toISOString() } : value)); }} onReadAll={async () => { await api("/notifications/read-all", "POST"); setNotifications((current) => current.map((value) => ({ ...value, read_at: value.read_at || new Date().toISOString() }))); }} onOpenChat={(item) => { setChatFocus(item); navigate("chat"); }} />}
            {user ? (
              <details className="profile-menu">
                <summary>
                  <Avatar name={user.name} src={user.avatar} />
                  <span>
                    <strong>{user.name.split(" ")[0]}</strong>
                    <small>{tr(roleLabel[user.role])}</small>
                  </span>
                  <ChevronDown size={16} />
                </summary>
                <div className="profile-dropdown">
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                  <button
                    onClick={() => {
                      navigate("settings");
                      document
                        .querySelector(".profile-menu")
                        ?.removeAttribute("open");
                    }}
                  >
                    <UserRound size={17} />
                    {tr("My profile")}</button>
                  <button
                    onClick={async () => {
                      try {
                        await api("/auth/logout", "POST");
                        setUser(null);
                        setWorkspace(emptyWorkspace);
                        setNotifications([]);
                        setChatFocus(undefined);
                        navigate("dashboard");
                        setToast("You have signed out.");
                      } catch (e) {
                        setToast((e as Error).message);
                      }
                    }}
                  >
                    <LogOut size={17} />
                    {tr("Sign out")}</button>
                </div>
              </details>
            ) : (
              <Button className="sign-in-button" onClick={() => setAuth(true)}>
                <UserRound size={16} />
                {tr("Sign in")}</Button>
            )}
          </div>
        </div>
        <div className="nav-container">
          <nav className="top-nav" aria-label={tr("Main navigation")}>
            {nav.map((n) => (
              <button
                key={n.id}
                aria-current={page === n.id ? "page" : undefined}
                className={page === n.id ? "active" : ""}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={17} />
                <span>{tr(n.label)}</span>
                {!!n.count && <span className="nav-count">{n.count}</span>}
              </button>
            ))}
          </nav>
          {user && <button
            className={`settings-nav ${page === "settings" ? "active" : ""}`}
            aria-label={tr("Settings")}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} />
          </button>}
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="main-shell">
        {loading ? (
          <div
            className="loading-surface"
            aria-label={tr("Loading property dashboard")}
          >
            <div className="skeleton skeleton-title" />
            <div className="stats-grid">
              {[1, 2, 3, 4].map((n) => (
                <div className="skeleton skeleton-stat" key={n} />
              ))}
            </div>
            <div className="skeleton skeleton-filter" />
            <div className="property-grid">
              {[1, 2, 3].map((n) => (
                <div className="skeleton skeleton-card" key={n} />
              ))}
            </div>
            <p>
              <LoaderCircle className="spin" size={18} />
              {tr("Loading your property network…")}</p>
          </div>
        ) : error ? (
          <Empty
            title={tr("We couldn't load the property network")}
            description={tr(error)}
          >
            <Button onClick={() => void load()}>{tr("Try again")}</Button>
          </Empty>
        ) : (
          <div className="page-enter" key={page}>
            {content}
          </div>
        )}
      </main>
      <footer className="site-footer">
        <div>
          <span className="footer-brand">
            <House size={18} />
            {tr(data.settings.brandName)}
          </span>
          <span>{tr(data.settings.tagline)}</span>
        </div>
        <div>
          <button onClick={() => setPolicy("privacy")}>{tr("Privacy policy")}</button>
          <button onClick={() => setPolicy("terms")}>{tr("Terms of use")}</button>
          {data.settings.contactEmail && (
            <a href={"mailto:" + data.settings.contactEmail}>{tr("Contact")}</a>
          )}
          <span>{tr("Made for Beawar.")}</span>
        </div>
      </footer>
      {auth && <AuthModal onClose={() => setAuth(false)} />}{" "}
      {propertyForm && (
        <PropertyForm
          existing={propertyForm === "new" ? undefined : propertyForm}
          onClose={() => setPropertyForm(null)}
        />
      )}{" "}
      {detail && (
        <PropertyDetail
          p={detail}
          onClose={() => setDetail(null)}
          onEdit={(p) => {
            setDetail(null);
            setPropertyForm(p);
          }}
          onRequest={(p) => {
            setDetail(null);
            setRequest(p);
          }}
        />
      )}
      {request && (
        <TicketForm property={request} onClose={() => setRequest(null)} />
      )}{" "}
      {policy && (
        <Modal
          title={policy === "privacy" ? tr("Privacy policy") : tr("Terms of use")}
          onClose={() => setPolicy(null)}
        >
          <p className="body-copy">{tr(data.settings[policy])}</p>
          {data.settings.contactEmail && (
            <a href={"mailto:" + data.settings.contactEmail}>
              {data.settings.contactEmail}
            </a>
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{tr(toast)}</span>
          <button
            onClick={() => setToast("")}
            aria-label={tr("Dismiss notification")}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </Estate.Provider>
  );
}
