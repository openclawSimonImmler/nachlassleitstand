import { NextResponse } from "next/server";
import { createRequest, listRequests } from "@/lib/db";

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

  if (
    !body.label ||
    !body.requesterName ||
    !body.relation ||
    !body.scope ||
    !body.evidenceStatus ||
    !body.status ||
    !body.submittedAt ||
    !body.nextStep
  ) {
    return NextResponse.json({ error: "Ungültige Request-Daten." }, { status: 400 });
  }

  const entry = createRequest({
    label: body.label,
    requesterName: body.requesterName,
    relation: body.relation,
    scope: body.scope,
    evidenceStatus: body.evidenceStatus,
    status: body.status,
    submittedAt: body.submittedAt,
    nextStep: body.nextStep,
  });

  return NextResponse.json({ request: entry }, { status: 201 });
}
