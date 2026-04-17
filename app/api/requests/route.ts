import { NextResponse } from "next/server";
import { createRequest, listRequests } from "@/lib/db";
import { hasMinLength, normalizeText } from "@/lib/validation";

export async function GET() {
  return NextResponse.json({ requests: listRequests() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    label?: string;
    requesterName?: string;
    relation?: string;
    scope?: string;
    evidenceStatus?: string;
    status?: string;
    submittedAt?: string;
    nextStep?: string;
  };

  const payload = {
    label: normalizeText(body.label),
    requesterName: normalizeText(body.requesterName),
    relation: normalizeText(body.relation),
    scope: normalizeText(body.scope),
    evidenceStatus: normalizeText(body.evidenceStatus),
    status: normalizeText(body.status),
    submittedAt: normalizeText(body.submittedAt),
    nextStep: normalizeText(body.nextStep),
  };

  if (!Object.values(payload).every(Boolean)) {
    return NextResponse.json({ error: "Bitte alle Pflichtfelder für die Anfrage ausfüllen." }, { status: 400 });
  }

  if (!hasMinLength(payload.requesterName, 3) || !hasMinLength(payload.relation, 2)) {
    return NextResponse.json(
      { error: "Antragsteller und Beziehung müssen klar benannt werden." },
      { status: 400 },
    );
  }

  if (!hasMinLength(payload.scope, 12) || !hasMinLength(payload.evidenceStatus, 6)) {
    return NextResponse.json(
      { error: "Umfang und Nachweisstatus müssen den Vorgang nachvollziehbar beschreiben." },
      { status: 400 },
    );
  }

  const entry = createRequest(payload);

  return NextResponse.json({ request: entry }, { status: 201 });
}
