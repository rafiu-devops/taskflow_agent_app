import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccount = {
  project_id?: string;
  private_key?: string;
  client_email?: string;
  [key: string]: unknown;
};

function parseServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not configured. Add the Firebase service account JSON to the server environment.",
    );
  }

  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY must contain valid JSON.");
  }

  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }

  if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is missing required fields: project_id, private_key, and client_email.",
    );
  }

  return parsed;
}

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(parseServiceAccount() as Parameters<typeof cert>[0]),
      });

export const firestore = getFirestore(app);
firestore.settings({ ignoreUndefinedProperties: true });
export const db = firestore;
