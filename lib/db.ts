import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ActivityRecord,
  AssetRecord,
  ChecklistRecord,
  ContactRecord,
  RequestRecord,
  VaultRecord,
} from "@/lib/types";

const dbPath = join(process.cwd(), "data", "digitalernachlass.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isLockedError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ERR_SQLITE_ERROR" &&
    "errcode" in error &&
    error.errcode === 5
  );
}

function withRetry<T>(operation: () => T, retries = 25, delayMs = 40): T {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (!isLockedError(error) || attempt === retries - 1) {
        throw error;
      }
      lastError = error;
      sleepSync(delayMs);
    }
  }

  throw lastError;
}

withRetry(() =>
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
  `),
);

withRetry(() =>
  db.exec(`
  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    category TEXT NOT NULL,
    owner TEXT NOT NULL,
    access_level TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    rule TEXT NOT NULL,
    last_review TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    relation TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL,
    scope TEXT NOT NULL,
    verification_status TEXT NOT NULL,
    response_expectation TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vault_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    visibility TEXT NOT NULL,
    status TEXT NOT NULL,
    retention TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    summary TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    relation TEXT NOT NULL,
    scope TEXT NOT NULL,
    evidence_status TEXT NOT NULL,
    status TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    next_step TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    owner TEXT NOT NULL,
    due_label TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`),
);

function hasColumn(table: string, column: string) {
  const rows = withRetry(() => db.prepare(`PRAGMA table_info(${table})`).all()) as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function recreateTable(table: string, createSql: string) {
  withRetry(() => db.exec(`DROP TABLE IF EXISTS ${table};`));
  withRetry(() => db.exec(createSql));
}

function runMigrations() {
  if (!hasColumn("assets", "provider")) {
    recreateTable(
      "assets",
      `
        CREATE TABLE assets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          provider TEXT NOT NULL,
          category TEXT NOT NULL,
          owner TEXT NOT NULL,
          access_level TEXT NOT NULL,
          contact_name TEXT NOT NULL,
          rule TEXT NOT NULL,
          last_review TEXT NOT NULL,
          status TEXT NOT NULL
        );
      `,
    );
  }

  if (!hasColumn("contacts", "phone")) {
    recreateTable(
      "contacts",
      `
        CREATE TABLE contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          relation TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL,
          role TEXT NOT NULL,
          scope TEXT NOT NULL,
          verification_status TEXT NOT NULL,
          response_expectation TEXT NOT NULL,
          status TEXT NOT NULL
        );
      `,
    );
  }

  if (!hasColumn("requests", "requester_name")) {
    recreateTable(
      "requests",
      `
        CREATE TABLE requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT NOT NULL,
          requester_name TEXT NOT NULL,
          relation TEXT NOT NULL,
          scope TEXT NOT NULL,
          evidence_status TEXT NOT NULL,
          status TEXT NOT NULL,
          submitted_at TEXT NOT NULL,
          next_step TEXT NOT NULL
        );
      `,
    );
  }
}

runMigrations();

function countRows(table: "assets" | "contacts" | "vault_items" | "requests" | "checklist_items" | "activity_log") {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
  const row = withRetry(() => stmt.get()) as { count: number };
  return row.count;
}

function nowLabel() {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}

function seed() {
  if (countRows("assets") === 0) {
    const insert = db.prepare(
      "INSERT INTO assets (name, provider, category, owner, access_level, contact_name, rule, last_review, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    [
      [
        "Primäres E-Mail-Konto",
        "Google Workspace",
        "Kommunikation",
        "Simon Immler",
        "Executor + Rechtsbeistand",
        "Anna Weber",
        "Freigabe erst nach validiertem Nachweis und Vier-Augen-Prüfung",
        "12.04.2026",
        "Aktiv",
      ],
      [
        "Banking-Übersicht",
        "N26 / CSV-Archiv",
        "Finanzen",
        "Simon Immler",
        "Nur Executor",
        "Dr. Lena Vogt",
        "Nur Leserechte, keine Einzeltransaktionen ohne Testament",
        "08.04.2026",
        "Aktiv",
      ],
      [
        "Apple-ID und Geräte",
        "Apple",
        "Geräte",
        "Simon Immler",
        "Familie nach Admin-Freigabe",
        "Jonas Immler",
        "Zugangscodes separat im Tresor, Geräte erst nach Bestandsaufnahme",
        "03.04.2026",
        "Prüfung fällig",
      ],
      [
        "Webhosting und Domains",
        "Hetzner / Cloudflare",
        "Geschäftsbetrieb",
        "Simon Immler",
        "Continuity-Team",
        "Mara Kühn",
        "Domainverlängerung 12 Monate sichern, danach Übergabeentscheidung",
        "11.04.2026",
        "Aktiv",
      ],
    ].forEach((asset) => withRetry(() => insert.run(...asset)));
  }

  if (countRows("contacts") === 0) {
    const insert = db.prepare(
      "INSERT INTO contacts (name, relation, email, phone, role, scope, verification_status, response_expectation, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    [
      [
        "Anna Weber",
        "Ehepartnerin",
        "anna.weber@example.de",
        "+49 171 555 0142",
        "Hauptexecutorin",
        "Privatkonten, Kommunikation, Geräte",
        "Identität bestätigt",
        "Reaktion innerhalb von 2 Stunden",
        "Aktiv",
      ],
      [
        "Dr. Lena Vogt",
        "Rechtsbeistand",
        "kanzlei.vogt@example.de",
        "+49 89 555 7788",
        "Rechtliche Freigabe",
        "Testament, Vollmachten, Nachweise",
        "Kanzleidaten verifiziert",
        "Reaktion am selben Werktag",
        "Aktiv",
      ],
      [
        "Jonas Immler",
        "Bruder",
        "jonas.immler@example.de",
        "+49 173 555 6611",
        "Familienkontakt",
        "Persönliche Hinweise, Erinnerungen, Geräteabholung",
        "Einladung offen",
        "Reaktion innerhalb von 24 Stunden",
        "Ausstehend",
      ],
      [
        "Mara Kühn",
        "Geschäftspartnerin",
        "mara.kuehn@example.de",
        "+49 40 555 2019",
        "Business Continuity",
        "Domains, Hosting, laufende Verträge",
        "Videoident abgeschlossen",
        "Reaktion innerhalb von 4 Stunden",
        "Aktiv",
      ],
    ].forEach((contact) => withRetry(() => insert.run(...contact)));
  }

  if (countRows("vault_items") === 0) {
    const insert = db.prepare(
      "INSERT INTO vault_items (title, category, visibility, status, retention, updated_at, summary) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    [
      [
        "Testament und Nachlassverfügung",
        "Recht",
        "Nur Executor + Rechtsbeistand",
        "Freigabebereit",
        "10 Jahre",
        "14.04.2026",
        "Unterzeichnete Version mit Verweis auf physisches Original und Ansprechpartner.",
      ],
      [
        "Notfallbrief an Familie",
        "Persönlich",
        "Familie nach Prüfung",
        "Versiegelt",
        "Unbegrenzt",
        "13.04.2026",
        "Persönliche Nachricht, Kontaktreihenfolge und Hinweise zu Erinnerungsstücken.",
      ],
      [
        "Betriebsfortführung: Zugangspaket",
        "Betrieb",
        "Continuity-Team",
        "Aktiv",
        "36 Monate",
        "11.04.2026",
        "Runbook mit Hosting, Domain-Registry, Rechnungskontakten und Eskalationspfaden.",
      ],
      [
        "Liste physischer Schließfächer",
        "Vermögen",
        "Nur Executor",
        "Prüfung fällig",
        "Bis Entnahme",
        "05.04.2026",
        "Standorte, Vertragsnummern und notwendige Nachweise für die Öffnung.",
      ],
    ].forEach((item) => withRetry(() => insert.run(...item)));
  }

  if (countRows("requests") === 0) {
    const insert = db.prepare(
      "INSERT INTO requests (label, requester_name, relation, scope, evidence_status, status, submitted_at, next_step) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    [
      [
        "REQ-2026-104",
        "Anna Weber",
        "Ehepartnerin",
        "Kommunikation + persönliche Hinweise",
        "Sterbeurkunde geprüft",
        "In Prüfung",
        "14.04.2026, 10:15",
        "Zweite Freigabe durch Rechtsbeistand ausstehend",
      ],
      [
        "REQ-2026-103",
        "Mara Kühn",
        "Geschäftspartnerin",
        "Domains und Hosting",
        "Handelsregisterbezug bestätigt",
        "Freigegeben",
        "12.04.2026, 16:40",
        "Zugriffspaket wurde am 13.04.2026 bereitgestellt",
      ],
      [
        "REQ-2026-102",
        "Jonas Immler",
        "Bruder",
        "Persönliche Nachricht",
        "Nachweis unvollständig",
        "Rückfrage gesendet",
        "09.04.2026, 09:05",
        "Zusätzlicher Identitätsnachweis angefordert",
      ],
    ].forEach((request) => withRetry(() => insert.run(...request)));
  }

  if (countRows("checklist_items") === 0) {
    const insert = db.prepare(
      "INSERT INTO checklist_items (title, owner, due_label, status) VALUES (?, ?, ?, ?)",
    );
    [
      ["Begünstigte Rollen final prüfen", "Eigentümer", "diese Woche", "Erledigt"],
      ["Letzte Passwort-Übersicht abgleichen", "Eigentümer", "heute", "Offen"],
      ["Business-Continuity-Paket bestätigen", "Mara Kühn", "bis 20.04.2026", "In Arbeit"],
      ["Notfallbrief final verschließen", "Anna Weber", "bis 22.04.2026", "Offen"],
    ].forEach((item) => withRetry(() => insert.run(...item)));
  }

  if (countRows("activity_log") === 0) {
    const insert = db.prepare(
      "INSERT INTO activity_log (kind, title, detail, created_at) VALUES (?, ?, ?, ?)",
    );
    [
      [
        "vault",
        "Notfallbrief aktualisiert",
        "Zusätzliche Übergabehinweise für Familie in den Tresor übernommen.",
        "vor 2 Stunden",
      ],
      [
        "request",
        "Anfrage REQ-2026-104 geprüft",
        "Sterbeurkunde validiert und an juristische Zweitprüfung weitergeleitet.",
        "heute",
      ],
      [
        "contact",
        "Mara Kühn bestätigt",
        "Videoident abgeschlossen, Business-Continuity-Rolle aktiviert.",
        "gestern",
      ],
      [
        "asset",
        "Hosting-Runbook ergänzt",
        "Neue Ansprechpartner für Domain-Transfers dokumentiert.",
        "vor 3 Tagen",
      ],
    ].forEach((entry) => withRetry(() => insert.run(...entry)));
  }
}

seed();

function addActivity(kind: string, title: string, detail: string) {
  withRetry(() =>
    db.prepare("INSERT INTO activity_log (kind, title, detail, created_at) VALUES (?, ?, ?, ?)")
      .run(kind, title, detail, nowLabel()),
  );
}

export function listAssets() {
  return withRetry(
    () =>
      db
        .prepare(
          "SELECT id, name, provider, category, owner, access_level AS accessLevel, contact_name AS contactName, rule, last_review AS lastReview, status FROM assets ORDER BY id DESC",
        )
        .all() as AssetRecord[],
  );
}

export function createAsset(input: Omit<AssetRecord, "id">) {
  withRetry(() =>
    db.prepare(
      "INSERT INTO assets (name, provider, category, owner, access_level, contact_name, rule, last_review, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      input.name,
      input.provider,
      input.category,
      input.owner,
      input.accessLevel,
      input.contactName,
      input.rule,
      input.lastReview,
      input.status,
    ),
  );

  addActivity("asset", "Neues Asset angelegt", `${input.name} wurde mit Zugriffsebene "${input.accessLevel}" erfasst.`);
  return listAssets()[0];
}

export function listContacts() {
  return withRetry(
    () =>
      db
        .prepare(
          "SELECT id, name, relation, email, phone, role, scope, verification_status AS verificationStatus, response_expectation AS responseExpectation, status FROM contacts ORDER BY id DESC",
        )
        .all() as ContactRecord[],
  );
}

export function createContact(input: Omit<ContactRecord, "id">) {
  withRetry(() =>
    db.prepare(
      "INSERT INTO contacts (name, relation, email, phone, role, scope, verification_status, response_expectation, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      input.name,
      input.relation,
      input.email,
      input.phone,
      input.role,
      input.scope,
      input.verificationStatus,
      input.responseExpectation,
      input.status,
    ),
  );

  addActivity("contact", "Vertrauensperson hinzugefügt", `${input.name} wurde als ${input.role.toLowerCase()} registriert.`);
  return listContacts()[0];
}

export function listVaultItems() {
  return withRetry(
    () =>
      db
        .prepare(
          "SELECT id, title, category, visibility, status, retention, updated_at AS updatedAt, summary FROM vault_items ORDER BY id DESC",
        )
        .all() as VaultRecord[],
  );
}

export function createVaultItem(input: Omit<VaultRecord, "id">) {
  withRetry(() =>
    db.prepare(
      "INSERT INTO vault_items (title, category, visibility, status, retention, updated_at, summary) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      input.title,
      input.category,
      input.visibility,
      input.status,
      input.retention,
      input.updatedAt,
      input.summary,
    ),
  );

  addActivity("vault", "Tresorinhalt ergänzt", `${input.title} wurde für "${input.visibility}" vorbereitet.`);
  return listVaultItems()[0];
}

export function listRequests() {
  return withRetry(
    () =>
      db
        .prepare(
          "SELECT id, label, requester_name AS requesterName, relation, scope, evidence_status AS evidenceStatus, status, submitted_at AS submittedAt, next_step AS nextStep FROM requests ORDER BY id DESC",
        )
        .all() as RequestRecord[],
  );
}

export function createRequest(input: Omit<RequestRecord, "id">) {
  withRetry(() =>
    db.prepare(
      "INSERT INTO requests (label, requester_name, relation, scope, evidence_status, status, submitted_at, next_step) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      input.label,
      input.requesterName,
      input.relation,
      input.scope,
      input.evidenceStatus,
      input.status,
      input.submittedAt,
      input.nextStep,
    ),
  );

  addActivity(
    "request",
    `Neue Anfrage ${input.label}`,
    `${input.requesterName} hat eine Freigabe für "${input.scope}" eingereicht.`,
  );
  return listRequests()[0];
}

export function updateRequestStatus(id: number, status: string, nextStep: string) {
  withRetry(() => db.prepare("UPDATE requests SET status = ?, next_step = ? WHERE id = ?").run(status, nextStep, id));
  const request = withRetry(
    () =>
      db
        .prepare(
          "SELECT id, label, requester_name AS requesterName, relation, scope, evidence_status AS evidenceStatus, status, submitted_at AS submittedAt, next_step AS nextStep FROM requests WHERE id = ?",
        )
        .get(id) as RequestRecord | undefined,
  );

  if (request) {
    addActivity("request", `Anfrage ${request.label} aktualisiert`, `${status}: ${nextStep}`);
  }

  return request;
}

export function listChecklist() {
  return withRetry(
    () =>
      db
        .prepare(
          "SELECT id, title, owner, due_label AS dueLabel, status FROM checklist_items ORDER BY CASE status WHEN 'Offen' THEN 0 WHEN 'In Arbeit' THEN 1 ELSE 2 END, id ASC",
        )
        .all() as ChecklistRecord[],
  );
}

export function updateChecklistStatus(id: number, status: string) {
  withRetry(() => db.prepare("UPDATE checklist_items SET status = ? WHERE id = ?").run(status, id));
  const item = withRetry(
    () =>
      db
        .prepare(
          "SELECT id, title, owner, due_label AS dueLabel, status FROM checklist_items WHERE id = ?",
        )
        .get(id) as ChecklistRecord | undefined,
  );

  if (item) {
    addActivity("checklist", "Bereitschaftsaufgabe aktualisiert", `${item.title} steht jetzt auf "${status}".`);
  }

  return item;
}

export function listActivities() {
  return withRetry(
    () =>
      db
        .prepare(
          "SELECT id, kind, title, detail, created_at AS createdAt FROM activity_log ORDER BY id DESC LIMIT 10",
        )
        .all() as ActivityRecord[],
  );
}
