import { NextResponse } from "next/server";
import { createAsset, listAssets } from "@/lib/db";
import { hasMinLength, normalizeText } from "@/lib/validation";

export async function GET() {
  return NextResponse.json({ assets: listAssets() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    provider?: string;
    category?: string;
    owner?: string;
    accessLevel?: string;
    contactName?: string;
    customerReference?: string;
    costLabel?: string;
    paymentMethod?: string;
    actionGoal?: string;
    automationLevel?: string;
    cancellationStatus?: string;
    rule?: string;
    lastReview?: string;
    status?: string;
  };

  const payload = {
    name: normalizeText(body.name),
    provider: normalizeText(body.provider),
    category: normalizeText(body.category),
    owner: normalizeText(body.owner),
    accessLevel: normalizeText(body.accessLevel),
    contactName: normalizeText(body.contactName),
    customerReference: normalizeText(body.customerReference),
    costLabel: normalizeText(body.costLabel),
    paymentMethod: normalizeText(body.paymentMethod),
    actionGoal: normalizeText(body.actionGoal),
    automationLevel: normalizeText(body.automationLevel),
    cancellationStatus: normalizeText(body.cancellationStatus),
    rule: normalizeText(body.rule),
    lastReview: normalizeText(body.lastReview),
    status: normalizeText(body.status),
  };

  const requiredFields = [
    payload.name,
    payload.provider,
    payload.category,
    payload.owner,
    payload.accessLevel,
    payload.contactName,
    payload.costLabel,
    payload.paymentMethod,
    payload.actionGoal,
    payload.automationLevel,
    payload.cancellationStatus,
    payload.rule,
    payload.lastReview,
    payload.status,
  ];

  if (!requiredFields.every(Boolean)) {
    return NextResponse.json({ error: "Bitte alle Pflichtfelder für den Vertrag ausfüllen." }, { status: 400 });
  }

  if (!hasMinLength(payload.name, 3) || !hasMinLength(payload.provider, 2)) {
    return NextResponse.json(
      { error: "Vertrag und Anbieter müssen aussagekräftig erfasst werden." },
      { status: 400 },
    );
  }

  if (!hasMinLength(payload.rule, 12)) {
    return NextResponse.json(
      { error: "Die Freigaberegel muss den Prüf- oder Freigabekontext konkret beschreiben." },
      { status: 400 },
    );
  }

  const asset = createAsset(payload);

  return NextResponse.json({ asset }, { status: 201 });
}
