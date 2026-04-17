import { NextResponse } from "next/server";
import {
  listActivities,
  listAssets,
  listChecklist,
  listContacts,
  listRequests,
  listVaultItems,
} from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    assets: listAssets(),
    contacts: listContacts(),
    vaultItems: listVaultItems(),
    requests: listRequests(),
    checklist: listChecklist(),
    activities: listActivities(),
  });
}
