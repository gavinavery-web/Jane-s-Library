import { test, assert } from './testHarness.mjs';
import { extractCandidateQueries } from '../src/ocrCandidates.js';

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
