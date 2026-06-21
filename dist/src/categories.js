export const MAIN_CATEGORIES = ['Fiction', 'Non-Fiction', 'Uncategorised'];

export const FICTION_SUBCATEGORIES = [
  'Romance',
  'Crime',
  'Suspense / Thriller',
  'Fantasy',
  'Science Fiction',
  'Adventure',
  'War Fiction',
  'Classics',
  'Humour / Comedy',
  "Children's Fiction",
  'Poetry / Verse Fiction'
];

export const NON_FICTION_SUBCATEGORIES = [
  'Biography',
  'Autobiography',
  'Memoir',
  'History',
  'War / Military History',
  'True Crime',
  'Politics / Government',
  'Religion / Spirituality',
  'Philosophy',
  'Psychology',
  'Self-Help',
  'Health / Medical',
  'Nursing / First Aid',
  'Cooking / Cookbooks',
  'Gardening',
  'Fishing',
  'Camping / Outdoors',
  'Travel',
  'Maps / Atlases',
  'Dictionaries / Reference',
  'Encyclopaedias',
  'Art / Craft',
  'Music',
  'Sport',
  'Nature / Environment / Animals',
  'Science / Technology / Computers',
  'Business / Finance',
  'Home / DIY',
  'Antiques / Collectables',
  'Family History / Genealogy',
  'Australian History / Australiana',
  'Indigenous Australia'
];

export function createDefaultCategorySettings() {
  return {
    customSubcategories: { Fiction: [], 'Non-Fiction': [] },
    hiddenSubcategories: { Fiction: [], 'Non-Fiction': [] },
    recentSubcategories: []
  };
}

export function normalizeCategorySettings(input = {}) {
  const defaults = createDefaultCategorySettings();
  return {
    customSubcategories: {
      Fiction: uniqueClean(input.customSubcategories?.Fiction || defaults.customSubcategories.Fiction),
      'Non-Fiction': uniqueClean(input.customSubcategories?.['Non-Fiction'] || defaults.customSubcategories['Non-Fiction'])
    },
    hiddenSubcategories: {
      Fiction: uniqueClean(input.hiddenSubcategories?.Fiction || defaults.hiddenSubcategories.Fiction),
      'Non-Fiction': uniqueClean(input.hiddenSubcategories?.['Non-Fiction'] || defaults.hiddenSubcategories['Non-Fiction'])
    },
    recentSubcategories: (Array.isArray(input.recentSubcategories) ? input.recentSubcategories : [])
      .map((item) => ({
        category: normalizeMainCategory(item?.category),
        subcategory: cleanText(item?.subcategory)
      }))
      .filter((item) => item.category !== 'Uncategorised' && item.subcategory)
      .slice(0, 5)
  };
}

export function resetCategorySettings() {
  return createDefaultCategorySettings();
}

export function restoreDefaultCategories(settings) {
  return {
    ...normalizeCategorySettings(settings),
    hiddenSubcategories: { Fiction: [], 'Non-Fiction': [] }
  };
}

export function getSubcategoryOptions(settings, category) {
  const normalized = normalizeCategorySettings(settings);
  const main = normalizeMainCategory(category);
  if (main === 'Uncategorised') return ['To Review'];
  const defaults = main === 'Fiction' ? FICTION_SUBCATEGORIES : NON_FICTION_SUBCATEGORIES;
  const hidden = new Set(normalized.hiddenSubcategories[main]);
  return uniqueClean([...defaults, ...normalized.customSubcategories[main]])
    .filter((item) => !hidden.has(item));
}

export function addCustomSubcategory(settings, category, subcategory) {
  const normalized = normalizeCategorySettings(settings);
  const main = normalizeMainCategory(category);
  const name = cleanText(subcategory);
  if (main === 'Uncategorised' || !name) return normalized;
  normalized.customSubcategories[main] = uniqueClean([...normalized.customSubcategories[main], name]);
  normalized.hiddenSubcategories[main] = normalized.hiddenSubcategories[main].filter((item) => item !== name);
  return normalized;
}

export function hideSubcategory(settings, category, subcategory) {
  const normalized = normalizeCategorySettings(settings);
  const main = normalizeMainCategory(category);
  const name = cleanText(subcategory);
  if (main === 'Uncategorised' || !name) return normalized;
  normalized.hiddenSubcategories[main] = uniqueClean([...normalized.hiddenSubcategories[main], name]);
  return normalized;
}

export function renameSubcategory(settings, category, oldName, newName) {
  let normalized = normalizeCategorySettings(settings);
  const main = normalizeMainCategory(category);
  const oldValue = cleanText(oldName);
  const newValue = cleanText(newName);
  if (main === 'Uncategorised' || !oldValue || !newValue) return normalized;
  normalized = hideSubcategory(normalized, main, oldValue);
  normalized = addCustomSubcategory(normalized, main, newValue);
  normalized.recentSubcategories = normalized.recentSubcategories.map((item) => (
    item.category === main && item.subcategory === oldValue ? { category: main, subcategory: newValue } : item
  ));
  return normalized;
}

export function recordRecentSubcategory(settings, category, subcategory) {
  const normalized = normalizeCategorySettings(settings);
  const main = normalizeMainCategory(category);
  const name = cleanText(subcategory);
  if (main === 'Uncategorised' || !name) return normalized;
  normalized.recentSubcategories = [
    { category: main, subcategory: name },
    ...normalized.recentSubcategories.filter((item) => !(item.category === main && item.subcategory === name))
  ].slice(0, 5);
  return normalized;
}

export function mergeCategorySettings(a, b) {
  const first = normalizeCategorySettings(a);
  const second = normalizeCategorySettings(b);
  return normalizeCategorySettings({
    customSubcategories: {
      Fiction: [...first.customSubcategories.Fiction, ...second.customSubcategories.Fiction],
      'Non-Fiction': [...first.customSubcategories['Non-Fiction'], ...second.customSubcategories['Non-Fiction']]
    },
    hiddenSubcategories: {
      Fiction: [...first.hiddenSubcategories.Fiction, ...second.hiddenSubcategories.Fiction],
      'Non-Fiction': [...first.hiddenSubcategories['Non-Fiction'], ...second.hiddenSubcategories['Non-Fiction']]
    },
    recentSubcategories: [...second.recentSubcategories, ...first.recentSubcategories].slice(0, 5)
  });
}

export function safeCategoryDisplay(book = {}) {
  const category = cleanText(book.category) || 'Uncategorised';
  const subcategory = cleanText(book.subcategory);
  if (MAIN_CATEGORIES.includes(category)) {
    if (category === 'Uncategorised') return subcategory && subcategory !== 'To Review' ? `Uncategorised / ${subcategory}` : 'Uncategorised';
    return subcategory ? `${category} / ${subcategory}` : category;
  }
  return subcategory ? `Legacy: ${category} / ${subcategory}` : `Legacy: ${category}`;
}

export function structuredCategorySuggestion(book = {}) {
  const existing = normalizeMainCategory(book.category, '');
  if (existing) {
    return {
      category: existing,
      subcategory: cleanText(book.subcategory) || (existing === 'Uncategorised' ? 'To Review' : '')
    };
  }
  const text = `${book.category || ''} ${book.subcategory || ''} ${book.summary || ''}`.toLowerCase();
  const nonFiction = [
    ['Biography', /biograph/],
    ['Autobiography', /autobiograph/],
    ['Memoir', /memoir/],
    ['War / Military History', /war|military/],
    ['True Crime', /true crime/],
    ['History', /history|historical/],
    ['Travel', /travel|atlas|map/],
    ['Cooking / Cookbooks', /cook|recipe|food/],
    ['Gardening', /garden/],
    ['Religion / Spirituality', /religion|spiritual/],
    ['Science / Technology / Computers', /science|technology|computer/]
  ];
  const fiction = [
    ['Science Fiction', /science fiction|sci fi|sci-fi/],
    ['Suspense / Thriller', /thriller|suspense/],
    ['Crime', /crime|detective|mystery/],
    ['Fantasy', /fantasy/],
    ['Romance', /romance/],
    ['Adventure', /adventure/],
    ['Classics', /classic/],
    ['Children\'s Fiction', /children|juvenile/],
    ['Poetry / Verse Fiction', /poetry|poem|verse/]
  ];
  const nonFictionHit = nonFiction.find(([, pattern]) => pattern.test(text));
  if (nonFictionHit) return { category: 'Non-Fiction', subcategory: nonFictionHit[0] };
  const fictionHit = fiction.find(([, pattern]) => pattern.test(text));
  if (fictionHit) return { category: 'Fiction', subcategory: fictionHit[0] };
  if (/fiction|novel/.test(text)) return { category: 'Fiction', subcategory: '' };
  return { category: 'Uncategorised', subcategory: 'To Review' };
}

export function normalizeMainCategory(value, fallback = 'Uncategorised') {
  const text = cleanText(value);
  return MAIN_CATEGORIES.includes(text) ? text : fallback;
}

function uniqueClean(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(cleanText)
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
