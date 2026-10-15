import { Converter } from 'opencc-js/t2cn';

// Convert writing systems, not regional movie aliases or Taiwanese vocabulary.
const toSimplified = Converter({ from: 'tw', to: 'cn' });

export function getSearchQueries(query: string): string[] {
  const original = query.trim().replace(/\s+/g, ' ');
  if (!original) return [];
  return Array.from(new Set([original, toSimplified(original)]));
}

// Used only for matching/grouping. Keep source titles and user input intact.
export function normalizeSearchTitle(title: string): string {
  return toSimplified(title).replace(/\s+/g, '').toLowerCase();
}
