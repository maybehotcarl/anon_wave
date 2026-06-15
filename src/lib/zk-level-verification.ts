import {
  verifyGroth16Proof,
  type Groth16Proof,
  type VerificationKey,
} from "@6529/zk-service";
import {
  UNVERIFIED_LEVEL_LABEL,
  getVerifiedLevelBucket,
  type LevelBucket,
  type LevelLabel,
} from "@/lib/level-buckets";
import levelRangeVerificationKey from "@/lib/zk-level-range-vkey.json";

const ZK_LEVEL_ROOT_URL = "https://zkyc.solutions/api/zk?type=level_range";
const ZK_ROOT_TIMEOUT_MS = 5000;
const LEVEL_RANGE_SIGNAL_COUNT = 5;

type ZkProofPayload = {
  proof: Groth16Proof;
  proofType: "level_range";
  publicSignals: string[];
};

type ZkRootResponse = {
  data?: {
    root?: unknown;
  };
  success?: boolean;
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
        | "invalid_proof"
        | "root_http_error"
        | "root_response_malformed"
        | "root_request_failed"
        | "stale_root"
        | "unsupported_bucket"
        | "verify_request_failed";
      status?: number;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGroth16Proof(value: unknown): value is Groth16Proof {
  if (!isRecord(value)) {
    return false;
  }

  const { curve, pi_a, pi_b, pi_c, protocol } = value;

  return (
    typeof curve === "string" &&
    typeof protocol === "string" &&
    isStringArray(pi_a) &&
    Array.isArray(pi_b) &&
    pi_b.every(isStringArray) &&
    isStringArray(pi_c)
  );
}

function parsePublicSignal(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) ? numberValue : null;
}

function isLevelRangePublicSignals(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === LEVEL_RANGE_SIGNAL_COUNT &&
    value.every((signal) => typeof signal === "string" && /^\d+$/.test(signal))
  );
}

function getBucketFromPublicSignals(publicSignals: string[]) {
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

function getMerkleRootFromPublicSignals(publicSignals: string[]) {
  return publicSignals[0] ?? null;
}

async function fetchCurrentLevelRoot() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ZK_ROOT_TIMEOUT_MS);

  try {
    const response = await fetch(ZK_LEVEL_ROOT_URL, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false as const,
        reason: "root_http_error" as const,
        status: response.status,
      };
    }

    const result = (await response.json()) as ZkRootResponse;
    const root = result.data?.root;

    if (!result.success || typeof root !== "string" || !/^\d+$/.test(root)) {
      return {
        ok: false as const,
        reason: "root_response_malformed" as const,
      };
    }

    return {
      ok: true as const,
      root,
    };
  } catch {
    return {
      ok: false as const,
      reason: "root_request_failed" as const,
    };
  } finally {
    clearTimeout(timeout);
  }
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

  if (
    proofType !== "level_range" ||
    !isGroth16Proof(proof) ||
    !isLevelRangePublicSignals(publicSignals)
  ) {
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
      proofType: "level_range",
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
    const currentRoot = await fetchCurrentLevelRoot();

    if (!currentRoot.ok) {
      return {
        levelLabel: UNVERIFIED_LEVEL_LABEL,
        ok: false,
        reason: currentRoot.reason,
        status: currentRoot.status,
      };
    }

    if (getMerkleRootFromPublicSignals(parsed.payload.publicSignals) !== currentRoot.root) {
      return {
        levelLabel: UNVERIFIED_LEVEL_LABEL,
        ok: false,
        reason: "stale_root",
      };
    }

    const valid = await verifyGroth16Proof(
      parsed.payload.proof,
      parsed.payload.publicSignals,
      levelRangeVerificationKey as unknown as VerificationKey,
    );

    if (!valid) {
      return {
        levelLabel: UNVERIFIED_LEVEL_LABEL,
        ok: false,
        reason: "invalid_proof",
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
