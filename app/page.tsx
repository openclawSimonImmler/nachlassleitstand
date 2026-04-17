"use client";

import type { ReactNode } from "react";
import { FormEvent, startTransition, useDeferredValue, useEffect, useState } from "react";
import type {
  ActivityRecord,
  AssetRecord,
  BootstrapPayload,
  ChecklistRecord,
  ContactRecord,
  RequestRecord,
  User,
  VaultRecord,
} from "@/lib/types";

const STORAGE_KEYS = {
  user: "digitalernachlass-demo-user",
  session: "digitalernachlass-demo-session",
};

const navItems = [
  { id: "dashboard", label: "Leitstand", short: "01" },
  { id: "assets", label: "Assets", short: "02" },
  { id: "vault", label: "Tresor", short: "03" },
  { id: "contacts", label: "Vertrauenspersonen", short: "04" },
  { id: "requests", label: "Anfragen", short: "05" },
  { id: "workflow", label: "Abläufe", short: "06" },
  { id: "settings", label: "Einstellungen", short: "07" },
] as const;

const requestTransitions = [
  {
    label: "In juristische Prüfung",
    status: "In Prüfung",
    nextStep: "Juristische Zweitprüfung und Dokumentabgleich eingeleitet",
  },
  {
    label: "Freigeben",
    status: "Freigegeben",
    nextStep: "Zugriffspaket kann an berechtigte Rolle ausgegeben werden",
  },
  {
    label: "Rückfrage senden",
    status: "Rückfrage gesendet",
    nextStep: "Zusätzliche Nachweise wurden beim Antragsteller angefordert",
  },
];

const defaultAuthFeedback = { message: "", type: "" as "" | "error" | "success" };

function formatNow() {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
}

function initialsFromName(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value.includes("frei") || value.includes("aktiv") || value.includes("erledigt") || value.includes("bereit")) {
    return "positive";
  }
  if (value.includes("prüfung") || value.includes("arbeit") || value.includes("ausstehend")) {
    return "warning";
  }
  if (value.includes("rückfrage") || value.includes("offen") || value.includes("fällig")) {
    return "critical";
  }
  return "neutral";
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function StatusPill({ children, tone }: { children: string; tone?: string }) {
  return <span className={`status-pill ${tone ?? statusTone(children)}`}>{children}</span>;
}

function SectionHeader({
  eyebrow,
  title,
  copy,
  actions,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="section-copy">{copy}</p>
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

export default function HomePage() {
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [authFeedback, setAuthFeedback] = useState(defaultAuthFeedback);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<(typeof navItems)[number]["id"]>("dashboard");
  const [toast, setToast] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [vaultItems, setVaultItems] = useState<VaultRecord[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRecord[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);

  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [registerData, setRegisterData] = useState({ name: "", email: "", password: "" });
  const [assetForm, setAssetForm] = useState({
    name: "",
    provider: "",
    category: "Kommunikation",
    accessLevel: "Nur Executor",
    contactName: "Anna Weber",
    rule: "",
  });
  const [contactForm, setContactForm] = useState({
    name: "",
    relation: "",
    email: "",
    phone: "",
    role: "Familienkontakt",
    scope: "",
  });
  const [vaultForm, setVaultForm] = useState({
    title: "",
    category: "Persönlich",
    visibility: "Familie nach Prüfung",
    retention: "Unbegrenzt",
    summary: "",
  });
  const [requestForm, setRequestForm] = useState({
    requesterName: "Anna Weber",
    relation: "Ehepartnerin",
    scope: "Kommunikation + persönliche Hinweise",
    evidenceStatus: "Sterbeurkunde liegt vor",
  });

  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());

  async function loadDatabaseData() {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Daten konnten nicht geladen werden.");
    }

    const data = (await response.json()) as BootstrapPayload;
    setAssets(data.assets);
    setContacts(data.contacts);
    setVaultItems(data.vaultItems);
    setRequests(data.requests);
    setChecklist(data.checklist);
    setActivities(data.activities);
  }

  useEffect(() => {
    const storedUser = window.localStorage.getItem(STORAGE_KEYS.user);
    const storedSession = window.localStorage.getItem(STORAGE_KEYS.session);

    if (storedUser && storedSession) {
      try {
        const user = JSON.parse(storedUser) as User;
        const session = JSON.parse(storedSession) as { email: string };
        if (user.email === session.email) {
          setCurrentUser(user);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEYS.user);
        window.localStorage.removeItem(STORAGE_KEYS.session);
      }
    }

    loadDatabaseData()
      .catch(() => {
        setToast("SQLite-Daten konnten nicht geladen werden.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const completedChecklist = checklist.filter((item) => item.status === "Erledigt").length;
  const readinessScore = checklist.length === 0 ? 0 : Math.round((completedChecklist / checklist.length) * 100);
  const activeRequests = requests.filter((item) => item.status !== "Freigegeben").length;
  const protectedAssets = assets.filter((item) => item.status === "Aktiv").length;

  const filteredAssets = deferredSearch
    ? assets.filter((item) =>
        [item.name, item.provider, item.category, item.contactName, item.rule].some((field) =>
          field.toLowerCase().includes(deferredSearch),
        ),
      )
    : assets;

  const filteredContacts = deferredSearch
    ? contacts.filter((item) =>
        [item.name, item.relation, item.role, item.scope].some((field) => field.toLowerCase().includes(deferredSearch)),
      )
    : contacts;

  const filteredVaultItems = deferredSearch
    ? vaultItems.filter((item) =>
        [item.title, item.category, item.visibility, item.summary].some((field) =>
          field.toLowerCase().includes(deferredSearch),
        ),
      )
    : vaultItems;

  const filteredRequests = deferredSearch
    ? requests.filter((item) =>
        [item.label, item.requesterName, item.scope, item.status, item.nextStep].some((field) =>
          field.toLowerCase().includes(deferredSearch),
        ),
      )
    : requests;

  function showFeedback(message: string, type: "" | "error" | "success" = "") {
    setAuthFeedback({ message, type });
  }

  function persistUser(user: User) {
    window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  }

  function persistSession(user: User) {
    window.localStorage.setItem(
      STORAGE_KEYS.session,
      JSON.stringify({ email: user.email, loggedInAt: new Date().toISOString() }),
    );
  }

  function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = registerData.name.trim();
    const email = registerData.email.trim().toLowerCase();
    const password = registerData.password;

    if (!name || !email || password.length < 8) {
      showFeedback("Bitte einen vollständigen Namen, eine gültige E-Mail und ein Passwort mit mindestens 8 Zeichen eingeben.", "error");
      return;
    }

    const user = { name, email, password };
    persistUser(user);
    setRegisterData({ name: "", email: "", password: "" });
    setLoginData({ email, password: "" });
    setAuthTab("login");
    showFeedback("Konto wurde lokal angelegt. Melden Sie sich jetzt mit den hinterlegten Daten an.", "success");
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawUser = window.localStorage.getItem(STORAGE_KEYS.user);
    if (!rawUser) {
      setAuthTab("register");
      showFeedback("Für diese lokale Demo ist noch kein Konto hinterlegt. Bitte zuerst registrieren.", "error");
      return;
    }

    const user = JSON.parse(rawUser) as User;
    if (user.email !== loginData.email.trim().toLowerCase() || user.password !== loginData.password) {
      showFeedback("Die Anmeldedaten stimmen nicht überein.", "error");
      return;
    }

    persistSession(user);
    setCurrentUser(user);
    setAuthFeedback(defaultAuthFeedback);
    setLoginData({ email: "", password: "" });
    setToast(`Willkommen zurück, ${user.name}.`);
  }

  function logout() {
    window.localStorage.removeItem(STORAGE_KEYS.session);
    setCurrentUser(null);
    setCurrentView("dashboard");
    setToast("Sitzung wurde beendet.");
  }

  async function syncAfterMutation(message: string, targetView?: (typeof navItems)[number]["id"]) {
    await loadDatabaseData();
    if (targetView) {
      startTransition(() => setCurrentView(targetView));
    }
    setToast(message);
  }

  async function withSubmission(task: () => Promise<void>) {
    setIsSubmitting(true);
    try {
      await task();
    } catch {
      setToast("Die Aktion konnte nicht verarbeitet werden.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withSubmission(async () => {
      const payload = {
        name: assetForm.name.trim(),
        provider: assetForm.provider.trim(),
        category: assetForm.category,
        owner: currentUser?.name ?? "Eigentümer",
        accessLevel: assetForm.accessLevel,
        contactName: assetForm.contactName.trim(),
        rule: assetForm.rule.trim(),
        lastReview: new Intl.DateTimeFormat("de-DE").format(new Date()),
        status: "Aktiv",
      };

      if (!payload.name || !payload.provider || !payload.contactName || !payload.rule) {
        setToast("Bitte Asset, Anbieter, Ansprechpartner und Freigaberegel vollständig erfassen.");
        return;
      }

      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("asset");
      }

      setAssetForm({
        name: "",
        provider: "",
        category: "Kommunikation",
        accessLevel: "Nur Executor",
        contactName: contacts[0]?.name ?? "Anna Weber",
        rule: "",
      });
      await syncAfterMutation("Asset wurde in den Nachlassbestand übernommen.", "assets");
    });
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withSubmission(async () => {
      const payload = {
        ...contactForm,
        name: contactForm.name.trim(),
        relation: contactForm.relation.trim(),
        email: contactForm.email.trim().toLowerCase(),
        phone: contactForm.phone.trim(),
        scope: contactForm.scope.trim(),
        verificationStatus: "Einladung versendet",
        responseExpectation: "Reaktion innerhalb von 24 Stunden",
        status: "Ausstehend",
      };

      if (!payload.name || !payload.relation || !payload.email || !payload.phone || !payload.scope) {
        setToast("Bitte Kontakt vollständig mit Rolle, Kontaktkanal und Zuständigkeitsbereich erfassen.");
        return;
      }

      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("contact");
      }

      setContactForm({
        name: "",
        relation: "",
        email: "",
        phone: "",
        role: "Familienkontakt",
        scope: "",
      });
      await syncAfterMutation("Vertrauensperson wurde angelegt und zur Bestätigung vorgemerkt.", "contacts");
    });
  }

  async function submitVaultItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withSubmission(async () => {
      const payload = {
        ...vaultForm,
        title: vaultForm.title.trim(),
        summary: vaultForm.summary.trim(),
        updatedAt: new Intl.DateTimeFormat("de-DE").format(new Date()),
        status: "Freigabebereit",
      };

      if (!payload.title || !payload.summary) {
        setToast("Bitte Titel und Kurzbeschreibung für den Tresoreintrag ausfüllen.");
        return;
      }

      const response = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("vault");
      }

      setVaultForm({
        title: "",
        category: "Persönlich",
        visibility: "Familie nach Prüfung",
        retention: "Unbegrenzt",
        summary: "",
      });
      await syncAfterMutation("Tresoreintrag wurde versioniert abgelegt.", "vault");
    });
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withSubmission(async () => {
      const payload = {
        label: `REQ-${new Date().getFullYear()}-${String(requests.length + 105).padStart(3, "0")}`,
        requesterName: requestForm.requesterName.trim(),
        relation: requestForm.relation.trim(),
        scope: requestForm.scope.trim(),
        evidenceStatus: requestForm.evidenceStatus.trim(),
        status: "Neu eingegangen",
        submittedAt: formatNow(),
        nextStep: "Formale Vollständigkeitsprüfung wurde automatisch gestartet",
      };

      if (!payload.requesterName || !payload.relation || !payload.scope || !payload.evidenceStatus) {
        setToast("Bitte Antragsteller, Beziehung, Umfang und Nachweisstatus angeben.");
        return;
      }

      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("request");
      }

      await syncAfterMutation("Anfrage wurde mit Prüfpfad und Aktivitätsprotokoll angelegt.", "requests");
    });
  }

  async function moveRequest(id: number, status: string, nextStep: string) {
    await withSubmission(async () => {
      const response = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, nextStep }),
      });

      if (!response.ok) {
        throw new Error("request-update");
      }

      await syncAfterMutation("Anfragestatus wurde aktualisiert.", "requests");
    });
  }

  async function toggleChecklistItem(item: ChecklistRecord) {
    const nextStatus = item.status === "Erledigt" ? "Offen" : "Erledigt";
    await withSubmission(async () => {
      const response = await fetch(`/api/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        throw new Error("checklist");
      }

      await syncAfterMutation("Bereitschaftsstatus wurde neu berechnet.", "workflow");
    });
  }

  function openSearchResult() {
    const value = deferredSearch;
    if (!value) {
      setToast("Bitte einen Suchbegriff eingeben.");
      return;
    }

    if (filteredAssets.length > 0) {
      startTransition(() => setCurrentView("assets"));
      setToast("Passende Assets geöffnet.");
      return;
    }
    if (filteredContacts.length > 0) {
      startTransition(() => setCurrentView("contacts"));
      setToast("Passende Vertrauenspersonen geöffnet.");
      return;
    }
    if (filteredVaultItems.length > 0) {
      startTransition(() => setCurrentView("vault"));
      setToast("Passende Tresoreinträge geöffnet.");
      return;
    }
    if (filteredRequests.length > 0) {
      startTransition(() => setCurrentView("requests"));
      setToast("Passende Anfragen geöffnet.");
      return;
    }

    setToast(`Keine Treffer für "${searchValue}".`);
  }

  function exportWorkspaceSnapshot() {
    const payload = {
      exportedAt: new Date().toISOString(),
      owner: currentUser?.name ?? "Unbekannt",
      summary: {
        readinessScore,
        assets: assets.length,
        contacts: contacts.length,
        vaultItems: vaultItems.length,
        requests: requests.length,
      },
      assets,
      contacts,
      vaultItems,
      requests,
      checklist,
      activities,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nachlass-leitstand-export.json";
    link.click();
    window.URL.revokeObjectURL(url);
    setToast("Lokaler Export wurde als JSON-Datei vorbereitet.");
  }

  if (!currentUser) {
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <div className="auth-badge">Digitale Nachlassvorsorge</div>
          <h1>Verlässliche Prozesse für digitale Vermögenswerte, Dokumente und Freigaben.</h1>
          <p className="subtext">
            Diese lokale MVP-Version bildet einen glaubwürdigen Leitstand für digitale Nachlassplanung ab: mit Tresor,
            Vertrauenspersonen, Anfrageprüfung und nachvollziehbarer Aktivitätshistorie.
          </p>

          <div className="auth-grid">
            <article className="auth-card">
              <strong>Rechtssichere Struktur</strong>
              <p>Assets, Rollen, Nachweise und Freigaberegeln werden sauber getrennt dokumentiert.</p>
            </article>
            <article className="auth-card">
              <strong>Lokaler Betrieb</strong>
              <p>Keine externen Dienste, keine Zugangsschlüssel. Alle Demo-Daten bleiben im Projekt und im Browser.</p>
            </article>
            <article className="auth-card">
              <strong>Prüfbare Abläufe</strong>
              <p>Bereitschafts-Checkliste, Anfrage-Queue und Export machen den Prototyp belastbar für Demos.</p>
            </article>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-panel-head">
            <p className="eyebrow">Sicherer Zugang</p>
            <h2>Projektzugang</h2>
            <p className="section-copy">Anmeldung und Registrierung funktionieren lokal im Browser und personalisieren den Leitstand.</p>
          </div>

          <div className="auth-tabs">
            <button className={`tab-button${authTab === "login" ? " active" : ""}`} onClick={() => setAuthTab("login")}>
              Anmelden
            </button>
            <button
              className={`tab-button${authTab === "register" ? " active" : ""}`}
              onClick={() => setAuthTab("register")}
            >
              Registrieren
            </button>
          </div>

          <form className={`auth-form${authTab === "login" ? " is-visible" : ""}`} onSubmit={handleLogin}>
            <label>
              E-Mail
              <input
                type="email"
                value={loginData.email}
                onChange={(event) => setLoginData((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="name@beispiel.de"
                required
              />
            </label>
            <label>
              Passwort
              <input
                type="password"
                value={loginData.password}
                onChange={(event) => setLoginData((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Mindestens 8 Zeichen"
                required
              />
            </label>
            <button className="button primary" type="submit">
              Zugang öffnen
            </button>
            <p className="micro-copy">Die Sitzung wird nur lokal gespeichert und kann jederzeit zurückgesetzt werden.</p>
          </form>

          <form className={`auth-form${authTab === "register" ? " is-visible" : ""}`} onSubmit={handleRegister}>
            <label>
              Vollständiger Name
              <input
                type="text"
                value={registerData.name}
                onChange={(event) => setRegisterData((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Max Mustermann"
                required
              />
            </label>
            <label>
              E-Mail
              <input
                type="email"
                value={registerData.email}
                onChange={(event) => setRegisterData((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="name@beispiel.de"
                required
              />
            </label>
            <label>
              Passwort
              <input
                type="password"
                value={registerData.password}
                onChange={(event) => setRegisterData((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Mindestens 8 Zeichen"
                required
              />
            </label>
            <button className="button primary" type="submit">
              Konto lokal anlegen
            </button>
            <p className="micro-copy">Die Registrierung dient dem Demo-Zugang und ersetzt kein produktives Identity-System.</p>
          </form>

          <p className={`auth-feedback${authFeedback.type ? ` ${authFeedback.type}` : ""}`}>{authFeedback.message}</p>
        </section>

        <div className={`toast${toast ? " visible" : ""}`}>{toast}</div>
      </main>
    );
  }

  return (
    <main className={`app-shell${isSubmitting ? " busy" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">NL</div>
          <div>
            <p className="brand-kicker">Nachlassleitstand</p>
            <strong>Akte v1</strong>
          </div>
        </div>

        <div className="sidebar-card">
          <span>Bereitschaft</span>
          <strong>{readinessScore}% abgesichert</strong>
          <p>{completedChecklist} von {checklist.length} Kernaufgaben abgeschlossen.</p>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item${currentView === item.id ? " active" : ""}`}
              onClick={() => startTransition(() => setCurrentView(item.id))}
            >
              <span>{item.short}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p>Lokaler Betrieb mit SQLite</p>
          <strong>Keine externen Abhängigkeiten</strong>
          <span>Geeignet für Demo, Validierung und weiteres Produktdesign.</span>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Seriöse digitale Nachlassverwaltung</p>
            <h1>Kontrollierte Übergaben statt unstrukturierter Notfallordner.</h1>
            <p className="section-copy">
              Der Leitstand bündelt Nachlassvermögen, Vertrauensrollen, Dokumententresor und Freigaben in einem klaren operativen Modell.
            </p>
          </div>

          <div className="topbar-side">
            <div className="search">
              <input
                type="text"
                placeholder="Suche nach Asset, Kontakt, Dokument oder Anfrage"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    openSearchResult();
                  }
                }}
              />
              <button className="button ghost" onClick={openSearchResult}>
                Öffnen
              </button>
            </div>

            <div className="topbar-actions">
              <button className="button ghost" onClick={exportWorkspaceSnapshot}>
                Export
              </button>
              <button className="button ghost" onClick={() => startTransition(() => setCurrentView("workflow"))}>
                Checkliste
              </button>
              <div className="profile">
                <div className="avatar">{initialsFromName(currentUser.name) || "NL"}</div>
                <div>
                  <strong>{currentUser.name}</strong>
                  <span>Eigentümer</span>
                </div>
              </div>
              <button className="button ghost" onClick={logout}>
                Abmelden
              </button>
            </div>
          </div>
        </header>

        {isLoading ? (
          <section className="loading-panel">
            <p>Datenbestand wird geladen...</p>
          </section>
        ) : (
          <div className="content">
            {currentView === "dashboard" && (
              <>
                <section className="hero">
                  <div>
                    <p className="eyebrow">MVP Fokus</p>
                    <h2>Der operative Stand ist nachvollziehbar und vorzeigbar.</h2>
                    <p className="section-copy">
                      Vermögenswerte, Zuständigkeiten und Freigaben werden nicht nur aufgelistet, sondern in einem klaren Prüf- und Übergabekontext dargestellt.
                    </p>
                  </div>
                  <div className="hero-actions">
                    <button className="button primary" onClick={() => startTransition(() => setCurrentView("requests"))}>
                      Anfrage prüfen
                    </button>
                    <button className="button ghost" onClick={() => startTransition(() => setCurrentView("vault"))}>
                      Tresor pflegen
                    </button>
                  </div>
                </section>

                <section className="metric-grid">
                  <MetricCard label="Aktive Assets" value={assets.length} detail={`${protectedAssets} Einträge sind aktuell freigabebereit.`} />
                  <MetricCard label="Vertrauensrollen" value={contacts.length} detail={`${contacts.filter((item) => item.status === "Aktiv").length} Kontakte sind bestätigt.`} />
                  <MetricCard label="Tresoreinträge" value={vaultItems.length} detail={`${vaultItems.filter((item) => item.status === "Freigabebereit").length} Inhalte warten auf definierte Ausgabe.`} />
                  <MetricCard label="Offene Vorgänge" value={activeRequests} detail="Anfragen mit Bedarf für Prüfung, Rückfrage oder Übergabe." />
                </section>

                <section className="dashboard-grid">
                  <article className="panel large">
                    <div className="panel-head">
                      <h3>Bereitschaft und Risikobild</h3>
                      <StatusPill tone={readinessScore >= 75 ? "positive" : readinessScore >= 50 ? "warning" : "critical"}>
                        {readinessScore >= 75 ? "Stabil" : readinessScore >= 50 ? "Teilweise abgesichert" : "Kritische Lücken"}
                      </StatusPill>
                    </div>
                    <div className="progress-block">
                      <div className="progress-track">
                        <div className="progress-bar" style={{ width: `${readinessScore}%` }} />
                      </div>
                      <div className="progress-meta">
                        <strong>{readinessScore}%</strong>
                        <span>Bereitschaftsgrad aus Aufgabenstatus, Rollenabdeckung und aktualisierten Tresoreinträgen.</span>
                      </div>
                    </div>
                    <div className="insight-grid">
                      <div className="insight-card">
                        <span>Höchste Priorität</span>
                        <strong>{checklist.find((item) => item.status !== "Erledigt")?.title ?? "Keine offenen Kernaufgaben"}</strong>
                        <p>Diese Aufgabe blockiert den Übergang vom guten Prototyp zur belastbaren Vorsorgeakte.</p>
                      </div>
                      <div className="insight-card">
                        <span>Rechtliche Prüfung</span>
                        <strong>{requests.filter((item) => item.status === "In Prüfung").length} Vorgänge</strong>
                        <p>Prüfpfade mit Nachweisstatus und nächstem Schritt sind im Anfragebereich direkt steuerbar.</p>
                      </div>
                      <div className="insight-card">
                        <span>Kontaktsicherheit</span>
                        <strong>{contacts.filter((item) => item.status === "Aktiv").length}/{contacts.length} bestätigt</strong>
                        <p>Vertrauenspersonen werden mit Rolle, Reichweite und Reaktionsanforderung geführt.</p>
                      </div>
                    </div>
                  </article>

                  <article className="panel">
                    <div className="panel-head">
                      <h3>Letzte Aktivität</h3>
                      <StatusPill tone="neutral">Auditfähig</StatusPill>
                    </div>
                    <div className="activity-list">
                      {activities.map((activity) => (
                        <div key={activity.id} className="activity-item">
                          <div className={`activity-dot ${activity.kind}`}></div>
                          <div>
                            <strong>{activity.title}</strong>
                            <p>{activity.detail}</p>
                            <span>{activity.createdAt}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </section>

                <section className="dashboard-grid lower">
                  <article className="panel">
                    <div className="panel-head">
                      <h3>Schützenswerte Assets</h3>
                      <button className="text-button" onClick={() => startTransition(() => setCurrentView("assets"))}>
                        Asset-Bestand öffnen
                      </button>
                    </div>
                    <div className="list-stack">
                      {assets.slice(0, 4).map((asset) => (
                        <div key={asset.id} className="list-row">
                          <div>
                            <strong>{asset.name}</strong>
                            <p>
                              {asset.provider} · {asset.contactName}
                            </p>
                          </div>
                          <div className="list-row-side">
                            <StatusPill>{asset.status}</StatusPill>
                            <span>{asset.accessLevel}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="panel">
                    <div className="panel-head">
                      <h3>Offene Freigaben</h3>
                      <button className="text-button" onClick={() => startTransition(() => setCurrentView("requests"))}>
                        Queue öffnen
                      </button>
                    </div>
                    <div className="list-stack">
                      {requests.slice(0, 4).map((request) => (
                        <div key={request.id} className="list-row">
                          <div>
                            <strong>{request.label}</strong>
                            <p>
                              {request.requesterName} · {request.scope}
                            </p>
                          </div>
                          <div className="list-row-side">
                            <StatusPill>{request.status}</StatusPill>
                            <span>{request.submittedAt}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </section>
              </>
            )}

            {currentView === "assets" && (
              <section className="section-grid">
                <article className="panel sticky">
                  <SectionHeader
                    eyebrow="Asset Register"
                    title="Digitale Vermögenswerte strukturiert erfassen"
                    copy="Jedes Asset erhält einen verantwortlichen Kontakt, eine Zugriffsebene und eine präzise Freigaberegel."
                  />
                  <form className="stack-form" onSubmit={submitAsset}>
                    <label>
                      Asset-Bezeichnung
                      <input
                        value={assetForm.name}
                        onChange={(event) => setAssetForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="z. B. Primäres E-Mail-Konto"
                      />
                    </label>
                    <label>
                      Anbieter / System
                      <input
                        value={assetForm.provider}
                        onChange={(event) => setAssetForm((prev) => ({ ...prev, provider: event.target.value }))}
                        placeholder="z. B. Google Workspace"
                      />
                    </label>
                    <div className="form-split">
                      <label>
                        Kategorie
                        <select
                          value={assetForm.category}
                          onChange={(event) => setAssetForm((prev) => ({ ...prev, category: event.target.value }))}
                        >
                          <option>Kommunikation</option>
                          <option>Finanzen</option>
                          <option>Geräte</option>
                          <option>Geschäftsbetrieb</option>
                          <option>Persönlich</option>
                        </select>
                      </label>
                      <label>
                        Zugriffsebene
                        <select
                          value={assetForm.accessLevel}
                          onChange={(event) => setAssetForm((prev) => ({ ...prev, accessLevel: event.target.value }))}
                        >
                          <option>Nur Executor</option>
                          <option>Executor + Rechtsbeistand</option>
                          <option>Familie nach Prüfung</option>
                          <option>Continuity-Team</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Verantwortliche Person
                      <input
                        value={assetForm.contactName}
                        onChange={(event) => setAssetForm((prev) => ({ ...prev, contactName: event.target.value }))}
                        placeholder="z. B. Anna Weber"
                      />
                    </label>
                    <label>
                      Freigaberegel
                      <textarea
                        value={assetForm.rule}
                        onChange={(event) => setAssetForm((prev) => ({ ...prev, rule: event.target.value }))}
                        placeholder="Beschreiben Sie, wann und unter welchen Nachweisen dieses Asset freigegeben werden darf."
                      />
                    </label>
                    <button className="button primary" type="submit">
                      Asset anlegen
                    </button>
                  </form>
                </article>

                <article className="panel">
                  <SectionHeader
                    eyebrow="Asset Bestand"
                    title="Register mit operativem Kontext"
                    copy="Suche filtert direkt über System, Kategorie, Zuständigkeit und Freigaberegel."
                  />
                  <div className="table-shell">
                    <table>
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Anbieter</th>
                          <th>Zuständigkeit</th>
                          <th>Regel</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssets.map((asset) => (
                          <tr key={asset.id}>
                            <td>
                              <strong>{asset.name}</strong>
                              <span>{asset.category}</span>
                            </td>
                            <td>{asset.provider}</td>
                            <td>
                              <strong>{asset.contactName}</strong>
                              <span>{asset.accessLevel}</span>
                            </td>
                            <td>{asset.rule}</td>
                            <td>
                              <StatusPill>{asset.status}</StatusPill>
                              <span>{asset.lastReview}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </section>
            )}

            {currentView === "vault" && (
              <section className="section-grid">
                <article className="panel sticky">
                  <SectionHeader
                    eyebrow="Sicherer Tresor"
                    title="Dokumente mit Zielgruppe und Aufbewahrung führen"
                    copy="Der Tresor verwaltet nicht nur Dateinamen, sondern Sichtbarkeit, Haltedauer und inhaltliche Kurzbeschreibung."
                  />
                  <form className="stack-form" onSubmit={submitVaultItem}>
                    <label>
                      Titel
                      <input
                        value={vaultForm.title}
                        onChange={(event) => setVaultForm((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="z. B. Zugangspaket für Hosting"
                      />
                    </label>
                    <div className="form-split">
                      <label>
                        Kategorie
                        <select
                          value={vaultForm.category}
                          onChange={(event) => setVaultForm((prev) => ({ ...prev, category: event.target.value }))}
                        >
                          <option>Persönlich</option>
                          <option>Recht</option>
                          <option>Betrieb</option>
                          <option>Vermögen</option>
                        </select>
                      </label>
                      <label>
                        Sichtbarkeit
                        <select
                          value={vaultForm.visibility}
                          onChange={(event) => setVaultForm((prev) => ({ ...prev, visibility: event.target.value }))}
                        >
                          <option>Familie nach Prüfung</option>
                          <option>Nur Executor</option>
                          <option>Continuity-Team</option>
                          <option>Nur Executor + Rechtsbeistand</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Aufbewahrung
                      <select
                        value={vaultForm.retention}
                        onChange={(event) => setVaultForm((prev) => ({ ...prev, retention: event.target.value }))}
                      >
                        <option>Unbegrenzt</option>
                        <option>36 Monate</option>
                        <option>10 Jahre</option>
                        <option>Bis Entnahme</option>
                      </select>
                    </label>
                    <label>
                      Kurzbeschreibung
                      <textarea
                        value={vaultForm.summary}
                        onChange={(event) => setVaultForm((prev) => ({ ...prev, summary: event.target.value }))}
                        placeholder="Welche Inhalte enthält der Eintrag und wann wird er gebraucht?"
                      />
                    </label>
                    <button className="button primary" type="submit">
                      Tresoreintrag speichern
                    </button>
                  </form>
                </article>

                <article className="panel">
                  <SectionHeader
                    eyebrow="Tresorbestand"
                    title="Versionierte Informationspakete"
                    copy="Geeignet für rechtliche Dokumente, persönliche Nachrichten und betriebliche Übergabepakete."
                  />
                  <div className="card-grid">
                    {filteredVaultItems.map((item) => (
                      <article key={item.id} className="document-card">
                        <div className="panel-head">
                          <div>
                            <h3>{item.title}</h3>
                            <p>{item.category}</p>
                          </div>
                          <StatusPill>{item.status}</StatusPill>
                        </div>
                        <p>{item.summary}</p>
                        <div className="document-meta">
                          <span>{item.visibility}</span>
                          <span>{item.retention}</span>
                          <span>Stand {item.updatedAt}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            )}

            {currentView === "contacts" && (
              <section className="section-grid">
                <article className="panel sticky">
                  <SectionHeader
                    eyebrow="Rollenmodell"
                    title="Vertrauenspersonen mit Reichweite und Erwartung pflegen"
                    copy="Kontakte werden nach Rolle, Verantwortungsbereich und Verifizierungsstatus geführt."
                  />
                  <form className="stack-form" onSubmit={submitContact}>
                    <label>
                      Name
                      <input
                        value={contactForm.name}
                        onChange={(event) => setContactForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="z. B. Dr. Lena Vogt"
                      />
                    </label>
                    <div className="form-split">
                      <label>
                        Beziehung
                        <input
                          value={contactForm.relation}
                          onChange={(event) => setContactForm((prev) => ({ ...prev, relation: event.target.value }))}
                          placeholder="z. B. Rechtsbeistand"
                        />
                      </label>
                      <label>
                        Rolle
                        <select
                          value={contactForm.role}
                          onChange={(event) => setContactForm((prev) => ({ ...prev, role: event.target.value }))}
                        >
                          <option>Familienkontakt</option>
                          <option>Hauptexecutorin</option>
                          <option>Rechtliche Freigabe</option>
                          <option>Business Continuity</option>
                        </select>
                      </label>
                    </div>
                    <div className="form-split">
                      <label>
                        E-Mail
                        <input
                          type="email"
                          value={contactForm.email}
                          onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))}
                          placeholder="name@beispiel.de"
                        />
                      </label>
                      <label>
                        Telefon
                        <input
                          value={contactForm.phone}
                          onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.target.value }))}
                          placeholder="+49 ..."
                        />
                      </label>
                    </div>
                    <label>
                      Zuständigkeitsbereich
                      <textarea
                        value={contactForm.scope}
                        onChange={(event) => setContactForm((prev) => ({ ...prev, scope: event.target.value }))}
                        placeholder="Welche Assets, Dokumente oder Aufgaben umfasst diese Rolle?"
                      />
                    </label>
                    <button className="button primary" type="submit">
                      Vertrauensperson anlegen
                    </button>
                  </form>
                </article>

                <article className="panel">
                  <SectionHeader
                    eyebrow="Kontaktliste"
                    title="Bestätigte Rollen und ausstehende Einladungen"
                    copy="Die Übersicht fokussiert auf Reaktionsfähigkeit und fachliche Reichweite."
                  />
                  <div className="card-grid">
                    {filteredContacts.map((contact) => (
                      <article key={contact.id} className="contact-card">
                        <div className="contact-head">
                          <div className="avatar small">{initialsFromName(contact.name)}</div>
                          <div>
                            <h3>{contact.name}</h3>
                            <p>{contact.relation}</p>
                          </div>
                        </div>
                        <div className="detail-grid">
                          <div>
                            <span>Rolle</span>
                            <strong>{contact.role}</strong>
                          </div>
                          <div>
                            <span>Status</span>
                            <StatusPill>{contact.status}</StatusPill>
                          </div>
                          <div>
                            <span>Verifikation</span>
                            <strong>{contact.verificationStatus}</strong>
                          </div>
                          <div>
                            <span>Reaktionszeit</span>
                            <strong>{contact.responseExpectation}</strong>
                          </div>
                        </div>
                        <p className="contact-scope">{contact.scope}</p>
                        <div className="contact-meta">
                          <span>{contact.email}</span>
                          <span>{contact.phone}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            )}

            {currentView === "requests" && (
              <section className="section-grid">
                <article className="panel sticky">
                  <SectionHeader
                    eyebrow="Freigabeprozess"
                    title="Anfrage mit Nachweisstatus anlegen"
                    copy="Für Demos lässt sich der gesamte Eingangspfad realistisch simulieren und anschließend weitertriagieren."
                  />
                  <form className="stack-form" onSubmit={submitRequest}>
                    <label>
                      Antragsteller
                      <input
                        value={requestForm.requesterName}
                        onChange={(event) => setRequestForm((prev) => ({ ...prev, requesterName: event.target.value }))}
                      />
                    </label>
                    <div className="form-split">
                      <label>
                        Beziehung
                        <input
                          value={requestForm.relation}
                          onChange={(event) => setRequestForm((prev) => ({ ...prev, relation: event.target.value }))}
                        />
                      </label>
                      <label>
                        Nachweisstatus
                        <input
                          value={requestForm.evidenceStatus}
                          onChange={(event) => setRequestForm((prev) => ({ ...prev, evidenceStatus: event.target.value }))}
                        />
                      </label>
                    </div>
                    <label>
                      Angeforderter Umfang
                      <textarea
                        value={requestForm.scope}
                        onChange={(event) => setRequestForm((prev) => ({ ...prev, scope: event.target.value }))}
                        placeholder="Welche Inhalte oder Zugänge sollen geprüft werden?"
                      />
                    </label>
                    <button className="button primary" type="submit">
                      Anfrage erzeugen
                    </button>
                  </form>
                </article>

                <article className="panel">
                  <SectionHeader
                    eyebrow="Prüf-Queue"
                    title="Vorgänge mit nächstem Schritt"
                    copy="Jeder Eintrag enthält Antragsteller, Scope, Nachweisstand und eine direkte Triage-Option."
                  />
                  <div className="request-stack">
                    {filteredRequests.map((request) => (
                      <article key={request.id} className="request-card">
                        <div className="panel-head">
                          <div>
                            <h3>{request.label}</h3>
                            <p>
                              {request.requesterName} · {request.relation}
                            </p>
                          </div>
                          <StatusPill>{request.status}</StatusPill>
                        </div>
                        <div className="request-grid">
                          <div>
                            <span>Umfang</span>
                            <strong>{request.scope}</strong>
                          </div>
                          <div>
                            <span>Nachweis</span>
                            <strong>{request.evidenceStatus}</strong>
                          </div>
                          <div>
                            <span>Eingang</span>
                            <strong>{request.submittedAt}</strong>
                          </div>
                          <div>
                            <span>Nächster Schritt</span>
                            <strong>{request.nextStep}</strong>
                          </div>
                        </div>
                        <div className="request-actions">
                          {requestTransitions.map((transition) => (
                            <button
                              key={transition.label}
                              className="button ghost small"
                              onClick={() => moveRequest(request.id, transition.status, transition.nextStep)}
                            >
                              {transition.label}
                            </button>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            )}

            {currentView === "workflow" && (
              <section className="section-grid">
                <article className="panel sticky">
                  <SectionHeader
                    eyebrow="Bereitschaftsmodell"
                    title="Schrittfolge für einen belastbaren MVP"
                    copy="Die Plattform zeigt nicht nur Daten, sondern macht den Reifegrad der Nachlassakte transparent."
                  />
                  <div className="workflow-steps">
                    <div className="workflow-step">
                      <strong>1. Bestand konsolidieren</strong>
                      <p>Assets erhalten Verantwortliche, Zugriffsebenen und Review-Daten.</p>
                    </div>
                    <div className="workflow-step">
                      <strong>2. Rollen absichern</strong>
                      <p>Vertrauenspersonen werden mit Erwartungshaltung und fachlicher Reichweite verifiziert.</p>
                    </div>
                    <div className="workflow-step">
                      <strong>3. Tresor strukturieren</strong>
                      <p>Rechtliche, persönliche und betriebliche Pakete werden für spätere Freigaben vorbereitet.</p>
                    </div>
                    <div className="workflow-step">
                      <strong>4. Anfrageprozess testen</strong>
                      <p>Freigaben lassen sich mit Statuswechsel, Rückfragen und Aktivitätsprotokoll demonstrieren.</p>
                    </div>
                  </div>
                </article>

                <article className="panel">
                  <SectionHeader
                    eyebrow="Checkliste"
                    title="Offene Maßnahmen mit Wirkung auf die Bereitschaft"
                    copy="Jede Änderung wird serverseitig in SQLite übernommen und im Aktivitätsprotokoll sichtbar."
                  />
                  <div className="checklist">
                    {checklist.map((item) => (
                      <button key={item.id} className="checklist-item" onClick={() => toggleChecklistItem(item)}>
                        <div>
                          <strong>{item.title}</strong>
                          <p>
                            Verantwortlich: {item.owner} · Fällig: {item.dueLabel}
                          </p>
                        </div>
                        <StatusPill>{item.status}</StatusPill>
                      </button>
                    ))}
                  </div>
                </article>
              </section>
            )}

            {currentView === "settings" && (
              <section className="settings-grid">
                <article className="panel">
                  <SectionHeader
                    eyebrow="Betriebsprinzipien"
                    title="Local-first und präsentationsfähig"
                    copy="Der MVP bleibt bewusst leichtgewichtig: Next.js App Router, SQLite, keine externen Credentials."
                  />
                  <div className="settings-list">
                    <div>
                      <strong>Datenspeicherung</strong>
                      <p>SQLite-Datei im Projektverzeichnis mit Seed-Daten für Assets, Tresor, Kontakte, Anfragen und Aktivität.</p>
                    </div>
                    <div>
                      <strong>Auth-Demo</strong>
                      <p>Lokale Registrierung und Session im Browser, ausreichend für Demo-Zwecke ohne Fremdsysteme.</p>
                    </div>
                    <div>
                      <strong>Export</strong>
                      <p>Der Leitstand kann jederzeit als JSON-Snapshot heruntergeladen werden.</p>
                    </div>
                  </div>
                </article>

                <article className="panel">
                  <SectionHeader
                    eyebrow="Empfohlene Demo-Story"
                    title="So wirkt das Produkt bereits wie ein echter v1-Leitstand"
                    copy="Zeigen Sie zuerst die Risikolage im Dashboard, dann die Rollen- und Dokumentenlogik und schließen Sie mit einer Anfrage-Triage."
                  />
                  <div className="settings-list">
                    <div>
                      <strong>1. Dashboard</strong>
                      <p>Bereitschaftsgrad, Aktivität und offene Vorgänge schaffen sofort Vertrauen in die Struktur.</p>
                    </div>
                    <div>
                      <strong>2. Tresor + Rollen</strong>
                      <p>Sichtbarkeit, Aufbewahrung und Zuständigkeiten zeigen, dass die Plattform über bloße Listen hinausgeht.</p>
                    </div>
                    <div>
                      <strong>3. Freigabeprozess</strong>
                      <p>Der Statuswechsel in der Anfrage-Queue macht den Nutzen für Legal-Tech und Nachlassorganisation greifbar.</p>
                    </div>
                  </div>
                </article>
              </section>
            )}
          </div>
        )}
      </section>

      <div className={`toast${toast ? " visible" : ""}`}>{toast}</div>
    </main>
  );
}
