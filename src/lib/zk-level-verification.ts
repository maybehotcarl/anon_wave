import {
  UNVERIFIED_LEVEL_LABEL,
  getVerifiedLevelBucket,
  type LevelBucket,
  type LevelLabel,
} from "@/lib/level-buckets";

const ZK_VERIFY_URL = "https://zkyc.solutions/api/zk";
const LEVEL_RANGE_SIGNAL_COUNT = 5;

type ZkProofPayload = {
  proof?: unknown;
  proofType?: unknown;
  publicSignals?: unknown;
};

type ZkVerifyResponse = {
  error?: string;
  reason?: string;
  success?: boolean;
  valid?: boolean;
};

type ParseLevelProofResult =
  | {
      bucket: LevelBucket;
      ok: true;
      payload: ZkProofPayload;
    }
  | {
      ok: false;
      reason: "missing" | "malformed_payload" | "unsupported_bucket";
    };

export type VerifyLevelProofResult =
  | {
      levelLabel: LevelLabel;
      ok: true;
    }
  | {
      detail?: string;
      levelLabel: typeof UNVERIFIED_LEVEL_LABEL;
      ok: false;
      reason:
        | "missing"
        | "malformed_payload"
        | "unsupported_bucket"
        | "verify_http_error"
        | "verify_rejected"
        | "verify_response_malformed"
        | "verify_request_failed";
      status?: number;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePublicSignal(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) ? numberValue : null;
}

function getBucketFromPublicSignals(publicSignals: unknown[]) {
  if (publicSignals.length !== LEVEL_RANGE_SIGNAL_COUNT) {
    return null;
  }

  const levelMin = parsePublicSignal(publicSignals[1]);
  const levelMax = parsePublicSignal(publicSignals[2]);

  if (levelMin === null || levelMax === null) {
    return null;
  }

  return getVerifiedLevelBucket(levelMin, levelMax) ?? null;
}

function parseLevelProofPayload(input: unknown): ParseLevelProofResult {
  if (input === undefined || input === null) {
    return {
      ok: false,
      reason: "missing",
    };
  }

  if (!isRecord(input)) {
    return {
      ok: false,
      reason: "malformed_payload",
    };
  }

  const { proof, proofType, publicSignals } = input;

  if (proofType !== "level_range" || !isRecord(proof) || !Array.isArray(publicSignals)) {
    return {
      ok: false,
      reason: "malformed_payload",
    };
  }

  const bucket = getBucketFromPublicSignals(publicSignals);

  if (!bucket) {
    return {
      ok: false,
      reason: "unsupported_bucket",
    };
  }

  return {
    bucket,
    ok: true,
    payload: {
      proof,
      proofType,
      publicSignals,
    },
  };
}

export async function verifyLevelProofDetailed(
  input: unknown,
): Promise<VerifyLevelProofResult> {
  const parsed = parseLevelProofPayload(input);

  if (!parsed.ok) {
    return {
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: parsed.reason,
    };
  }

  try {
    const response = await fetch(ZK_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsed.payload),
    });

    if (!response.ok) {
      return {
        levelLabel: UNVERIFIED_LEVEL_LABEL,
        ok: false,
        reason: "verify_http_error",
        status: response.status,
      };
    }

    const result = (await response.json()) as ZkVerifyResponse;

    if (typeof result.success !== "boolean" || typeof result.valid !== "boolean") {
      return {
        levelLabel: UNVERIFIED_LEVEL_LABEL,
        ok: false,
        reason: "verify_response_malformed",
      };
    }

    if (!result.success || !result.valid) {
      return {
        detail: result.reason ?? result.error,
        levelLabel: UNVERIFIED_LEVEL_LABEL,
        ok: false,
        reason: "verify_rejected",
      };
    }

    return {
      levelLabel: parsed.bucket.label,
      ok: true,
    };
  } catch {
    return {
      levelLabel: UNVERIFIED_LEVEL_LABEL,
      ok: false,
      reason: "verify_request_failed",
    };
  }
}

export async function verifyLevelProof(input: unknown): Promise<LevelLabel> {
  const result = await verifyLevelProofDetailed(input);
  return result.ok ? result.levelLabel : UNVERIFIED_LEVEL_LABEL;
}
