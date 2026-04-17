import { NextResponse } from "next/server";
import { updateChecklistStatus } from "@/lib/db";
import { isAllowedValue, normalizeText } from "@/lib/validation";

const allowedChecklistStatuses = ["Offen", "In Arbeit", "Erledigt"] as const;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: string;
  };

  const status = normalizeText(body.status);

  if (!status) {
    return NextResponse.json({ error: "Status fehlt." }, { status: 400 });
  }

  if (!isAllowedValue(status, allowedChecklistStatuses)) {
    return NextResponse.json({ error: "Ungültiger Checklistenstatus." }, { status: 400 });
  }

  const item = updateChecklistStatus(Number(id), status);
  if (!item) {
    return NextResponse.json({ error: "Aufgabe nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json({ item });
}
