import {
  UNVERIFIED_LEVEL_LABEL,
  getVerifiedLevelBucket,
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

function parseLevelProofPayload(input: unknown): ZkProofPayload | null {
  if (!isRecord(input)) {
    return null;
  }

  const { proof, proofType, publicSignals } = input;

  if (proofType !== "level_range" || !isRecord(proof) || !Array.isArray(publicSignals)) {
    return null;
  }

  if (!getBucketFromPublicSignals(publicSignals)) {
    return null;
  }

  return {
    proof,
    proofType,
    publicSignals,
  };
}

export async function verifyLevelProof(input: unknown): Promise<LevelLabel> {
  const payload = parseLevelProofPayload(input);

  if (!payload) {
    return UNVERIFIED_LEVEL_LABEL;
  }

  try {
    const response = await fetch(ZK_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return UNVERIFIED_LEVEL_LABEL;
    }

    const result = (await response.json()) as ZkVerifyResponse;

    if (!result.success || !result.valid) {
      return UNVERIFIED_LEVEL_LABEL;
    }

    const bucket = getBucketFromPublicSignals(payload.publicSignals as unknown[]);
    return bucket?.label ?? UNVERIFIED_LEVEL_LABEL;
  } catch {
    return UNVERIFIED_LEVEL_LABEL;
  }
}
