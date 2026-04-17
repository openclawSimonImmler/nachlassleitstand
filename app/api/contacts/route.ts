import { NextResponse } from "next/server";
import { createContact, listContacts } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ contacts: listContacts() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    relation?: string;
    email?: string;
    phone?: string;
    role?: string;
    scope?: string;
    verificationStatus?: string;
    responseExpectation?: string;
    status?: string;
  };

  if (
    !body.name ||
    !body.relation ||
    !body.email ||
    !body.phone ||
    !body.role ||
    !body.scope ||
    !body.verificationStatus ||
    !body.responseExpectation ||
    !body.status
  ) {
    return NextResponse.json({ error: "Ungültige Kontakt-Daten." }, { status: 400 });
  }

  const contact = createContact({
    name: body.name,
    relation: body.relation,
    email: body.email,
    phone: body.phone,
    role: body.role,
    scope: body.scope,
    verificationStatus: body.verificationStatus,
    responseExpectation: body.responseExpectation,
    status: body.status,
  });

  return NextResponse.json({ contact }, { status: 201 });
}
