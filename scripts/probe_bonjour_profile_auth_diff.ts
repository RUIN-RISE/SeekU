import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { BonjourClient, type BonjourProfile } from "../packages/adapters/src/bonjour/client.js";

interface ProbeRow {
  handle: string;
  anonymous: {
    ok: boolean;
    error?: string;
    hasName: boolean;
    hasBasicInfo: boolean;
    hasGridItems: boolean;
    gridItemCount: number;
    hasContacts: boolean;
    hasSocials: boolean;
    keys: string[];
  };
  authenticated: {
    ok: boolean;
    error?: string;
    hasName: boolean;
    hasBasicInfo: boolean;
    hasGridItems: boolean;
    gridItemCount: number;
    hasContacts: boolean;
    hasSocials: boolean;
    keys: string[];
  };
  identicalJson: boolean | null;
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
    } else {
      args.set(key, "true");
    }
  }
  return args;
}

function summarizeProfile(profile: BonjourProfile) {
  return {
    hasName: typeof profile.name === "string" && profile.name.trim().length > 0,
    hasBasicInfo: Boolean(profile.basicInfo),
    hasGridItems: Array.isArray(profile.gridItems),
    gridItemCount: Array.isArray(profile.gridItems) ? profile.gridItems.length : 0,
    hasContacts: Array.isArray(profile.contacts) && profile.contacts.length > 0,
    hasSocials: Array.isArray(profile.socials) && profile.socials.length > 0,
    keys: Object.keys(profile).sort()
  };
}

async function safeFetch(
  client: BonjourClient,
  handle: string,
  inflate: boolean
): Promise<{ profile?: BonjourProfile; error?: string }> {
  try {
    const profile = await client.fetchProfileByHandle(handle, { inflate });
    return { profile };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const handlesPath = args.get("handles");
  const outDir = resolve(args.get("out-dir") ?? "/tmp/bonjour-profile-auth-probe");
  const token =
    args.get("token")?.trim() ||
    process.env.BONJOUR_TOKEN?.trim() ||
    "";

  if (!handlesPath) {
    throw new Error("Missing --handles <json-array-path>");
  }

  if (!token) {
    throw new Error("Missing BONJOUR_TOKEN in env or --token.");
  }

  const handles = JSON.parse(await readFile(resolve(handlesPath), "utf8")) as string[];
  if (!Array.isArray(handles) || handles.length === 0) {
    throw new Error("Handle file must be a non-empty JSON array.");
  }

  const anonymousClient = new BonjourClient();
  const authenticatedClient = new BonjourClient({ authToken: token });

  const rows: ProbeRow[] = [];

  for (const handle of handles) {
    const [anonymous, authenticated] = await Promise.all([
      safeFetch(anonymousClient, handle, true),
      safeFetch(authenticatedClient, handle, true)
    ]);

    rows.push({
      handle,
      anonymous: anonymous.profile
        ? {
            ok: true,
            ...summarizeProfile(anonymous.profile)
          }
        : {
            ok: false,
            error: anonymous.error,
            hasName: false,
            hasBasicInfo: false,
            hasGridItems: false,
            gridItemCount: 0,
            hasContacts: false,
            hasSocials: false,
            keys: []
          },
      authenticated: authenticated.profile
        ? {
            ok: true,
            ...summarizeProfile(authenticated.profile)
          }
        : {
            ok: false,
            error: authenticated.error,
            hasName: false,
            hasBasicInfo: false,
            hasGridItems: false,
            gridItemCount: 0,
            hasContacts: false,
            hasSocials: false,
            keys: []
          },
      identicalJson:
        anonymous.profile && authenticated.profile
          ? JSON.stringify(anonymous.profile) === JSON.stringify(authenticated.profile)
          : null
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    handleCount: rows.length,
    anonymousSuccess: rows.filter((row) => row.anonymous.ok).length,
    authenticatedSuccess: rows.filter((row) => row.authenticated.ok).length,
    identicalJsonCount: rows.filter((row) => row.identicalJson === true).length,
    differentJsonCount: rows.filter((row) => row.identicalJson === false).length,
    authRicherNameCount: rows.filter(
      (row) => !row.anonymous.hasName && row.authenticated.hasName
    ).length,
    authRicherBasicInfoCount: rows.filter(
      (row) => !row.anonymous.hasBasicInfo && row.authenticated.hasBasicInfo
    ).length,
    authRicherGridItemsCount: rows.filter(
      (row) => row.authenticated.gridItemCount > row.anonymous.gridItemCount
    ).length
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  await writeFile(resolve(outDir, "rows.json"), JSON.stringify(rows, null, 2));

  console.log(JSON.stringify({ outDir, summary }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
