import { NextResponse } from "next/server";
import { createVaultItem, listVaultItems } from "@/lib/db";
import { hasMinLength, normalizeText } from "@/lib/validation";

export async function GET() {
  return NextResponse.json({ vaultItems: listVaultItems() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    category?: string;
    visibility?: string;
    status?: string;
    retention?: string;
    updatedAt?: string;
    summary?: string;
  };

  const payload = {
    title: normalizeText(body.title),
    category: normalizeText(body.category),
    visibility: normalizeText(body.visibility),
    status: normalizeText(body.status),
    retention: normalizeText(body.retention),
    updatedAt: normalizeText(body.updatedAt),
    summary: normalizeText(body.summary),
  };

  if (!Object.values(payload).every(Boolean)) {
    return NextResponse.json({ error: "Bitte alle Pflichtfelder für den Tresoreintrag ausfüllen." }, { status: 400 });
  }

  if (!hasMinLength(payload.title, 3) || !hasMinLength(payload.summary, 20)) {
    return NextResponse.json(
      { error: "Titel und Kurzbeschreibung müssen den Zweck des Tresoreintrags klar benennen." },
      { status: 400 },
    );
  }

  const vaultItem = createVaultItem(payload);

  return NextResponse.json({ vaultItem }, { status: 201 });
}
