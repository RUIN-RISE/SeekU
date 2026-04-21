import type { Person, EvidenceItem } from "@seeku/db";
import type { SearchDocument } from "@seeku/db";

export function buildSearchStateContextValue(
  person: Pick<Person, "primaryName" | "primaryHeadline" | "primaryLocation" | "summary">,
  document: Pick<SearchDocument, "docText" | "facetRole" | "facetTags"> | undefined,
  evidence: Pick<EvidenceItem, "title" | "description">[]
): string {
  return [
    person.primaryName || "",
    person.primaryHeadline || "",
    person.primaryLocation || "",
    person.summary || "",
    document?.docText || "",
    ...(document?.facetRole || []),
    ...(document?.facetTags || []),
    ...evidence.map((item) => `${item.title || ""} ${item.description || ""}`)
  ]
    .join(" ")
    .toLowerCase();
}

export function escapeRegExpValue(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function shouldUseWordBoundaryMatchValue(term: string): boolean {
  return /[a-z0-9]/i.test(term)
    && !/[^\w\s.-]/.test(term)
    && /^[a-z0-9]/i.test(term)
    && /[a-z0-9]$/i.test(term);
}

export function contextHasTermValue(term: string, context: string): boolean {
  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) {
    return false;
  }

  const normalizedContext = context.toLowerCase();
  if (!shouldUseWordBoundaryMatchValue(normalizedTerm)) {
    return normalizedContext.includes(normalizedTerm);
  }

  try {
    const escapedTerm = escapeRegExpValue(normalizedTerm).replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${escapedTerm}\\b`, "i").test(normalizedContext);
  } catch {
    return normalizedContext.includes(normalizedTerm);
  }
}

export function findMatchedTermsValue(terms: string[], context: string): string[] {
  return terms.filter((term) => contextHasTermValue(term, context));
}
