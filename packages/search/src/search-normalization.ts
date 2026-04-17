export const UNIVERSITY_TERM_FAMILIES = [
  ["zhejiang university", "zju", "浙江大学", "浙大"]
] as const;
export const PRIMARY_UNIVERSITY_CANONICAL = UNIVERSITY_TERM_FAMILIES[0][0];

const SEARCH_SYMBOL_REGEX = /[\p{P}\p{S}]+/gu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function canonicalizeUniversityTerms(value: string): string {
  let normalized = value;

  for (const family of UNIVERSITY_TERM_FAMILIES) {
    const [canonical] = family;
    for (const variant of [...family].sort((left, right) => right.length - left.length)) {
      const pattern = containsCjk(variant)
        ? new RegExp(escapeRegExp(variant), "gu")
        : new RegExp(`\\b${escapeRegExp(variant)}\\b`, "gu");
      normalized = normalized.replace(pattern, canonical);
    }
  }

  return normalized;
}

export function normalizeSearchText(value: string): string {
  const normalized = canonicalizeUniversityTerms(value.normalize("NFKC").toLowerCase().trim());
  return normalized.replace(SEARCH_SYMBOL_REGEX, " ").replace(/\s+/g, " ").trim();
}

export function isBoundarySensitiveSearchTerm(value: string): boolean {
  return /^[a-z0-9]+$/u.test(value) && !value.includes(" ") && value.length <= 8;
}

export function escapeRegexPattern(value: string): string {
  return escapeRegExp(value);
}

export function collectDocumentAliasTerms(values: string[]): string[] {
  const rawText = values.join(" ");
  const rawLower = rawText.toLowerCase();
  const normalizedText = normalizeSearchText(rawText);
  const aliases = new Set<string>();

  for (const family of UNIVERSITY_TERM_FAMILIES) {
    const [canonical] = family;
    const hasSignal = normalizedText.includes(canonical) || family.some((variant) => rawLower.includes(variant.toLowerCase()));
    if (!hasSignal) {
      continue;
    }

    for (const variant of family) {
      if (!rawLower.includes(variant.toLowerCase())) {
        aliases.add(variant);
      }
    }
  }

  return [...aliases];
}

export function textHasUniversitySignal(value: string): boolean {
  return normalizeSearchText(value).includes(PRIMARY_UNIVERSITY_CANONICAL);
}
