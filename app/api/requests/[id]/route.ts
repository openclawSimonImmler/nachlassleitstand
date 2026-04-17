import { NextResponse } from "next/server";
import { updateRequestStatus } from "@/lib/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: string;
    nextStep?: string;
  };

  if (!body.status || !body.nextStep) {
    return NextResponse.json({ error: "Status oder nächster Schritt fehlt." }, { status: 400 });
  }

  const entry = updateRequestStatus(Number(id), body.status, body.nextStep);
  if (!entry) {
    return NextResponse.json({ error: "Anfrage nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json({ request: entry });
}
