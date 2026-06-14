export type VerifiedLevelLabel =
  | "1-10"
  | "11-20"
  | "21-30"
  | "31-40"
  | "41-60"
  | "61-80"
  | "81-100";

export type LevelLabel = "0" | VerifiedLevelLabel;

export type LevelBucket = {
  label: VerifiedLevelLabel;
  max: number;
  min: number;
};

export const UNVERIFIED_LEVEL_LABEL: LevelLabel = "0";

export const VERIFIED_LEVEL_BUCKETS = [
  { label: "1-10", min: 1, max: 10 },
  { label: "11-20", min: 11, max: 20 },
  { label: "21-30", min: 21, max: 30 },
  { label: "31-40", min: 31, max: 40 },
  { label: "41-60", min: 41, max: 60 },
  { label: "61-80", min: 61, max: 80 },
  { label: "81-100", min: 81, max: 100 },
] satisfies LevelBucket[];

export function getVerifiedLevelBucket(min: number, max: number) {
  return VERIFIED_LEVEL_BUCKETS.find(
    (bucket) => bucket.min === min && bucket.max === max,
  );
}

export function formatWaveMessageWithLevel(message: string, levelLabel: LevelLabel) {
  return `6529 Level: ${levelLabel}\n\n${message}`;
}
