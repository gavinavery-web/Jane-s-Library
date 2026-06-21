import { test, assert } from './testHarness.mjs';
import {
  MAIN_CATEGORIES,
  addCustomSubcategory,
  createDefaultCategorySettings,
  getSubcategoryOptions,
  hideSubcategory,
  normalizeCategorySettings,
  recordRecentSubcategory,
  renameSubcategory,
  resetCategorySettings,
  safeCategoryDisplay,
  structuredCategorySuggestion
} from '../src/categories.js';

test('category defaults expose only the approved main categories and dependent subcategories', () => {
  const settings = createDefaultCategorySettings();
  assert.deepEqual(MAIN_CATEGORIES, ['Fiction', 'Non-Fiction', 'Uncategorised']);
  assert.ok(getSubcategoryOptions(settings, 'Fiction').includes('Romance'));
  assert.ok(getSubcategoryOptions(settings, 'Fiction').includes('Science Fiction'));
  assert.equal(getSubcategoryOptions(settings, 'Fiction').includes('Biography'), false);
  assert.ok(getSubcategoryOptions(settings, 'Non-Fiction').includes('Biography'));
  assert.ok(getSubcategoryOptions(settings, 'Non-Fiction').includes('Australian History / Australiana'));
  assert.deepEqual(getSubcategoryOptions(settings, 'Uncategorised'), ['To Review']);
});

test('custom, hidden, rename and reset category settings work without deleting main categories', () => {
  let settings = createDefaultCategorySettings();
  settings = addCustomSubcategory(settings, 'Fiction', 'Family Saga');
  assert.ok(getSubcategoryOptions(settings, 'Fiction').includes('Family Saga'));
  settings = hideSubcategory(settings, 'Fiction', 'Romance');
  assert.equal(getSubcategoryOptions(settings, 'Fiction').includes('Romance'), false);
  settings = renameSubcategory(settings, 'Fiction', 'Family Saga', 'Family Stories');
  assert.ok(getSubcategoryOptions(settings, 'Fiction').includes('Family Stories'));
  assert.equal(getSubcategoryOptions(settings, 'Fiction').includes('Family Saga'), false);
  settings = resetCategorySettings();
  assert.ok(getSubcategoryOptions(settings, 'Fiction').includes('Romance'));
  assert.equal(getSubcategoryOptions(settings, 'Fiction').includes('Family Stories'), false);
});

test('recent subcategory chips keep the last five selections with category context', () => {
  let settings = createDefaultCategorySettings();
  ['Biography', 'History', 'Travel', 'Cooking / Cookbooks', 'Gardening', 'Fishing'].forEach((subcategory) => {
    settings = recordRecentSubcategory(settings, 'Non-Fiction', subcategory);
  });
  assert.equal(settings.recentSubcategories.length, 5);
  assert.deepEqual(settings.recentSubcategories[0], { category: 'Non-Fiction', subcategory: 'Fishing' });
  assert.equal(settings.recentSubcategories.some((item) => item.subcategory === 'Biography'), false);
});

test('legacy categories display safely and lookup metadata can suggest structured categories', () => {
  assert.equal(safeCategoryDisplay({ category: 'Africa', subcategory: 'Safari' }), 'Legacy: Africa / Safari');
  assert.deepEqual(
    structuredCategorySuggestion({ category: 'Biography & Autobiography', subcategory: '' }),
    { category: 'Non-Fiction', subcategory: 'Biography' }
  );
  assert.deepEqual(
    structuredCategorySuggestion({ category: 'Fantasy fiction', subcategory: '' }),
    { category: 'Fiction', subcategory: 'Fantasy' }
  );
});

test('category settings normalise imported backups safely', () => {
  const settings = normalizeCategorySettings({
    customSubcategories: { Fiction: ['Family Saga'], 'Non-Fiction': ['Local History'] },
    hiddenSubcategories: { Fiction: ['Romance'] },
    recentSubcategories: [{ category: 'Non-Fiction', subcategory: 'History' }]
  });
  assert.ok(getSubcategoryOptions(settings, 'Fiction').includes('Family Saga'));
  assert.equal(getSubcategoryOptions(settings, 'Fiction').includes('Romance'), false);
  assert.deepEqual(settings.recentSubcategories, [{ category: 'Non-Fiction', subcategory: 'History' }]);
});
