const ACTIVE_LINK_PATTERNS = [
  /(?:^|[\s([{<])(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>()]+/iu,
  /(?:^|[\s([{<])(?:mailto|tel|sms):[^\s<>()]+/iu,
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{2,5})?(?:[/?#][^\s<>()]*)?/iu,
  /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?(?:[/?#][^\s<>()]*)?/u,
];

const BLOCKED_REFERENCE_PATTERNS = [
  /\btele[\s._-]*gram\b/iu,
  /\bt[e3][\s._-]*l[e3][\s._-]*gr[a@][\s._-]*m\b/iu,
  /\bt[\s._-]*g\b/iu,
  /\bt[\s._-]*(?:dot|\.)[\s._-]*me\b/iu,
  /\b(?:whats[\s._-]*app|signal|session|wickr|tox|jabber|xmpp)\b/iu,
  /\b(?:contact|dm|message|reach)\s+(?:me\s+)?(?:on|at)\b/iu,
  /(?:^|[\s([{<])@[a-z0-9_]{4,32}\b/iu,
  /\b(?:dark[\s._-]*(?:web|net)|darkweb|darknet)\b/iu,
  /\b(?:tor|onion)\b/iu,
  /\bdark[\s._-]*teen(?:\s*\d+(?:\.\d+)?)?\b/iu,
  /\b(?:video|vid|leak(?:ed)?|pack|drop)\b[\s\S]{0,50}\bteen\b/iu,
  /\bteen\b[\s\S]{0,50}\b(?:video|vid|leak(?:ed)?|pack|drop|\d+(?:\.\d+)?\s*(?:gb|tb))\b/iu,
];

const LOOKALIKE_CHARACTERS: Record<string, string> = {
  "\u0430": "a",
  "\u03b1": "a",
  "\u0251": "a",
  "\u217d": "c",
  "\u0441": "c",
  "\u03f2": "c",
  "\u0501": "d",
  "\u0435": "e",
  "\u03b5": "e",
  "\u0456": "i",
  "\u03b9": "i",
  "\u217c": "l",
  "\u04cf": "l",
  "\u043c": "m",
  "\u03bf": "o",
  "\u043e": "o",
  "\u0440": "p",
  "\u0445": "x",
  "\u0443": "y",
};

function normalizeMessageForPolicy(message: string) {
  return message
    .normalize("NFKC")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, "")
    .replace(
      /[\u0251\u03b1\u03b5\u03b9\u03bf\u03f2\u0430\u0435\u043e\u0440\u0441\u0443\u0445\u0456\u04cf\u0501\u217c\u217d]/gu,
      (character) => LOOKALIKE_CHARACTERS[character] ?? character,
    );
}

function matchesPolicyPattern(patterns: RegExp[], message: string) {
  const normalizedMessage = normalizeMessageForPolicy(message);

  return patterns.some(
    (pattern) => pattern.test(message) || pattern.test(normalizedMessage),
  );
}

export function containsActiveLink(message: string) {
  return matchesPolicyPattern(ACTIVE_LINK_PATTERNS, message);
}

export function containsBlockedReference(message: string) {
  return matchesPolicyPattern(BLOCKED_REFERENCE_PATTERNS, message);
}

export function shouldSilentlyDropMessage(message: string) {
  return containsActiveLink(message) || containsBlockedReference(message);
}
