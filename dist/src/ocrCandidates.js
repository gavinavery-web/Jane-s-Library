const STOP_WORDS = new Set([
  'the', 'and', 'with', 'book', 'books', 'novel', 'author', 'library', 'tiny', 'unreadable', 'line',
  'penguin', 'press', 'edition', 'volume', 'vol', 'series', 'publishing'
]);

const PUBLISHER_NOISE = [
  'penguin', 'harper', 'collins', 'macmillan', 'pan', 'oxford', 'cambridge', 'random house',
  'bloomsbury', 'hachette', 'scholastic', 'press'
];

export function analyseOcrText(text) {
  const lines = cleanOcrLines(text);
  const queries = buildQueries(lines);
  return {
    cleanText: lines.join('\n'),
    lines,
    queries,
    hasUsefulText: queries.length > 0
  };
}

export function extractCandidateQueries(text) {
  return analyseOcrText(text).queries;
}

export function filterShelfMatchesByOcr(ocrText, books = []) {
  const seen = new Set();
  return books
    .map((book) => {
      const score = scoreShelfMatch(ocrText, book);
      return {
        ...book,
        matchScore: score,
        matchConfidence: score >= 4 ? 'Strong match' : 'Needs review',
        matchReason: score >= 4
          ? 'The title or author was found in the shelf photo text.'
          : 'Some words match the shelf photo text. Please check before saving.'
      };
    })
    .filter((book) => book.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .filter((book) => {
      const key = normalizeKey([book.title, authorLine(book)].join('|'));
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export function scoreShelfMatch(ocrText, book = {}) {
  const ocrKey = normalizeKey(ocrText);
  if (!ocrKey) return 0;
  const title = String(book.title || '');
  const author = authorLine(book);
  const titleKey = normalizeKey(title);
  const authorKey = normalizeKey(author);
  if (!titleKey) return 0;

  let score = 0;
  if (titleKey.length >= 5 && ocrKey.includes(titleKey)) score += 4;
  if (authorKey.length >= 5 && ocrKey.includes(authorKey)) score += 2;

  const ocrTokens = new Set(tokenize(ocrText));
  const titleTokens = tokenize(title);
  const authorTokens = tokenize(author);
  const titleOverlap = titleTokens.filter((token) => ocrTokens.has(token)).length;
  const authorOverlap = authorTokens.filter((token) => ocrTokens.has(token)).length;

  if (titleTokens.length === 1 && titleOverlap === 1) score += 3;
  if (titleTokens.length > 1 && titleOverlap >= Math.min(2, titleTokens.length)) score += titleOverlap + 1;
  if (authorOverlap) score += Math.min(authorOverlap, 2);
  return score;
}

function cleanOcrLines(text) {
  const seen = new Set();
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => normalizeOcrLine(line))
    .filter((line) => usefulLine(line))
    .filter((line) => {
      const key = normalizeKey(line);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}

function normalizeOcrLine(line) {
  return String(line || '')
    .replace(/[’`]/g, "'")
    .replace(/[|_[\]{}<>~^=+*#@]/g, ' ')
    .replace(/[^\w\s'&:.,/-]/g, ' ')
    .replace(/\b([A-Za-z])\s+([A-Za-z])\s+([A-Za-z])\b/g, '$1$2$3')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildQueries(lines) {
  const candidates = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];
    if (looksLikeTitle(line) && next && looksLikeAuthor(next)) {
      candidates.push(`${line} ${next}`);
      index += 1;
      continue;
    }
    if (looksLikeTitle(line)) candidates.push(line);
  }
  return dedupeCandidates(candidates).slice(0, 8);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = normalizeKey(candidate);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function usefulLine(line) {
  if (line.length < 4 || line.length > 70) return false;
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  if (letters.length / Math.max(1, line.length) < 0.45) return false;
  const words = line.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.every((word) => STOP_WORDS.has(word))) return false;
  const normalized = line.toLowerCase();
  if (PUBLISHER_NOISE.some((word) => normalized === word || normalized.endsWith(` ${word}`))) return false;
  return true;
}

function looksLikeTitle(line) {
  const words = line.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 9) return false;
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  const upperRatio = letters.replace(/[^A-Z]/g, '').length / letters.length;
  const titleCaseWords = words.filter((word) => /^[A-Z0-9][A-Za-z0-9'&:-]+$/.test(word)).length;
  return upperRatio > 0.45 || titleCaseWords >= Math.ceil(words.length * 0.6);
}

function looksLikeAuthor(line) {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (/\b(the|a|an|of|and|book|volume|edition)\b/i.test(line)) return false;
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  const upperRatio = letters.replace(/[^A-Z]/g, '').length / letters.length;
  if (upperRatio > 0.7) return false;
  return words.every((word) => /^[A-Z][A-Za-z'.-]+$/.test(word));
}

function tokenize(value) {
  return normalizeForTokens(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function normalizeForTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/5/g, 's')
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value) {
  return normalizeForTokens(value).replace(/[^a-z0-9]/g, '');
}

function authorLine(book) {
  return Array.isArray(book.authors) ? book.authors.join(' ') : String(book.authors || '');
}
