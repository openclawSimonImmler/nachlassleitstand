import { NextResponse } from "next/server";
import { createContact, listContacts } from "@/lib/db";
import { hasMinLength, isValidEmail, isValidPhone, normalizeEmail, normalizeText } from "@/lib/validation";

export async function GET() {
  return NextResponse.json({ contacts: listContacts() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    relation?: string;
    email?: string;
    phone?: string;
    role?: string;
    scope?: string;
    verificationStatus?: string;
    responseExpectation?: string;
    status?: string;
  };

  const payload = {
    name: normalizeText(body.name),
    relation: normalizeText(body.relation),
    email: normalizeEmail(body.email),
    phone: normalizeText(body.phone),
    role: normalizeText(body.role),
    scope: normalizeText(body.scope),
    verificationStatus: normalizeText(body.verificationStatus),
    responseExpectation: normalizeText(body.responseExpectation),
    status: normalizeText(body.status),
  };

  if (!Object.values(payload).every(Boolean)) {
    return NextResponse.json({ error: "Bitte alle Pflichtfelder für die Vertrauensperson ausfüllen." }, { status: 400 });
  }

  if (!hasMinLength(payload.name, 3) || !hasMinLength(payload.relation, 2)) {
    return NextResponse.json(
      { error: "Name und Beziehung der Vertrauensperson müssen aussagekräftig angegeben werden." },
      { status: 400 },
    );
  }

  if (!isValidEmail(payload.email)) {
    return NextResponse.json({ error: "Bitte eine gültige E-Mail-Adresse hinterlegen." }, { status: 400 });
  }

  if (!isValidPhone(payload.phone)) {
    return NextResponse.json({ error: "Bitte eine erreichbare Telefonnummer hinterlegen." }, { status: 400 });
  }

  if (!hasMinLength(payload.scope, 10)) {
    return NextResponse.json(
      { error: "Der Zuständigkeitsbereich sollte klar beschreiben, wofür diese Person freigegeben ist." },
      { status: 400 },
    );
  }

  const contact = createContact(payload);

  return NextResponse.json({ contact }, { status: 201 });
}
