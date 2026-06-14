export const BLOCKED_LINK_MESSAGE =
  "Links are not allowed in anonymous posts. Please remove URLs and domains before posting.";

const ACTIVE_LINK_PATTERNS = [
  /(?:^|[\s([{<])(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>()]+/iu,
  /(?:^|[\s([{<])(?:mailto|tel|sms):[^\s<>()]+/iu,
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{2,5})?(?:[/?#][^\s<>()]*)?/iu,
  /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?(?:[/?#][^\s<>()]*)?/u,
];

export function containsActiveLink(message: string) {
  return ACTIVE_LINK_PATTERNS.some((pattern) => pattern.test(message));
}
