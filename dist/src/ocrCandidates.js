const STOP_WORDS = new Set(['the', 'and', 'with', 'book', 'books', 'novel', 'author', 'library', 'tiny', 'unreadable', 'line', 'penguin', 'press']);

export function extractCandidateQueries(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\w\s'&:-]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => usefulLine(line));
  const candidates = [];
  for (let index = 0; index < lines.length; index += 1) {
    candidates.push(lines[index]);
    const next = lines[index + 1];
    if (next && looksLikeTitle(lines[index])) candidates.push(`${lines[index]} ${next}`);
  }
  return [...new Set(candidates)].slice(0, 8);
}

function usefulLine(line) {
  if (line.length < 4 || line.length > 70) return false;
  const words = line.toLowerCase().split(/\s+/);
  if (words.every((word) => STOP_WORDS.has(word))) return false;
  return true;
}

function looksLikeTitle(line) {
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length / letters.length;
  return upper > 0.55 || line.split(/\s+/).length <= 4;
}
