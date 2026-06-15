import { createPublicKey, verify as verifySignature, type KeyObject } from "crypto";
import { getServerEnv } from "@/lib/env";
import {
  UNVERIFIED_LEVEL_LABEL,
  getVerifiedLevelBucket,
  type LevelLabel,
} from "@/lib/level-buckets";

type LevelBucketAttestationPayload = {
  aud?: unknown;
  bucket?: unknown;
  exp?: unknown;
  iat?: unknown;
  iss?: unknown;
  jti?: unknown;
  levelMax?: unknown;
  levelMin?: unknown;
  proofType?: unknown;
  root?: unknown;
  typ?: unknown;
  v?: unknown;
};

type ParsedAttestation = {
  encodedHeader: string;
  encodedPayload: string;
  encodedSignature: string;
  header: Record<string, unknown>;
  payload: LevelBucketAttestationPayload;
};

export type VerifyLevelAttestationResult =
  | {
      expiresAtMs: number;
      jti: string;
      levelLabel: LevelLabel;
      ok: true;
    }
  | {
      detail?: string;
      levelLabel: typeof UNVERIFIED_LEVEL_LABEL;
      ok: false;
      reason:
        | "bad_audience"
        | "bad_issuer"
        | "expired"
        | "malformed_payload"
        | "malformed_token"
        | "missing_key"
        | "signature_failed"
        | "unsupported_bucket";
    };

let cachedPublicKey: KeyObject | null = null;
let cachedPublicKeySource: string | null = null;

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  return Buffer.from(padded, "base64");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getPublicKey() {
  const source = getServerEnv().zkAttestationPublicKeyB64;
  if (!source) {
    return null;
  }

  if (cachedPublicKey && cachedPublicKeySource === source) {
    return cachedPublicKey;
  }

  cachedPublicKey = createPublicKey({
    format: "der",
    key: Buffer.from(source, "base64"),
    type: "spki",
  });
  cachedPublicKeySource = source;
  return cachedPublicKey;
}

function parseToken(token: string): ParsedAttestation | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8"));
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));

    if (!isRecord(header) || !isRecord(payload)) {
      return null;
    }

    return {
      encodedHeader,
      encodedPayload,
      encodedSignature,
      header,
      payload,
    };
  } catch {
    return null;
  }
}

function isSafeTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isValidTokenId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{16,200}$/.test(value)
  );
}

function verifyTokenSignature(parsed: ParsedAttestation, publicKey: KeyObject) {
  return verifySignature(
    null,
    Buffer.from(`${parsed.encodedHeader}.${parsed.encodedPayload}`),
    publicKey,
    base64UrlDecode(parsed.encodedSignature),
  );
}

export function verifyLevelAttestationDetailed(
  input: unknown,
  now = Date.now(),
): VerifyLevelAttestationResult {
  if (typeof input !== "string" || !input.trim()) {
    return {
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: "malformed_token",
    };
  }

  const publicKey = getPublicKey();
  if (!publicKey) {
    return {
      detail: "ZK_ATTESTATION_PUBLIC_KEY_B64 is not configured",
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: "missing_key",
    };
  }

  const parsed = parseToken(input);
  if (!parsed || parsed.header.alg !== "EdDSA" || parsed.header.typ !== "JWT") {
    return {
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: "malformed_token",
    };
  }

  if (!verifyTokenSignature(parsed, publicKey)) {
    return {
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: "signature_failed",
    };
  }

  const env = getServerEnv();
  const { payload } = parsed;

  if (payload.iss !== env.zkAttestationIssuer) {
    return {
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: "bad_issuer",
    };
  }

  if (payload.aud !== env.zkAttestationAudience) {
    return {
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: "bad_audience",
    };
  }

  if (
    payload.typ !== "6529-level-bucket" ||
    payload.v !== 1 ||
    payload.proofType !== "level_range" ||
    typeof payload.root !== "string" ||
    !/^\d+$/.test(payload.root) ||
    typeof payload.bucket !== "string" ||
    !isSafeTimestamp(payload.iat) ||
    !isSafeTimestamp(payload.exp) ||
    !isValidTokenId(payload.jti) ||
    typeof payload.levelMin !== "number" ||
    !Number.isSafeInteger(payload.levelMin) ||
    typeof payload.levelMax !== "number" ||
    !Number.isSafeInteger(payload.levelMax)
  ) {
    return {
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: "malformed_payload",
    };
  }

  if (payload.exp * 1000 <= now) {
    return {
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: "expired",
    };
  }

  const levelMin = payload.levelMin;
  const levelMax = payload.levelMax;
  const bucket = getVerifiedLevelBucket(levelMin, levelMax);
  if (!bucket || bucket.label !== payload.bucket) {
    return {
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: "unsupported_bucket",
    };
  }

  return {
    expiresAtMs: payload.exp * 1000,
    jti: payload.jti,
    levelLabel: bucket.label,
    ok: true,
  };
}
