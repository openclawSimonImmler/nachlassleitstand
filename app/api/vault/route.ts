import { NextResponse } from "next/server";
import { createVaultItem, listVaultItems } from "@/lib/db";

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

  if (
    !body.title ||
    !body.category ||
    !body.visibility ||
    !body.status ||
    !body.retention ||
    !body.updatedAt ||
    !body.summary
  ) {
    return NextResponse.json({ error: "Ungültige Tresor-Daten." }, { status: 400 });
  }

  const vaultItem = createVaultItem({
    title: body.title,
    category: body.category,
    visibility: body.visibility,
    status: body.status,
    retention: body.retention,
    updatedAt: body.updatedAt,
    summary: body.summary,
  });

  return NextResponse.json({ vaultItem }, { status: 201 });
}
