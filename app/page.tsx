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
  user: "nachlassleitstand-user",
  session: "nachlassleitstand-session",
  ui: "nachlassleitstand-ui",
};

const navItems = [
  { id: "dashboard", label: "Leitstand", short: "01" },
  { id: "assets", label: "Assets", short: "02" },
  { id: "vault", label: "Tresor", short: "03" },
  { id: "contacts", label: "Vertrauenspersonen", short: "04" },
  { id: "requests", label: "Anfragen", short: "05" },
  { id: "workflow", label: "Abläufe", short: "06" },
  { id: "settings", label: "Arbeitsbereich", short: "07" },
] as const;

const requestActionMap: Record<
  string,
  Array<{ label: string; status: string; nextStep: string; tone?: "primary" | "ghost" }>
> = {
  "Neu eingegangen": [
    {
      label: "In Prüfung übernehmen",
      status: "In Prüfung",
      nextStep: "Formale Prüfung gestartet, Nachweise werden fachlich gegengeprüft.",
      tone: "primary",
    },
    {
      label: "Rückfrage anfordern",
      status: "Rückfrage gesendet",
      nextStep: "Zusätzliche Nachweise oder Präzisierungen wurden angefordert.",
    },
  ],
  "In Prüfung": [
    {
      label: "Freigeben",
      status: "Freigegeben",
      nextStep: "Vorgang freigegeben, Übergabepaket kann kontrolliert bereitgestellt werden.",
      tone: "primary",
    },
    {
      label: "Rückfrage senden",
      status: "Rückfrage gesendet",
      nextStep: "Prüfung pausiert, ergänzende Unterlagen werden erwartet.",
    },
    {
      label: "Ablehnen",
      status: "Abgelehnt",
      nextStep: "Vorgang geschlossen, Freigabe wurde auf Basis der vorliegenden Nachweise verweigert.",
    },
  ],
  "Rückfrage gesendet": [
    {
      label: "Erneut prüfen",
      status: "In Prüfung",
      nextStep: "Nachgereichte Unterlagen liegen vor und werden erneut geprüft.",
      tone: "primary",
    },
    {
      label: "Ablehnen",
      status: "Abgelehnt",
      nextStep: "Vorgang geschlossen, angeforderte Unterlagen sind ausgeblieben oder nicht ausreichend.",
    },
  ],
};

const defaultAuthFeedback = { message: "", type: "" as "" | "error" | "success" };
const defaultUiPreferences = { defaultView: "dashboard" as (typeof navItems)[number]["id"] };

function formatNow() {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
}

function formatDateLabel() {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "long",
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
  if (
    value.includes("frei") ||
    value.includes("aktiv") ||
    value.includes("erledigt") ||
    value.includes("bereit") ||
    value.includes("bestätigt")
  ) {
    return "positive";
  }
  if (
    value.includes("prüfung") ||
    value.includes("arbeit") ||
    value.includes("ausstehend") ||
    value.includes("neu")
  ) {
    return "warning";
  }
  if (value.includes("rückfrage") || value.includes("offen") || value.includes("fällig") || value.includes("abgelehnt")) {
    return "critical";
  }
  return "neutral";
}

function requestPriority(request: RequestRecord) {
  if (request.status === "Neu eingegangen") return "Hoch";
  if (request.status === "In Prüfung") return "Mittel";
  if (request.status === "Rückfrage gesendet") return "Wartet auf Antwort";
  if (request.status === "Abgelehnt") return "Geschlossen";
  return "Erledigt";
}

function requestRecommendation(request: RequestRecord) {
  if (request.status === "Neu eingegangen") {
    return "Eingang prüfen, Nachweise verifizieren und Zuständigkeit bestätigen.";
  }
  if (request.status === "In Prüfung") {
    return "Juristische oder fachliche Gegenprüfung abschließen und Freigabeentscheidung dokumentieren.";
  }
  if (request.status === "Rückfrage gesendet") {
    return "Wiedervorlage setzen und Nachreichung aktiv nachverfolgen.";
  }
  if (request.status === "Abgelehnt") {
    return "Ablehnungsgrund archivieren und keine Zugriffsrechte ausgeben.";
  }
  return "Vorgang ist abgeschlossen und sollte im Export nachvollziehbar bleiben.";
}

function getRequestActions(status: string) {
  return requestActionMap[status] ?? [];
}

function getRequestSortWeight(status: string) {
  if (status === "Neu eingegangen") return 0;
  if (status === "In Prüfung") return 1;
  if (status === "Rückfrage gesendet") return 2;
  if (status === "Freigegeben") return 3;
  if (status === "Abgelehnt") return 4;
  return 5;
}

function validateEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePhone(value: string) {
  return /^[+()\d\s/-]{7,24}$/.test(value);
}

function validatePassword(value: string) {
  return value.length >= 8 && /\d/.test(value);
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function StatusPill({ children, tone }: { children: string; tone?: string }) {
  return <span className={`status-pill ${tone ?? statusTone(children)}`}>{children}</span>;
}

function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
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

function EmptyState({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{copy}</p>
      {action}
    </div>
  );
}

async function readApiMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || "Die Aktion konnte nicht verarbeitet werden.";
  } catch {
    return "Die Aktion konnte nicht verarbeitet werden.";
  }
}

export default function HomePage() {
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [authFeedback, setAuthFeedback] = useState(defaultAuthFeedback);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<(typeof navItems)[number]["id"]>("dashboard");
  const [uiPreferences, setUiPreferences] = useState(defaultUiPreferences);
  const [toast, setToast] = useState("");
  const [loadError, setLoadError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
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
    contactName: "",
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
    requesterName: "",
    relation: "",
    scope: "",
    evidenceStatus: "",
  });

  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});
  const [assetErrors, setAssetErrors] = useState<Record<string, string>>({});
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [vaultErrors, setVaultErrors] = useState<Record<string, string>>({});
  const [requestErrors, setRequestErrors] = useState<Record<string, string>>({});

  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());

  async function loadDatabaseData() {
    setLoadError("");
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
    setLastSyncedAt(formatDateLabel());
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

  function persistUiPreferences(next: typeof defaultUiPreferences) {
    window.localStorage.setItem(STORAGE_KEYS.ui, JSON.stringify(next));
  }

  useEffect(() => {
    const storedUser = window.localStorage.getItem(STORAGE_KEYS.user);
    const storedSession = window.localStorage.getItem(STORAGE_KEYS.session);
    const storedUi = window.localStorage.getItem(STORAGE_KEYS.ui);

    if (storedUi) {
      try {
        const parsedUi = JSON.parse(storedUi) as typeof defaultUiPreferences;
        if (navItems.some((item) => item.id === parsedUi.defaultView)) {
          setUiPreferences(parsedUi);
          setCurrentView(parsedUi.defaultView);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEYS.ui);
      }
    }

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
        setLoadError("SQLite-Daten konnten nicht geladen werden. Bitte den lokalen Datenbestand prüfen.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!currentUser) return;
    persistUiPreferences(uiPreferences);
  }, [currentUser, uiPreferences]);

  useEffect(() => {
    if (!currentUser) return;
    setUiPreferences((prev) => (prev.defaultView === currentView ? prev : { ...prev, defaultView: currentView }));
  }, [currentUser, currentView]);

  useEffect(() => {
    if (!assetForm.contactName && contacts.length > 0) {
      setAssetForm((prev) => ({ ...prev, contactName: contacts[0].name }));
    }
  }, [contacts, assetForm.contactName]);

  const completedChecklist = checklist.filter((item) => item.status === "Erledigt").length;
  const readinessScore = checklist.length === 0 ? 0 : Math.round((completedChecklist / checklist.length) * 100);
  const activeRequests = requests.filter((item) => !["Freigegeben", "Abgelehnt"].includes(item.status)).length;
  const activeContacts = contacts.filter((item) => item.status === "Aktiv").length;
  const urgentChecklist = checklist.filter((item) => item.status !== "Erledigt");
  const nextChecklistItem = urgentChecklist[0];
  const reviewDueAssets = assets.filter((item) => item.status.toLowerCase().includes("fällig")).length;
  const sealedVaultItems = vaultItems.filter((item) => item.status === "Versiegelt").length;

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

  const filteredRequests = (
    deferredSearch
      ? requests.filter((item) =>
          [item.label, item.requesterName, item.scope, item.status, item.nextStep].some((field) =>
            field.toLowerCase().includes(deferredSearch),
          ),
        )
      : requests
  ).slice().sort((left, right) => getRequestSortWeight(left.status) - getRequestSortWeight(right.status));

  const pendingSearchMatches =
    filteredAssets.length + filteredContacts.length + filteredVaultItems.length + filteredRequests.length;

  function showFeedback(message: string, type: "" | "error" | "success" = "") {
    setAuthFeedback({ message, type });
  }

  function clearFormErrors() {
    setAssetErrors({});
    setContactErrors({});
    setVaultErrors({});
    setRequestErrors({});
  }

  function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = registerData.name.trim();
    const email = registerData.email.trim().toLowerCase();
    const password = registerData.password;
    const nextErrors: Record<string, string> = {};

    if (name.length < 3) nextErrors.name = "Bitte den vollständigen Namen angeben.";
    if (!validateEmail(email)) nextErrors.email = "Bitte eine gültige E-Mail-Adresse verwenden.";
    if (!validatePassword(password)) nextErrors.password = "Mindestens 8 Zeichen und mindestens eine Ziffer.";

    setRegisterErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      showFeedback("Der Arbeitsbereich konnte noch nicht eingerichtet werden.", "error");
      return;
    }

    const user = { name, email, password };
    persistUser(user);
    setRegisterData({ name: "", email: "", password: "" });
    setLoginData({ email, password: "" });
    setAuthTab("login");
    showFeedback("Arbeitsbereich lokal eingerichtet. Bitte jetzt mit den hinterlegten Daten anmelden.", "success");
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const email = loginData.email.trim().toLowerCase();
    const password = loginData.password;
    const rawUser = window.localStorage.getItem(STORAGE_KEYS.user);

    if (!validateEmail(email)) nextErrors.email = "Bitte eine gültige E-Mail-Adresse eingeben.";
    if (!password) nextErrors.password = "Bitte das Passwort eingeben.";
    setLoginErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      showFeedback("Die Anmeldung ist noch nicht vollständig.", "error");
      return;
    }

    if (!rawUser) {
      setAuthTab("register");
      showFeedback("Dieser lokale Arbeitsbereich wurde noch nicht eingerichtet. Bitte zuerst anlegen.", "error");
      return;
    }

    const user = JSON.parse(rawUser) as User;
    if (user.email !== email || user.password !== password) {
      showFeedback("Die hinterlegten Zugangsdaten stimmen nicht überein.", "error");
      return;
    }

    persistSession(user);
    setCurrentUser(user);
    setCurrentView(uiPreferences.defaultView);
    setAuthFeedback(defaultAuthFeedback);
    setLoginData({ email: "", password: "" });
    setToast(`Arbeitsbereich geöffnet. Willkommen zurück, ${user.name}.`);
  }

  function logout() {
    window.localStorage.removeItem(STORAGE_KEYS.session);
    setCurrentUser(null);
    setCurrentView("dashboard");
    clearFormErrors();
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Die Aktion konnte nicht verarbeitet werden.";
      setToast(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    const nextErrors: Record<string, string> = {};

    if (payload.name.length < 3) nextErrors.name = "Bitte eine präzise Asset-Bezeichnung angeben.";
    if (payload.provider.length < 2) nextErrors.provider = "Bitte den Anbieter oder das System angeben.";
    if (payload.contactName.length < 3) nextErrors.contactName = "Bitte eine verantwortliche Person hinterlegen.";
    if (payload.rule.length < 12) nextErrors.rule = "Die Freigaberegel sollte konkret beschreiben, wann Zugriff zulässig ist.";

    setAssetErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setToast("Das Asset ist noch nicht vollständig beschrieben.");
      return;
    }

    await withSubmission(async () => {
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readApiMessage(response));
      }

      setAssetForm({
        name: "",
        provider: "",
        category: "Kommunikation",
        accessLevel: "Nur Executor",
        contactName: contacts[0]?.name ?? "",
        rule: "",
      });
      setAssetErrors({});
      await syncAfterMutation("Asset wurde in den geschützten Bestand übernommen.", "assets");
    });
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...contactForm,
      name: contactForm.name.trim(),
      relation: contactForm.relation.trim(),
      email: contactForm.email.trim().toLowerCase(),
      phone: contactForm.phone.trim(),
      scope: contactForm.scope.trim(),
      verificationStatus: "Einladung vorbereitet",
      responseExpectation: "Rückmeldung innerhalb von 24 Stunden",
      status: "Ausstehend",
    };
    const nextErrors: Record<string, string> = {};

    if (payload.name.length < 3) nextErrors.name = "Bitte Name und Rolle klar benennen.";
    if (payload.relation.length < 2) nextErrors.relation = "Bitte die Beziehung oder Funktion angeben.";
    if (!validateEmail(payload.email)) nextErrors.email = "Bitte eine gültige E-Mail-Adresse verwenden.";
    if (!validatePhone(payload.phone)) nextErrors.phone = "Bitte eine erreichbare Telefonnummer angeben.";
    if (payload.scope.length < 10) nextErrors.scope = "Bitte den Zuständigkeitsbereich konkret beschreiben.";

    setContactErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setToast("Die Vertrauensperson ist noch nicht vollständig erfasst.");
      return;
    }

    await withSubmission(async () => {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readApiMessage(response));
      }

      setContactForm({
        name: "",
        relation: "",
        email: "",
        phone: "",
        role: "Familienkontakt",
        scope: "",
      });
      setContactErrors({});
      await syncAfterMutation("Vertrauensperson angelegt und für die Bestätigung vorgemerkt.", "contacts");
    });
  }

  async function submitVaultItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...vaultForm,
      title: vaultForm.title.trim(),
      summary: vaultForm.summary.trim(),
      updatedAt: new Intl.DateTimeFormat("de-DE").format(new Date()),
      status: "Freigabebereit",
    };
    const nextErrors: Record<string, string> = {};

    if (payload.title.length < 3) nextErrors.title = "Bitte einen aussagekräftigen Titel wählen.";
    if (payload.summary.length < 20) {
      nextErrors.summary = "Bitte Zweck, Inhalt und Freigabekontext kurz beschreiben.";
    }

    setVaultErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setToast("Der Tresoreintrag ist noch nicht ausreichend beschrieben.");
      return;
    }

    await withSubmission(async () => {
      const response = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readApiMessage(response));
      }

      setVaultForm({
        title: "",
        category: "Persönlich",
        visibility: "Familie nach Prüfung",
        retention: "Unbegrenzt",
        summary: "",
      });
      setVaultErrors({});
      await syncAfterMutation("Tresoreintrag wurde versioniert abgelegt.", "vault");
    });
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      label: `REQ-${new Date().getFullYear()}-${String(requests.length + 105).padStart(3, "0")}`,
      requesterName: requestForm.requesterName.trim(),
      relation: requestForm.relation.trim(),
      scope: requestForm.scope.trim(),
      evidenceStatus: requestForm.evidenceStatus.trim(),
      status: "Neu eingegangen",
      submittedAt: formatNow(),
      nextStep: "Formale Vollständigkeitsprüfung wurde automatisch gestartet.",
    };
    const nextErrors: Record<string, string> = {};

    if (payload.requesterName.length < 3) nextErrors.requesterName = "Bitte den vollständigen Namen angeben.";
    if (payload.relation.length < 2) nextErrors.relation = "Bitte die Beziehung oder Berechtigung nennen.";
    if (payload.scope.length < 12) nextErrors.scope = "Bitte den angeforderten Umfang konkret beschreiben.";
    if (payload.evidenceStatus.length < 6) nextErrors.evidenceStatus = "Bitte den Nachweisstand nachvollziehbar beschreiben.";

    setRequestErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setToast("Die Anfrage ist noch nicht vollständig vorbereitet.");
      return;
    }

    await withSubmission(async () => {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readApiMessage(response));
      }

      setRequestForm({
        requesterName: "",
        relation: "",
        scope: "",
        evidenceStatus: "",
      });
      setRequestErrors({});
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
        throw new Error(await readApiMessage(response));
      }

      await syncAfterMutation("Anfragestatus wurde aktualisiert.", "requests");
    });
  }

  async function cycleChecklistItem(item: ChecklistRecord) {
    const nextStatus = item.status === "Offen" ? "In Arbeit" : item.status === "In Arbeit" ? "Erledigt" : "Offen";
    await withSubmission(async () => {
      const response = await fetch(`/api/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        throw new Error(await readApiMessage(response));
      }

      await syncAfterMutation("Bereitschaftsstatus wurde aktualisiert.", "workflow");
    });
  }

  function openSearchResult() {
    const value = deferredSearch;
    if (!value) {
      setToast("Bitte einen Suchbegriff eingeben.");
      return;
    }

    if (filteredRequests.length > 0) {
      startTransition(() => setCurrentView("requests"));
      setToast(`${filteredRequests.length} passende Anfragen geöffnet.`);
      return;
    }
    if (filteredAssets.length > 0) {
      startTransition(() => setCurrentView("assets"));
      setToast(`${filteredAssets.length} passende Assets geöffnet.`);
      return;
    }
    if (filteredContacts.length > 0) {
      startTransition(() => setCurrentView("contacts"));
      setToast(`${filteredContacts.length} passende Vertrauenspersonen geöffnet.`);
      return;
    }
    if (filteredVaultItems.length > 0) {
      startTransition(() => setCurrentView("vault"));
      setToast(`${filteredVaultItems.length} passende Tresoreinträge geöffnet.`);
      return;
    }

    setToast(`Keine Treffer für "${searchValue}".`);
  }

  function exportWorkspaceSnapshot() {
    const payload = {
      exportedAt: new Date().toISOString(),
      owner: currentUser?.name ?? "Unbekannt",
      workspaceView: currentView,
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
    link.download = "nachlassleitstand-export.json";
    link.click();
    window.URL.revokeObjectURL(url);
    setToast("Lokaler Export wurde als JSON-Datei vorbereitet.");
  }

  const navBadges: Record<(typeof navItems)[number]["id"], string | null> = {
    dashboard: nextChecklistItem ? "Priorität" : null,
    assets: reviewDueAssets > 0 ? `${reviewDueAssets} fällig` : null,
    vault: sealedVaultItems > 0 ? `${sealedVaultItems} versiegelt` : null,
    contacts: contacts.length ? `${activeContacts}/${contacts.length}` : null,
    requests: activeRequests > 0 ? `${activeRequests} offen` : null,
    workflow: urgentChecklist.length ? `${urgentChecklist.length} offen` : null,
    settings: lastSyncedAt ? "Lokal" : null,
  };

  if (!currentUser) {
    const hasWorkspace = typeof window !== "undefined" && Boolean(window.localStorage.getItem(STORAGE_KEYS.user));

    return (
      <main className="landing-shell">
        <section className="landing-hero refined">
          <header className="landing-topbar">
            <div className="brand brand-landing">
              <div className="brand-mark">NL</div>
              <div>
                <p className="brand-kicker">Nachlassleitstand</p>
                <strong>Digitale Vorsorge mit System</strong>
              </div>
            </div>

            <div className="landing-topbar-actions">
              <button className="button ghost" onClick={() => setAuthTab("login")} type="button">
                Anmelden
              </button>
              <button className="button primary" onClick={() => setAuthTab("register")} type="button">
                Jetzt einrichten
              </button>
            </div>
          </header>

          <div className="landing-hero-grid refined">
            <section className="landing-story refined">
              <div className="auth-badge">Vertraulicher Arbeitsbereich für digitale Nachlassvorsorge</div>
              <h1>Damit im digitalen Nachlass nichts Wichtiges verloren geht, wenn Verantwortung plötzlich konkret wird.</h1>
              <p className="subtext landing-copy refined">
                Nachlassleitstand bündelt Konten, Dokumente, Zuständigkeiten und Freigaben in einem klaren,
                ruhigen Arbeitsbereich, damit aus Unsicherheit ein geordneter Übergabeprozess wird.
              </p>

              <div className="landing-cta-row">
                <button className="button primary" onClick={() => setAuthTab("register")} type="button">
                  Arbeitsbereich anlegen
                </button>
                <button className="button ghost" onClick={() => setAuthTab("login")} type="button">
                  Bestehenden Bereich öffnen
                </button>
              </div>

              <div className="landing-trust-row">
                <span>Lokale Datenspeicherung</span>
                <span>Kontrollierte Freigaben</span>
                <span>Nachvollziehbarer Export</span>
              </div>
            </section>

            <aside className="landing-preview refined">
              <div className="landing-preview-card dark showcase">
                <div className="landing-preview-head">
                  <div>
                    <span className="preview-label">Bereitschaftsgrad</span>
                    <strong>76% strukturiert</strong>
                  </div>
                  <StatusPill tone="positive">Gut vorbereitet</StatusPill>
                </div>
                <p>Checklisten, Rollen und Freigaben machen sofort sichtbar, was bereits abgesichert ist und was noch geklärt werden sollte.</p>
                <div className="preview-mini-metrics">
                  <div>
                    <strong>24</strong>
                    <span>Assets</span>
                  </div>
                  <div>
                    <strong>8</strong>
                    <span>Vertrauensrollen</span>
                  </div>
                  <div>
                    <strong>3</strong>
                    <span>offene Anfragen</span>
                  </div>
                </div>
              </div>

              <div className="landing-preview-card slim-list">
                <span className="preview-label">Wofür die Plattform gedacht ist</span>
                <ul className="landing-list refined">
                  <li>Digitale Konten und Zugriffsregeln geordnet festhalten</li>
                  <li>Wichtige Dokumente mit Freigabekontext ablegen</li>
                  <li>Vertrauenspersonen und Zuständigkeiten klar dokumentieren</li>
                  <li>Anfragen nachvollziehbar prüfen und entscheiden</li>
                </ul>
              </div>
            </aside>
          </div>
        </section>

        <section className="landing-section landing-metrics refined">
          <article className="metric-card positive">
            <span>Ein Arbeitsbereich</span>
            <strong>4 Kernmodule</strong>
            <p>Assets, Tresor, Vertrauenspersonen und Freigaben greifen ineinander, statt als einzelne Listen nebeneinander zu stehen.</p>
          </article>
          <article className="metric-card warning">
            <span>Prüfpfad</span>
            <strong>100% nachvollziehbar</strong>
            <p>Entscheidungen, Nachweise und nächste Schritte bleiben sauber dokumentiert.</p>
          </article>
          <article className="metric-card neutral">
            <span>Betriebsmodell</span>
            <strong>Lokal und kontrollierbar</strong>
            <p>Der aktuelle Stand eignet sich besonders für Demo, Beratung, Pilotbetrieb oder internes Tooling mit bewusst schlankem Setup.</p>
          </article>
        </section>

        <section className="landing-section landing-features refined">
          <div className="section-header">
            <div>
              <p className="eyebrow">Produktumfang</p>
              <h2>Die wichtigsten Bausteine auf einen Blick</h2>
              <p className="section-copy">
                Der aktuelle Produktstand konzentriert sich auf die Bereiche, die in der digitalen Vorsorge in der Praxis am schnellsten unübersichtlich werden.
              </p>
            </div>
          </div>

          <div className="landing-feature-grid refined">
            <article className="panel landing-feature-card">
              <h3>Asset-Register</h3>
              <p>Konten, Systeme und Zugriffsregeln mit Verantwortlichkeiten und Review-Stand sauber pflegen.</p>
            </article>
            <article className="panel landing-feature-card">
              <h3>Dokumententresor</h3>
              <p>Wichtige Dokumente mit Sichtbarkeit, Aufbewahrung und Freigabekontext strukturiert festhalten.</p>
            </article>
            <article className="panel landing-feature-card">
              <h3>Vertrauensrollen</h3>
              <p>Vertrauenspersonen und Zuständigkeiten so dokumentieren, dass operative Übergaben klar bleiben.</p>
            </article>
            <article className="panel landing-feature-card">
              <h3>Freigabe-Queue</h3>
              <p>Anfragen kontrolliert prüfen, Rückfragen dokumentieren und Entscheidungen sauber begründen.</p>
            </article>
          </div>
        </section>

        <section className="landing-section landing-process refined">
          <div className="section-header">
            <div>
              <p className="eyebrow">Ablauf</p>
              <h2>Von verstreuten Informationen zu einem klaren Übergabeprozess</h2>
            </div>
          </div>

          <div className="readiness-rail landing-rail refined">
            <div>
              <span>1</span>
              <p>Arbeitsbereich anlegen und eine verantwortliche Person festlegen</p>
            </div>
            <div>
              <span>2</span>
              <p>Assets, Dokumente und Vertrauensrollen gemeinsam strukturieren</p>
            </div>
            <div>
              <span>3</span>
              <p>Freigaben, Prüfpfade und Export für den Ernstfall vorbereiten</p>
            </div>
          </div>
        </section>

        <section className="landing-section landing-auth-section refined">
          <section className="auth-panel landing-auth-panel">
            <div className="auth-panel-head">
              <p className="eyebrow">Zugang</p>
              <h2>{hasWorkspace ? "Arbeitsbereich öffnen" : "Arbeitsbereich einrichten"}</h2>
              <p className="section-copy">
                {hasWorkspace
                  ? "Melden Sie sich mit den lokal hinterlegten Zugangsdaten an."
                  : "Legen Sie einmalig die verantwortliche Person für diesen lokalen Arbeitsbereich fest."}
              </p>
            </div>

            <div className="auth-tabs">
              <button className={`tab-button${authTab === "login" ? " active" : ""}`} onClick={() => setAuthTab("login")} type="button">
                Anmelden
              </button>
              <button
                className={`tab-button${authTab === "register" ? " active" : ""}`}
                onClick={() => setAuthTab("register")}
                type="button"
              >
                Einrichten
              </button>
            </div>

            <form className={`auth-form${authTab === "login" ? " is-visible" : ""}`} onSubmit={handleLogin}>
              <label>
                E-Mail
                <input
                  type="email"
                  value={loginData.email}
                  onChange={(event) => {
                    setLoginData((prev) => ({ ...prev, email: event.target.value }));
                    if (loginErrors.email) setLoginErrors((prev) => ({ ...prev, email: "" }));
                  }}
                  placeholder="name@unternehmen.de"
                  required
                />
                <FieldError message={loginErrors.email} />
              </label>
              <label>
                Passwort
                <input
                  type="password"
                  value={loginData.password}
                  onChange={(event) => {
                    setLoginData((prev) => ({ ...prev, password: event.target.value }));
                    if (loginErrors.password) setLoginErrors((prev) => ({ ...prev, password: "" }));
                  }}
                  placeholder="Mindestens 8 Zeichen"
                  required
                />
                <FieldError message={loginErrors.password} />
              </label>
              <button className="button primary" type="submit">
                Arbeitsbereich öffnen
              </button>
              <p className="micro-copy">Die Sitzung wird ausschließlich lokal im Browser gespeichert und kann jederzeit beendet werden.</p>
            </form>

            <form className={`auth-form${authTab === "register" ? " is-visible" : ""}`} onSubmit={handleRegister}>
              <label>
                Verantwortliche Person
                <input
                  type="text"
                  value={registerData.name}
                  onChange={(event) => {
                    setRegisterData((prev) => ({ ...prev, name: event.target.value }));
                    if (registerErrors.name) setRegisterErrors((prev) => ({ ...prev, name: "" }));
                  }}
                  placeholder="Vor- und Nachname"
                  required
                />
                <FieldError message={registerErrors.name} />
              </label>
              <label>
                E-Mail
                <input
                  type="email"
                  value={registerData.email}
                  onChange={(event) => {
                    setRegisterData((prev) => ({ ...prev, email: event.target.value }));
                    if (registerErrors.email) setRegisterErrors((prev) => ({ ...prev, email: "" }));
                  }}
                  placeholder="name@unternehmen.de"
                  required
                />
                <FieldError message={registerErrors.email} />
              </label>
              <label>
                Passwort
                <input
                  type="password"
                  value={registerData.password}
                  onChange={(event) => {
                    setRegisterData((prev) => ({ ...prev, password: event.target.value }));
                    if (registerErrors.password) setRegisterErrors((prev) => ({ ...prev, password: "" }));
                  }}
                  placeholder="Mindestens 8 Zeichen und eine Ziffer"
                  required
                />
                <FieldError message={registerErrors.password} />
              </label>
              <button className="button primary" type="submit">
                Lokalen Arbeitsbereich anlegen
              </button>
              <p className="micro-copy">Kein externer Identity-Dienst. Zugangsdaten bleiben ausschließlich in diesem Browser gespeichert.</p>
            </form>

            <p className={`auth-feedback${authFeedback.type ? ` ${authFeedback.type}` : ""}`}>{authFeedback.message}</p>
          </section>
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
            <strong>Arbeitsbereich v1</strong>
          </div>
        </div>

        <div className="sidebar-card emphasis">
          <span>Bereitschaft</span>
          <strong>{readinessScore}% abgesichert</strong>
          <p>
            {completedChecklist} von {checklist.length} Kernaufgaben sind abgeschlossen.
          </p>
          {nextChecklistItem ? <small>Nächster Fokus: {nextChecklistItem.title}</small> : <small>Keine offenen Kernaufgaben.</small>}
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item${currentView === item.id ? " active" : ""}`}
              onClick={() => startTransition(() => setCurrentView(item.id))}
              type="button"
            >
              <span>{item.short}</span>
              <div>
                <strong>{item.label}</strong>
                {navBadges[item.id] ? <small>{navBadges[item.id]}</small> : null}
              </div>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p>Lokaler Betrieb mit SQLite</p>
          <strong>Produktnaher v1-Stand</strong>
          <span>Keine externen Zugangsdaten, kein Cloud-Zwang, vollständiger JSON-Export.</span>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Lokale digitale Nachlassverwaltung</p>
            <h1>Klare Entscheidungen statt verstreuter Notfallinformationen.</h1>
            <p className="section-copy">
              Assets, Vertrauensrollen, Dokumententresor und Anfragen werden in einem nachvollziehbaren Arbeitsbereich zusammengeführt.
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
                  if (event.key === "Enter") openSearchResult();
                }}
              />
              <button className="button ghost" onClick={openSearchResult} type="button">
                Öffnen
              </button>
            </div>

            <div className="topbar-actions">
              <button className="button ghost" onClick={exportWorkspaceSnapshot} type="button">
                Export
              </button>
              <button className="button ghost" onClick={() => startTransition(() => setCurrentView("settings"))} type="button">
                Arbeitsbereich
              </button>
              <div className="profile">
                <div className="avatar">{initialsFromName(currentUser.name) || "NL"}</div>
                <div>
                  <strong>{currentUser.name}</strong>
                  <span>Verantwortliche Person</span>
                </div>
              </div>
              <button className="button ghost" onClick={logout} type="button">
                Abmelden
              </button>
            </div>
          </div>
        </header>

        {loadError ? (
          <section className="loading-panel">
            <strong>Lokaler Datenbestand nicht erreichbar</strong>
            <p>{loadError}</p>
            <button
              className="button primary"
              onClick={() => {
                setIsLoading(true);
                loadDatabaseData()
                  .catch(() => setLoadError("SQLite-Daten konnten weiterhin nicht geladen werden."))
                  .finally(() => setIsLoading(false));
              }}
              type="button"
            >
              Erneut laden
            </button>
          </section>
        ) : isLoading ? (
          <section className="loading-panel">
            <p>Datenbestand wird geladen...</p>
          </section>
        ) : (
          <div className="content">
            <section className="context-strip">
              <div>
                <strong>Letzte Synchronisierung</strong>
                <span>{lastSyncedAt}</span>
              </div>
              <div>
                <strong>Suchtreffer</strong>
                <span>{deferredSearch ? `${pendingSearchMatches} Treffer` : "Keine aktive Suche"}</span>
              </div>
              <div>
                <strong>Offene Anfragen</strong>
                <span>{activeRequests}</span>
              </div>
            </section>

            {currentView === "dashboard" && (
              <>
                <section className="hero">
                  <div>
                    <p className="eyebrow">Nächster sinnvoller Schritt</p>
                    <h2>{nextChecklistItem ? nextChecklistItem.title : "Arbeitsbereich ist aktuell stabil organisiert."}</h2>
                    <p className="section-copy">
                      {nextChecklistItem
                        ? `${nextChecklistItem.owner} ist verantwortlich. Zieltermin: ${nextChecklistItem.dueLabel}.`
                        : "Alle Kernaufgaben sind abgeschlossen. Nutzen Sie Export und Freigabe-Queue für den operativen Betrieb."}
                    </p>
                  </div>
                  <div className="hero-actions">
                    <button className="button primary" onClick={() => startTransition(() => setCurrentView("requests"))} type="button">
                      Freigaben steuern
                    </button>
                    <button className="button ghost" onClick={() => startTransition(() => setCurrentView("workflow"))} type="button">
                      Aufgaben prüfen
                    </button>
                  </div>
                </section>

                <section className="metric-grid">
                  <MetricCard label="Bereitschaft" value={`${readinessScore}%`} detail="Abgeleitet aus Checkliste, Rollenabdeckung und aktuellen Ständen." tone={readinessScore >= 75 ? "positive" : readinessScore >= 50 ? "warning" : "critical"} />
                  <MetricCard label="Offene Anfragen" value={activeRequests} detail="Vorgänge mit Bedarf für Prüfung, Rückfrage oder Freigabe." tone={activeRequests > 0 ? "warning" : "positive"} />
                  <MetricCard label="Bestätigte Vertrauensrollen" value={`${activeContacts}/${contacts.length}`} detail="Nur bestätigte Rollen sollten später operative Zugriffe erhalten." tone={activeContacts === contacts.length ? "positive" : "warning"} />
                  <MetricCard label="Review fällige Assets" value={reviewDueAssets} detail="Einträge mit überfälligem Prüf- oder Aktualisierungsbedarf." tone={reviewDueAssets > 0 ? "critical" : "positive"} />
                </section>

                <section className="dashboard-grid">
                  <article className="panel large">
                    <div className="panel-head">
                      <h3>Operative Prioritäten</h3>
                      <StatusPill tone={readinessScore >= 75 ? "positive" : "warning"}>
                        {readinessScore >= 75 ? "Stabil" : "Aufmerksamkeit erforderlich"}
                      </StatusPill>
                    </div>
                    <div className="priority-grid">
                      <article className="priority-card">
                        <span>Kritischster Punkt</span>
                        <strong>{nextChecklistItem?.title ?? "Keine offenen Kernaufgaben"}</strong>
                        <p>Die Checkliste steuert den Reifegrad des gesamten Arbeitsbereichs.</p>
                        <button className="button ghost small" onClick={() => startTransition(() => setCurrentView("workflow"))} type="button">
                          Zur Checkliste
                        </button>
                      </article>
                      <article className="priority-card">
                        <span>Freigabe-Queue</span>
                        <strong>{activeRequests} aktive Vorgänge</strong>
                        <p>Neue oder laufende Vorgänge sollten täglich gesichtet und triagiert werden.</p>
                        <button className="button ghost small" onClick={() => startTransition(() => setCurrentView("requests"))} type="button">
                          Queue öffnen
                        </button>
                      </article>
                      <article className="priority-card">
                        <span>Bestandsqualität</span>
                        <strong>{assets.length} Assets dokumentiert</strong>
                        <p>Freigaben sind nur belastbar, wenn Asset-Bestand und Verantwortlichkeiten sauber gepflegt bleiben.</p>
                        <button className="button ghost small" onClick={() => startTransition(() => setCurrentView("assets"))} type="button">
                          Assets prüfen
                        </button>
                      </article>
                    </div>
                  </article>

                  <article className="panel">
                    <div className="panel-head">
                      <h3>Letzte Aktivität</h3>
                      <StatusPill tone="neutral">Auditfähig</StatusPill>
                    </div>
                    <div className="activity-list">
                      {activities.length === 0 ? (
                        <EmptyState title="Noch keine Aktivität" copy="Sobald Daten geändert werden, erscheint hier die jüngste Historie." />
                      ) : (
                        activities.map((activity) => (
                          <div key={activity.id} className="activity-item">
                            <div className={`activity-dot ${activity.kind}`}></div>
                            <div>
                              <strong>{activity.title}</strong>
                              <p>{activity.detail}</p>
                              <span>{activity.createdAt}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                </section>

                <section className="dashboard-grid lower">
                  <article className="panel">
                    <div className="panel-head">
                      <h3>Aktive Assets</h3>
                      <button className="text-button" onClick={() => startTransition(() => setCurrentView("assets"))} type="button">
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
                      <h3>Freigabe-Queue</h3>
                      <button className="text-button" onClick={() => startTransition(() => setCurrentView("requests"))} type="button">
                        Vorgänge öffnen
                      </button>
                    </div>
                    <div className="list-stack">
                      {filteredRequests.slice(0, 4).map((request) => (
                        <div key={request.id} className="list-row">
                          <div>
                            <strong>{request.label}</strong>
                            <p>
                              {request.requesterName} · {request.scope}
                            </p>
                          </div>
                          <div className="list-row-side">
                            <StatusPill>{request.status}</StatusPill>
                            <span>{requestPriority(request)}</span>
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
                    copy="Jedes Asset erhält Verantwortlichkeit, Zugriffsebene und eine belastbare Freigaberegel."
                  />
                  <form className="stack-form" onSubmit={submitAsset}>
                    <label>
                      Asset-Bezeichnung
                      <input
                        value={assetForm.name}
                        onChange={(event) => {
                          setAssetForm((prev) => ({ ...prev, name: event.target.value }));
                          if (assetErrors.name) setAssetErrors((prev) => ({ ...prev, name: "" }));
                        }}
                        placeholder="z. B. Primäres E-Mail-Konto"
                      />
                      <FieldError message={assetErrors.name} />
                    </label>
                    <label>
                      Anbieter / System
                      <input
                        value={assetForm.provider}
                        onChange={(event) => {
                          setAssetForm((prev) => ({ ...prev, provider: event.target.value }));
                          if (assetErrors.provider) setAssetErrors((prev) => ({ ...prev, provider: "" }));
                        }}
                        placeholder="z. B. Google Workspace"
                      />
                      <FieldError message={assetErrors.provider} />
                    </label>
                    <div className="form-split">
                      <label>
                        Kategorie
                        <select value={assetForm.category} onChange={(event) => setAssetForm((prev) => ({ ...prev, category: event.target.value }))}>
                          <option>Kommunikation</option>
                          <option>Finanzen</option>
                          <option>Geräte</option>
                          <option>Geschäftsbetrieb</option>
                          <option>Persönlich</option>
                        </select>
                      </label>
                      <label>
                        Zugriffsebene
                        <select value={assetForm.accessLevel} onChange={(event) => setAssetForm((prev) => ({ ...prev, accessLevel: event.target.value }))}>
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
                        onChange={(event) => {
                          setAssetForm((prev) => ({ ...prev, contactName: event.target.value }));
                          if (assetErrors.contactName) setAssetErrors((prev) => ({ ...prev, contactName: "" }));
                        }}
                        placeholder="z. B. Anna Weber"
                      />
                      <FieldError message={assetErrors.contactName} />
                    </label>
                    <label>
                      Freigaberegel
                      <textarea
                        value={assetForm.rule}
                        onChange={(event) => {
                          setAssetForm((prev) => ({ ...prev, rule: event.target.value }));
                          if (assetErrors.rule) setAssetErrors((prev) => ({ ...prev, rule: "" }));
                        }}
                        placeholder="Beschreiben Sie Nachweise, Prüfschritte und Grenzen der Freigabe."
                      />
                      <FieldError message={assetErrors.rule} />
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
                    copy="Suche filtert direkt nach System, Kategorie, Zuständigkeit und Freigaberegel."
                    actions={<StatusPill tone={reviewDueAssets > 0 ? "critical" : "positive"}>{reviewDueAssets > 0 ? `${reviewDueAssets} Reviews fällig` : "Bestand aktuell"}</StatusPill>}
                  />
                  {filteredAssets.length === 0 ? (
                    <EmptyState title="Keine Assets gefunden" copy="Passen Sie die Suche an oder legen Sie ein neues Asset an." />
                  ) : (
                    <div className="table-shell">
                      <table>
                        <thead>
                          <tr>
                            <th>Asset</th>
                            <th>Anbieter</th>
                            <th>Zuständigkeit</th>
                            <th>Freigaberegel</th>
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
                  )}
                </article>
              </section>
            )}

            {currentView === "vault" && (
              <section className="section-grid">
                <article className="panel sticky">
                  <SectionHeader
                    eyebrow="Sicherer Tresor"
                    title="Dokumente mit Zielgruppe und Aufbewahrung führen"
                    copy="Der Tresor dokumentiert Sichtbarkeit, Haltedauer und den Zweck des Inhalts."
                  />
                  <form className="stack-form" onSubmit={submitVaultItem}>
                    <label>
                      Titel
                      <input
                        value={vaultForm.title}
                        onChange={(event) => {
                          setVaultForm((prev) => ({ ...prev, title: event.target.value }));
                          if (vaultErrors.title) setVaultErrors((prev) => ({ ...prev, title: "" }));
                        }}
                        placeholder="z. B. Zugangspaket für Hosting"
                      />
                      <FieldError message={vaultErrors.title} />
                    </label>
                    <div className="form-split">
                      <label>
                        Kategorie
                        <select value={vaultForm.category} onChange={(event) => setVaultForm((prev) => ({ ...prev, category: event.target.value }))}>
                          <option>Persönlich</option>
                          <option>Recht</option>
                          <option>Betrieb</option>
                          <option>Vermögen</option>
                        </select>
                      </label>
                      <label>
                        Sichtbarkeit
                        <select value={vaultForm.visibility} onChange={(event) => setVaultForm((prev) => ({ ...prev, visibility: event.target.value }))}>
                          <option>Familie nach Prüfung</option>
                          <option>Nur Executor</option>
                          <option>Continuity-Team</option>
                          <option>Nur Executor + Rechtsbeistand</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Aufbewahrung
                      <select value={vaultForm.retention} onChange={(event) => setVaultForm((prev) => ({ ...prev, retention: event.target.value }))}>
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
                        onChange={(event) => {
                          setVaultForm((prev) => ({ ...prev, summary: event.target.value }));
                          if (vaultErrors.summary) setVaultErrors((prev) => ({ ...prev, summary: "" }));
                        }}
                        placeholder="Welche Inhalte sind enthalten und wann soll das Paket freigegeben werden?"
                      />
                      <FieldError message={vaultErrors.summary} />
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
                    copy="Geeignet für rechtliche Dokumente, persönliche Nachrichten und betriebliche Übergaben."
                  />
                  {filteredVaultItems.length === 0 ? (
                    <EmptyState title="Keine Tresoreinträge gefunden" copy="Passen Sie die Suche an oder legen Sie ein neues Paket an." />
                  ) : (
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
                  )}
                </article>
              </section>
            )}

            {currentView === "contacts" && (
              <section className="section-grid">
                <article className="panel sticky">
                  <SectionHeader
                    eyebrow="Rollenmodell"
                    title="Vertrauenspersonen mit Reichweite und Erwartung pflegen"
                    copy="Kontakte werden nach Rolle, Reaktionsfähigkeit und Zuständigkeitsbereich geführt."
                  />
                  <form className="stack-form" onSubmit={submitContact}>
                    <label>
                      Name
                      <input
                        value={contactForm.name}
                        onChange={(event) => {
                          setContactForm((prev) => ({ ...prev, name: event.target.value }));
                          if (contactErrors.name) setContactErrors((prev) => ({ ...prev, name: "" }));
                        }}
                        placeholder="z. B. Dr. Lena Vogt"
                      />
                      <FieldError message={contactErrors.name} />
                    </label>
                    <div className="form-split">
                      <label>
                        Beziehung / Funktion
                        <input
                          value={contactForm.relation}
                          onChange={(event) => {
                            setContactForm((prev) => ({ ...prev, relation: event.target.value }));
                            if (contactErrors.relation) setContactErrors((prev) => ({ ...prev, relation: "" }));
                          }}
                          placeholder="z. B. Rechtsbeistand"
                        />
                        <FieldError message={contactErrors.relation} />
                      </label>
                      <label>
                        Rolle
                        <select value={contactForm.role} onChange={(event) => setContactForm((prev) => ({ ...prev, role: event.target.value }))}>
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
                          onChange={(event) => {
                            setContactForm((prev) => ({ ...prev, email: event.target.value }));
                            if (contactErrors.email) setContactErrors((prev) => ({ ...prev, email: "" }));
                          }}
                          placeholder="name@beispiel.de"
                        />
                        <FieldError message={contactErrors.email} />
                      </label>
                      <label>
                        Telefon
                        <input
                          value={contactForm.phone}
                          onChange={(event) => {
                            setContactForm((prev) => ({ ...prev, phone: event.target.value }));
                            if (contactErrors.phone) setContactErrors((prev) => ({ ...prev, phone: "" }));
                          }}
                          placeholder="+49 ..."
                        />
                        <FieldError message={contactErrors.phone} />
                      </label>
                    </div>
                    <label>
                      Zuständigkeitsbereich
                      <textarea
                        value={contactForm.scope}
                        onChange={(event) => {
                          setContactForm((prev) => ({ ...prev, scope: event.target.value }));
                          if (contactErrors.scope) setContactErrors((prev) => ({ ...prev, scope: "" }));
                        }}
                        placeholder="Welche Assets, Dokumente oder Aufgaben umfasst diese Rolle?"
                      />
                      <FieldError message={contactErrors.scope} />
                    </label>
                    <button className="button primary" type="submit">
                      Vertrauensperson anlegen
                    </button>
                  </form>
                </article>

                <article className="panel">
                  <SectionHeader
                    eyebrow="Kontaktliste"
                    title="Bestätigte Rollen und ausstehende Freigaben"
                    copy="Die Übersicht fokussiert auf Reaktionsfähigkeit, Reichweite und Verifikationsstand."
                    actions={
                      <StatusPill tone={activeContacts === contacts.length ? "positive" : "warning"}>
                        {`${activeContacts} aktiv`}
                      </StatusPill>
                    }
                  />
                  {filteredContacts.length === 0 ? (
                    <EmptyState title="Keine Kontakte gefunden" copy="Passen Sie die Suche an oder legen Sie eine Vertrauensperson an." />
                  ) : (
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
                  )}
                </article>
              </section>
            )}

            {currentView === "requests" && (
              <section className="section-grid">
                <article className="panel sticky">
                  <SectionHeader
                    eyebrow="Freigabeprozess"
                    title="Anfrage vollständig anlegen"
                    copy="Jeder Vorgang startet mit Antragsteller, Nachweisstatus und einem klaren Umfang."
                  />
                  <form className="stack-form" onSubmit={submitRequest}>
                    <label>
                      Antragsteller
                      <input
                        value={requestForm.requesterName}
                        onChange={(event) => {
                          setRequestForm((prev) => ({ ...prev, requesterName: event.target.value }));
                          if (requestErrors.requesterName) setRequestErrors((prev) => ({ ...prev, requesterName: "" }));
                        }}
                        placeholder="Vor- und Nachname"
                      />
                      <FieldError message={requestErrors.requesterName} />
                    </label>
                    <div className="form-split">
                      <label>
                        Beziehung / Berechtigung
                        <input
                          value={requestForm.relation}
                          onChange={(event) => {
                            setRequestForm((prev) => ({ ...prev, relation: event.target.value }));
                            if (requestErrors.relation) setRequestErrors((prev) => ({ ...prev, relation: "" }));
                          }}
                          placeholder="z. B. Ehepartnerin"
                        />
                        <FieldError message={requestErrors.relation} />
                      </label>
                      <label>
                        Nachweisstatus
                        <input
                          value={requestForm.evidenceStatus}
                          onChange={(event) => {
                            setRequestForm((prev) => ({ ...prev, evidenceStatus: event.target.value }));
                            if (requestErrors.evidenceStatus) setRequestErrors((prev) => ({ ...prev, evidenceStatus: "" }));
                          }}
                          placeholder="z. B. Sterbeurkunde liegt vor"
                        />
                        <FieldError message={requestErrors.evidenceStatus} />
                      </label>
                    </div>
                    <label>
                      Angeforderter Umfang
                      <textarea
                        value={requestForm.scope}
                        onChange={(event) => {
                          setRequestForm((prev) => ({ ...prev, scope: event.target.value }));
                          if (requestErrors.scope) setRequestErrors((prev) => ({ ...prev, scope: "" }));
                        }}
                        placeholder="Welche Inhalte oder Zugänge sollen geprüft werden?"
                      />
                      <FieldError message={requestErrors.scope} />
                    </label>
                    <button className="button primary" type="submit">
                      Anfrage anlegen
                    </button>
                  </form>
                </article>

                <article className="panel">
                  <SectionHeader
                    eyebrow="Prüf-Queue"
                    title="Vorgänge mit klarer Triage"
                    copy="Statuswechsel stehen nur dort zur Verfügung, wo sie fachlich Sinn ergeben."
                  />
                  <div className="queue-summary">
                    <StatusPill tone="warning">{`${requests.filter((item) => item.status === "Neu eingegangen").length} neu`}</StatusPill>
                    <StatusPill tone="warning">{`${requests.filter((item) => item.status === "In Prüfung").length} in Prüfung`}</StatusPill>
                    <StatusPill tone="critical">{`${requests.filter((item) => item.status === "Rückfrage gesendet").length} Rückfragen`}</StatusPill>
                    <StatusPill tone="positive">{`${requests.filter((item) => item.status === "Freigegeben").length} freigegeben`}</StatusPill>
                  </div>
                  {filteredRequests.length === 0 ? (
                    <EmptyState title="Keine Anfragen gefunden" copy="Passen Sie die Suche an oder legen Sie einen neuen Vorgang an." />
                  ) : (
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
                            <div className="request-head-meta">
                              <StatusPill>{request.status}</StatusPill>
                              <span>{requestPriority(request)}</span>
                            </div>
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
                          <div className="request-note">
                            <strong>Empfehlung</strong>
                            <p>{requestRecommendation(request)}</p>
                          </div>
                          <div className="request-actions">
                            {getRequestActions(request.status).length === 0 ? (
                              <span className="micro-copy">Für diesen Status ist keine weitere Aktion erforderlich.</span>
                            ) : (
                              getRequestActions(request.status).map((transition) => (
                                <button
                                  key={transition.label}
                                  className={`button ${transition.tone === "primary" ? "primary" : "ghost"} small`}
                                  onClick={() => moveRequest(request.id, transition.status, transition.nextStep)}
                                  type="button"
                                >
                                  {transition.label}
                                </button>
                              ))
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>
              </section>
            )}

            {currentView === "workflow" && (
              <section className="section-grid">
                <article className="panel sticky">
                  <SectionHeader
                    eyebrow="Bereitschaftsmodell"
                    title="Schrittfolge für einen belastbaren Arbeitsbereich"
                    copy="Die Plattform zeigt nicht nur Daten, sondern macht den Reifegrad der Nachlassakte transparent."
                  />
                  <div className="workflow-steps">
                    <div className="workflow-step">
                      <strong>1. Bestand konsolidieren</strong>
                      <p>Assets erhalten Verantwortliche, Zugriffsebenen und aktuelle Review-Daten.</p>
                    </div>
                    <div className="workflow-step">
                      <strong>2. Rollen absichern</strong>
                      <p>Vertrauenspersonen werden mit Reaktionszeit und fachlicher Reichweite verifiziert.</p>
                    </div>
                    <div className="workflow-step">
                      <strong>3. Tresor strukturieren</strong>
                      <p>Rechtliche, persönliche und betriebliche Pakete bleiben mit Freigabekontext dokumentiert.</p>
                    </div>
                    <div className="workflow-step">
                      <strong>4. Freigaben kontrollieren</strong>
                      <p>Anfragen lassen sich mit Statuswechseln, Rückfragen und Historie operativ steuern.</p>
                    </div>
                  </div>
                </article>

                <article className="panel">
                  <SectionHeader
                    eyebrow="Checkliste"
                    title="Offene Maßnahmen mit Auswirkung auf die Bereitschaft"
                    copy="Jede Statusänderung wird serverseitig in SQLite übernommen und im Aktivitätsprotokoll dokumentiert."
                  />
                  <div className="checklist">
                    {checklist.map((item) => (
                      <button key={item.id} className="checklist-item" onClick={() => cycleChecklistItem(item)} type="button">
                        <div>
                          <strong>{item.title}</strong>
                          <p>
                            Verantwortlich: {item.owner} · Ziel: {item.dueLabel}
                          </p>
                        </div>
                        <StatusPill tone={item.status === "Erledigt" ? "positive" : item.status === "In Arbeit" ? "warning" : "critical"}>
                          {item.status}
                        </StatusPill>
                      </button>
                    ))}
                  </div>
                </article>
              </section>
            )}

            {currentView === "settings" && (
              <section className="section-grid">
                <article className="panel sticky">
                  <SectionHeader
                    eyebrow="Arbeitsbereich"
                    title="Lokale Nutzung steuern"
                    copy="Sitzung, Startansicht und Datenexport bleiben ohne externe Dienste vollständig lokal kontrollierbar."
                  />
                  <form
                    className="stack-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setToast("Arbeitsbereichseinstellungen wurden lokal gespeichert.");
                    }}
                  >
                    <label>
                      Verantwortliche Person
                      <input value={currentUser.name} readOnly />
                    </label>
                    <label>
                      Startansicht nach Anmeldung
                      <select
                        value={uiPreferences.defaultView}
                        onChange={(event) =>
                          setUiPreferences((prev) => ({
                            ...prev,
                            defaultView: event.target.value as (typeof navItems)[number]["id"],
                          }))
                        }
                      >
                        {navItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="button primary" type="submit">
                      Lokale Einstellungen sichern
                    </button>
                  </form>
                </article>

                <article className="panel">
                  <SectionHeader
                    eyebrow="Datenqualität"
                    title="Release-Readiness im lokalen Betrieb"
                    copy="Diese Installation bleibt lokal-first und konzentriert sich auf saubere Freigabe- und Dokumentationsprozesse."
                  />
                  <div className="settings-grid">
                    <article className="settings-card">
                      <strong>Persistenz</strong>
                      <p>SQLite hält den Arbeitsdatenbestand lokal im Projekt. Sitzung und Startansicht bleiben im Browser gespeichert.</p>
                    </article>
                    <article className="settings-card">
                      <strong>Export</strong>
                      <p>Ein vollständiger JSON-Export für Übergabe, Archivierung oder lokale Sicherung ist jederzeit verfügbar.</p>
                      <button className="button ghost small" onClick={exportWorkspaceSnapshot} type="button">
                        Export vorbereiten
                      </button>
                    </article>
                    <article className="settings-card">
                      <strong>Build-Status</strong>
                      <p>Die Anwendung ist für einen produktnahen lokalen v1-Einsatz vorbereitet und auf Build-Stabilität ausgelegt.</p>
                    </article>
                    <article className="settings-card">
                      <strong>Aktueller Datenstand</strong>
                      <p>Letzte Synchronisierung: {lastSyncedAt}. Alle Änderungen werden direkt in den lokalen APIs verarbeitet.</p>
                    </article>
                  </div>
                </article>
              </section>
            )}
          </div>
        )}

        <div className={`toast${toast ? " visible" : ""}`}>{toast}</div>
      </section>
    </main>
  );
}
