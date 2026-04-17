import { NextResponse } from "next/server";
import { createAsset, listAssets } from "@/lib/db";

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
    rule?: string;
    lastReview?: string;
    status?: string;
  };

  if (
    !body.name ||
    !body.provider ||
    !body.category ||
    !body.owner ||
    !body.accessLevel ||
    !body.contactName ||
    !body.rule ||
    !body.lastReview ||
    !body.status
  ) {
    return NextResponse.json({ error: "Ungültige Asset-Daten." }, { status: 400 });
  }

  const asset = createAsset({
    name: body.name,
    provider: body.provider,
    category: body.category,
    owner: body.owner,
    accessLevel: body.accessLevel,
    contactName: body.contactName,
    rule: body.rule,
    lastReview: body.lastReview,
    status: body.status,
  });

  return NextResponse.json({ asset }, { status: 201 });
}
