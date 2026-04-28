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

function isDuplicateColumnError(error: unknown) {
  return error instanceof Error && error.message.includes("duplicate column name");
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
    customer_reference TEXT NOT NULL DEFAULT '',
    cost_label TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT '',
    action_goal TEXT NOT NULL DEFAULT 'Prüfen',
    automation_level TEXT NOT NULL DEFAULT 'Manuelle Prüfung',
    cancellation_status TEXT NOT NULL DEFAULT 'Angaben fehlen',
    rule TEXT NOT NULL,
    last_review TEXT NOT NULL,
    status TEXT NOT NULL,
    is_example INTEGER NOT NULL DEFAULT 0
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
    status TEXT NOT NULL,
    is_example INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS vault_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    visibility TEXT NOT NULL,
    status TEXT NOT NULL,
    retention TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    summary TEXT NOT NULL,
    is_example INTEGER NOT NULL DEFAULT 0
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
    next_step TEXT NOT NULL,
    is_example INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    owner TEXT NOT NULL,
    due_label TEXT NOT NULL,
    status TEXT NOT NULL,
    is_example INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL,
    is_example INTEGER NOT NULL DEFAULT 0
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

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (hasColumn(table, column)) return;

  try {
    withRetry(() => db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`));
  } catch (error) {
    if (!isDuplicateColumnError(error)) {
      throw error;
    }
  }
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
          customer_reference TEXT NOT NULL DEFAULT '',
          cost_label TEXT NOT NULL DEFAULT '',
          payment_method TEXT NOT NULL DEFAULT '',
          action_goal TEXT NOT NULL DEFAULT 'Prüfen',
          automation_level TEXT NOT NULL DEFAULT 'Manuelle Prüfung',
          cancellation_status TEXT NOT NULL DEFAULT 'Angaben fehlen',
          rule TEXT NOT NULL,
          last_review TEXT NOT NULL,
          status TEXT NOT NULL,
          is_example INTEGER NOT NULL DEFAULT 0
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
          status TEXT NOT NULL,
          is_example INTEGER NOT NULL DEFAULT 0
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
          next_step TEXT NOT NULL,
          is_example INTEGER NOT NULL DEFAULT 0
        );
      `,
    );
  }

  const exampleTables = ["assets", "contacts", "vault_items", "requests", "checklist_items", "activity_log"];
  exampleTables.forEach((table) => {
    addColumnIfMissing(table, "is_example", "INTEGER NOT NULL DEFAULT 0");
  });

  const assetColumns = [
    ["customer_reference", "TEXT NOT NULL DEFAULT ''"],
    ["cost_label", "TEXT NOT NULL DEFAULT ''"],
    ["payment_method", "TEXT NOT NULL DEFAULT ''"],
    ["action_goal", "TEXT NOT NULL DEFAULT 'Prüfen'"],
    ["automation_level", "TEXT NOT NULL DEFAULT 'Manuelle Prüfung'"],
    ["cancellation_status", "TEXT NOT NULL DEFAULT 'Angaben fehlen'"],
  ] as const;

  assetColumns.forEach(([column, definition]) => addColumnIfMissing("assets", column, definition));

  markSeedRowsAsExamples();
}

function markSeedRowsAsExamples() {
  withRetry(() =>
    db.exec(`
      UPDATE assets
      SET is_example = 1
      WHERE name IN ('Primäres E-Mail-Konto', 'Banking-Übersicht', 'Apple-ID und Geräte', 'Webhosting und Domains');

      UPDATE assets
      SET
        action_goal = CASE WHEN action_goal = '' OR action_goal IS NULL THEN 'Kündigen' ELSE action_goal END,
        automation_level = CASE WHEN automation_level = '' OR automation_level IS NULL THEN 'Kündigungsschreiben vorbereitet' ELSE automation_level END,
        cancellation_status = CASE WHEN cancellation_status = '' OR cancellation_status IS NULL THEN 'Angaben fehlen' ELSE cancellation_status END,
        customer_reference = CASE WHEN customer_reference = '' OR customer_reference IS NULL THEN 'Beispiel-Kundennummer ergänzen' ELSE customer_reference END,
        cost_label = CASE WHEN cost_label = '' OR cost_label IS NULL THEN 'ca. 12 EUR / Monat' ELSE cost_label END,
        payment_method = CASE WHEN payment_method = '' OR payment_method IS NULL THEN 'SEPA / Karte prüfen' ELSE payment_method END;

      UPDATE contacts
      SET is_example = 1
      WHERE name IN ('Anna Weber', 'Dr. Lena Vogt', 'Jonas Immler', 'Mara Kühn');

      UPDATE contacts
      SET
        name = CASE name
          WHEN 'Anna Weber' THEN 'Hauptkontakt'
          WHEN 'Dr. Lena Vogt' THEN 'Rechtsbeistand'
          WHEN 'Jonas Immler' THEN 'Familienkontakt'
          WHEN 'Mara Kühn' THEN 'Business-Kontakt'
          ELSE name
        END,
        email = CASE name
          WHEN 'Anna Weber' THEN 'hauptkontakt@example.de'
          WHEN 'Dr. Lena Vogt' THEN 'rechtsbeistand@example.de'
          WHEN 'Jonas Immler' THEN 'familie@example.de'
          WHEN 'Mara Kühn' THEN 'business@example.de'
          ELSE email
        END,
        phone = CASE name
          WHEN 'Anna Weber' THEN '+49 000 000000'
          WHEN 'Dr. Lena Vogt' THEN '+49 000 000001'
          WHEN 'Jonas Immler' THEN '+49 000 000002'
          WHEN 'Mara Kühn' THEN '+49 000 000003'
          ELSE phone
        END,
        relation = CASE name
          WHEN 'Anna Weber' THEN 'Private Vertrauensperson'
          WHEN 'Dr. Lena Vogt' THEN 'Rechtliche Prüfung'
          WHEN 'Jonas Immler' THEN 'Familienrolle'
          WHEN 'Mara Kühn' THEN 'Betriebliche Rolle'
          ELSE relation
        END
      WHERE name IN ('Anna Weber', 'Dr. Lena Vogt', 'Jonas Immler', 'Mara Kühn');

      UPDATE assets
      SET contact_name = CASE contact_name
        WHEN 'Anna Weber' THEN 'Hauptkontakt'
        WHEN 'Dr. Lena Vogt' THEN 'Rechtsbeistand'
        WHEN 'Jonas Immler' THEN 'Familienkontakt'
        WHEN 'Mara Kühn' THEN 'Business-Kontakt'
        ELSE contact_name
      END;

      UPDATE vault_items
      SET is_example = 1
      WHERE title IN (
        'Testament und Nachlassverfügung',
        'Notfallbrief an Familie',
        'Betriebsfortführung: Zugangspaket',
        'Liste physischer Schließfächer'
      );

      UPDATE requests
      SET is_example = 1
      WHERE label IN ('REQ-2026-104', 'REQ-2026-103', 'REQ-2026-102');

      UPDATE requests
      SET
        requester_name = CASE requester_name
          WHEN 'Anna Weber' THEN 'Hauptkontakt'
          WHEN 'Jonas Immler' THEN 'Familienkontakt'
          WHEN 'Mara Kühn' THEN 'Business-Kontakt'
          ELSE requester_name
        END,
        relation = CASE requester_name
          WHEN 'Anna Weber' THEN 'Private Vertrauensperson'
          WHEN 'Jonas Immler' THEN 'Familienrolle'
          WHEN 'Mara Kühn' THEN 'Betriebliche Rolle'
          ELSE relation
        END;

      UPDATE checklist_items
      SET owner = CASE owner
        WHEN 'Anna Weber' THEN 'Kontakt'
        WHEN 'Mara Kühn' THEN 'Kontakt'
        ELSE owner
      END;

      UPDATE activity_log
      SET is_example = 1
      WHERE title IN (
        'Notfallbrief aktualisiert',
        'Anfrage REQ-2026-104 geprüft',
        'Mara Kühn bestätigt',
        'Hosting-Runbook ergänzt'
      );

      UPDATE activity_log
      SET
        title = REPLACE(title, 'Mara Kühn', 'Business-Kontakt'),
        detail = REPLACE(
          REPLACE(
            REPLACE(detail, 'Mara Kühn', 'Business-Kontakt'),
            'Anna Weber',
            'Hauptkontakt'
          ),
          'Jonas Immler',
          'Familienkontakt'
        );
    `),
  );
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
      "INSERT INTO assets (name, provider, category, owner, access_level, contact_name, customer_reference, cost_label, payment_method, action_goal, automation_level, cancellation_status, rule, last_review, status, is_example) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
    );
    [
      [
        "Webhosting und Domains",
        "Hetzner / Cloudflare",
        "Laufender Vertrag",
        "Simon Immler",
        "Executor + Verwalter",
        "Hauptkontakt",
        "KD-123456",
        "18 EUR / Monat",
        "SEPA-Lastschrift",
        "Kündigen",
        "Kündigungsschreiben vorbereitet",
        "Bereit",
        "Nach Sterbeurkunde Anbieter informieren, Domainlaufzeit prüfen und Hosting fristgerecht kündigen.",
        "12.04.2026",
        "Kündigungsbereit",
      ],
    ].slice(0, 1).forEach((asset) => withRetry(() => insert.run(...asset)));
  }

  if (countRows("contacts") === 0) {
    const insert = db.prepare(
      "INSERT INTO contacts (name, relation, email, phone, role, scope, verification_status, response_expectation, status, is_example) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
    );
    [
      [
        "Hauptkontakt",
        "Private Vertrauensperson",
        "hauptkontakt@example.de",
        "+49 000 000000",
        "Hauptexecutorin",
        "Privatkonten, Kommunikation, Geräte",
        "Identität bestätigt",
        "Reaktion innerhalb von 2 Stunden",
        "Aktiv",
      ],
      [
        "Rechtsbeistand",
        "Rechtsbeistand",
        "rechtsbeistand@example.de",
        "+49 000 000001",
        "Rechtliche Freigabe",
        "Testament, Vollmachten, Nachweise",
        "Kanzleidaten verifiziert",
        "Reaktion am selben Werktag",
        "Aktiv",
      ],
      [
        "Familienkontakt",
        "Familienrolle",
        "familie@example.de",
        "+49 000 000002",
        "Familienkontakt",
        "Persönliche Hinweise, Erinnerungen, Geräteabholung",
        "Einladung offen",
        "Reaktion innerhalb von 24 Stunden",
        "Ausstehend",
      ],
      [
        "Business-Kontakt",
        "Betriebliche Rolle",
        "business@example.de",
        "+49 000 000003",
        "Business Continuity",
        "Domains, Hosting, laufende Verträge",
        "Videoident abgeschlossen",
        "Reaktion innerhalb von 4 Stunden",
        "Aktiv",
      ],
    ].slice(0, 1).forEach((contact) => withRetry(() => insert.run(...contact)));
  }

  if (countRows("vault_items") === 0) {
    const insert = db.prepare(
      "INSERT INTO vault_items (title, category, visibility, status, retention, updated_at, summary, is_example) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
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
    ].slice(0, 1).forEach((item) => withRetry(() => insert.run(...item)));
  }

  if (countRows("requests") === 0) {
    const insert = db.prepare(
      "INSERT INTO requests (label, requester_name, relation, scope, evidence_status, status, submitted_at, next_step, is_example) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
    );
    [
      [
        "REQ-2026-104",
        "Hauptkontakt",
        "Private Vertrauensperson",
        "Kommunikation + persönliche Hinweise",
        "Sterbeurkunde geprüft",
        "In Prüfung",
        "14.04.2026, 10:15",
        "Zweite Freigabe durch Rechtsbeistand ausstehend",
      ],
      [
        "REQ-2026-103",
        "Business-Kontakt",
        "Betriebliche Rolle",
        "Domains und Hosting",
        "Handelsregisterbezug bestätigt",
        "Freigegeben",
        "12.04.2026, 16:40",
        "Zugriffspaket wurde am 13.04.2026 bereitgestellt",
      ],
      [
        "REQ-2026-102",
        "Familienkontakt",
        "Familienrolle",
        "Persönliche Nachricht",
        "Nachweis unvollständig",
        "Rückfrage gesendet",
        "09.04.2026, 09:05",
        "Zusätzlicher Identitätsnachweis angefordert",
      ],
    ].slice(0, 1).forEach((request) => withRetry(() => insert.run(...request)));
  }

  if (countRows("checklist_items") === 0) {
    const insert = db.prepare(
      "INSERT INTO checklist_items (title, owner, due_label, status, is_example) VALUES (?, ?, ?, ?, 0)",
    );
    [
      ["Begünstigte Rollen final prüfen", "Eigentümer", "diese Woche", "Erledigt"],
      ["Letzte Passwort-Übersicht abgleichen", "Eigentümer", "heute", "Offen"],
      ["Business-Continuity-Paket bestätigen", "Kontakt", "bis 20.04.2026", "In Arbeit"],
      ["Kundennummern für kündigungsrelevante Verträge ergänzen", "Eigentümer", "bis 22.04.2026", "Offen"],
    ].forEach((item) => withRetry(() => insert.run(...item)));
  }

  if (countRows("activity_log") === 0) {
    const insert = db.prepare(
      "INSERT INTO activity_log (kind, title, detail, created_at, is_example) VALUES (?, ?, ?, ?, 1)",
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
        "Business-Kontakt bestätigt",
        "Videoident abgeschlossen, Business-Continuity-Rolle aktiviert.",
        "gestern",
      ],
      [
        "asset",
        "Hosting-Runbook ergänzt",
        "Neue Ansprechpartner für Domain-Transfers dokumentiert.",
        "vor 3 Tagen",
      ],
    ].slice(0, 1).forEach((entry) => withRetry(() => insert.run(...entry)));
  }
}

seed();

function addActivity(kind: string, title: string, detail: string) {
  withRetry(() =>
    db.prepare("INSERT INTO activity_log (kind, title, detail, created_at) VALUES (?, ?, ?, ?)")
      .run(kind, title, detail, nowLabel()),
  );
}

type ExampleRow = { isExample: number };

function hideExamplesWhenUserDataExists<T extends ExampleRow>(rows: T[]) {
  const userRows = rows.filter((row) => row.isExample === 0);
  return userRows.length > 0 ? userRows : rows.slice(0, 1);
}

export function listAssets() {
  const rows = withRetry(
    () =>
      db
        .prepare(
          "SELECT id, name, provider, category, owner, access_level AS accessLevel, contact_name AS contactName, customer_reference AS customerReference, cost_label AS costLabel, payment_method AS paymentMethod, action_goal AS actionGoal, automation_level AS automationLevel, cancellation_status AS cancellationStatus, rule, last_review AS lastReview, status, is_example AS isExample FROM assets WHERE name NOT LIKE 'Test Button%' ORDER BY id DESC",
        )
        .all() as Array<AssetRecord & ExampleRow>,
  );
  return hideExamplesWhenUserDataExists(rows);
}

export function createAsset(input: Omit<AssetRecord, "id">) {
  withRetry(() =>
    db.prepare(
      "INSERT INTO assets (name, provider, category, owner, access_level, contact_name, customer_reference, cost_label, payment_method, action_goal, automation_level, cancellation_status, rule, last_review, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      input.name,
      input.provider,
      input.category,
      input.owner,
      input.accessLevel,
      input.contactName,
      input.customerReference,
      input.costLabel,
      input.paymentMethod,
      input.actionGoal,
      input.automationLevel,
      input.cancellationStatus,
      input.rule,
      input.lastReview,
      input.status,
    ),
  );

  addActivity("asset", "Neuer Kündigungsplan angelegt", `${input.name} wurde mit Ziel "${input.actionGoal}" und Status "${input.cancellationStatus}" erfasst.`);
  return listAssets()[0];
}

export function listContacts() {
  const rows = withRetry(
    () =>
      db
        .prepare(
          "SELECT id, name, relation, email, phone, role, scope, verification_status AS verificationStatus, response_expectation AS responseExpectation, status, is_example AS isExample FROM contacts WHERE name != 'QA Person' ORDER BY id DESC",
        )
        .all() as Array<ContactRecord & ExampleRow>,
  );
  return hideExamplesWhenUserDataExists(rows);
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
  const rows = withRetry(
    () =>
      db
        .prepare(
          "SELECT id, title, category, visibility, status, retention, updated_at AS updatedAt, summary, is_example AS isExample FROM vault_items WHERE title NOT LIKE 'Test Button%' ORDER BY id DESC",
        )
        .all() as Array<VaultRecord & ExampleRow>,
  );
  return hideExamplesWhenUserDataExists(rows);
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
  const rows = withRetry(
    () =>
      db
        .prepare(
          "SELECT id, label, requester_name AS requesterName, relation, scope, evidence_status AS evidenceStatus, status, submitted_at AS submittedAt, next_step AS nextStep, is_example AS isExample FROM requests WHERE label NOT LIKE 'Test Button%' ORDER BY id DESC",
        )
        .all() as Array<RequestRecord & ExampleRow>,
  );
  return hideExamplesWhenUserDataExists(rows);
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
  const rows = withRetry(
    () =>
      db
        .prepare(
          "SELECT id, kind, title, detail, created_at AS createdAt, is_example AS isExample FROM activity_log WHERE title NOT LIKE '%Test Button%' AND title NOT LIKE '%QA Person%' AND detail NOT LIKE '%Test Button%' AND detail NOT LIKE '%QA Person%' ORDER BY id DESC LIMIT 10",
        )
        .all() as Array<ActivityRecord & ExampleRow>,
  );
  return hideExamplesWhenUserDataExists(rows);
}
