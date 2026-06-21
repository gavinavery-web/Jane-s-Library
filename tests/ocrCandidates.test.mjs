import { test, assert } from './testHarness.mjs';
import {
  analyseOcrText,
  extractCandidateQueries,
  filterShelfMatchesByOcr,
  scoreShelfMatch
} from '../src/ocrCandidates.js';

test('OCR text is turned into useful book search candidates', () => {
  const candidates = extractCandidateQueries(`
    SAFARI
    The Happiest Refugee
    NOBODY'S GIRL
    Virginia Roberts
    tiny unreadable line
  `);
  assert.ok(candidates.includes('SAFARI'));
  assert.ok(candidates.includes("NOBODY'S GIRL Virginia Roberts"));
  assert.ok(candidates.length <= 8);
});

test('OCR cleanup rejects weak shelf text instead of inventing matches', () => {
  const analysis = analyseOcrText('||| 12 88 ----\nTHE\nPENGUIN\n');
  assert.equal(analysis.hasUsefulText, false);
  assert.equal(analysis.queries.length, 0);
});

test('OCR extraction deduplicates title phrases from noisy shelf text', () => {
  const analysis = analyseOcrText(`
    THE HAPPIEST REFUGEE
    Anh Do
    PENGUIN
    The Happiest Refugee
    NOBODY'S GIRL
    Virginia Roberts
    N0B0DYS G1RL
  `);
  assert.equal(analysis.hasUsefulText, true);
  assert.ok(analysis.queries.includes('THE HAPPIEST REFUGEE Anh Do'));
  assert.ok(analysis.queries.includes("NOBODY'S GIRL Virginia Roberts"));
  assert.equal(analysis.queries.filter((item) => /HAPPIEST REFUGEE/i.test(item)).length, 1);
});

test('shelf match filtering keeps OCR-related books and rejects unrelated API results', () => {
  const ocrText = `
    NOBODY'S GIRL
    Virginia Roberts
    SAFARI
  `;
  const matches = filterShelfMatchesByOcr(ocrText, [
    { title: "Nobody's Girl", authors: ['Virginia Roberts'], source: 'Open Library' },
    { title: 'Random Ocean Cookbook', authors: ['Someone Else'], source: 'Google Books' },
    { title: 'Safari', authors: ['Peter Hathaway Capstick'], source: 'Open Library' }
  ]);
  assert.deepEqual(matches.map((book) => book.title), ["Nobody's Girl", 'Safari']);
  assert.equal(matches[0].matchConfidence, 'Strong match');
  assert.equal(scoreShelfMatch(ocrText, { title: 'Random Ocean Cookbook', authors: ['Someone Else'] }), 0);
});
