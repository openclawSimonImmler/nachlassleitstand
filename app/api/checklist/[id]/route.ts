import { NextResponse } from "next/server";
import { updateChecklistStatus } from "@/lib/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: string;
  };

  if (!body.status) {
    return NextResponse.json({ error: "Status fehlt." }, { status: 400 });
  }

  const item = updateChecklistStatus(Number(id), body.status);
  if (!item) {
    return NextResponse.json({ error: "Aufgabe nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json({ item });
}
