import { NextResponse } from "next/server";
import { updateRequestStatus } from "@/lib/db";
import { hasMinLength, normalizeText } from "@/lib/validation";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: string;
    nextStep?: string;
  };

  const status = normalizeText(body.status);
  const nextStep = normalizeText(body.nextStep);

  if (!status || !nextStep) {
    return NextResponse.json({ error: "Status oder nächster Schritt fehlt." }, { status: 400 });
  }

  if (!hasMinLength(nextStep, 8)) {
    return NextResponse.json(
      { error: "Der nächste Schritt muss die Bearbeitungsentscheidung konkret beschreiben." },
      { status: 400 },
    );
  }

  const entry = updateRequestStatus(Number(id), status, nextStep);
  if (!entry) {
    return NextResponse.json({ error: "Anfrage nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json({ request: entry });
}
