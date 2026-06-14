export const BLOCKED_LINK_MESSAGE =
  "Links are not allowed in anonymous posts. Please remove URLs and domains before posting.";

export const BLOCKED_REFERENCE_MESSAGE =
  "Off-platform contact info and high-risk solicitation terms are not allowed in anonymous posts.";

const ACTIVE_LINK_PATTERNS = [
  /(?:^|[\s([{<])(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>()]+/iu,
  /(?:^|[\s([{<])(?:mailto|tel|sms):[^\s<>()]+/iu,
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{2,5})?(?:[/?#][^\s<>()]*)?/iu,
  /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?(?:[/?#][^\s<>()]*)?/u,
];

const BLOCKED_REFERENCE_PATTERNS = [
  /\btele[\s._-]*gram\b/iu,
  /\bt[\s._-]*g\b/iu,
  /\bt[\s._-]*(?:dot|\.)[\s._-]*me\b/iu,
  /\b(?:whats[\s._-]*app|signal|session|wickr|tox|jabber|xmpp)\b/iu,
  /\b(?:contact|dm|message|reach)\s+(?:me\s+)?(?:on|at)\b/iu,
  /(?:^|[\s([{<])@[a-z0-9_]{4,32}\b/iu,
  /\b(?:dark[\s._-]*(?:web|net)|darkweb|darknet)\b/iu,
  /\b(?:tor|onion)\b/iu,
  /\bdark[\s._-]*teen(?:\s*\d+(?:\.\d+)?)?\b/iu,
];

export function containsActiveLink(message: string) {
  return ACTIVE_LINK_PATTERNS.some((pattern) => pattern.test(message));
}

export function containsBlockedReference(message: string) {
  return BLOCKED_REFERENCE_PATTERNS.some((pattern) => pattern.test(message));
}

export function getMessagePolicyViolation(message: string) {
  if (containsActiveLink(message)) {
    return BLOCKED_LINK_MESSAGE;
  }

  if (containsBlockedReference(message)) {
    return BLOCKED_REFERENCE_MESSAGE;
  }

  return "";
}
