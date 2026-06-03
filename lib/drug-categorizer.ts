/**
 * Classify drugs by therapeutic category and dosage form (subcategory)
 * from product name / description.
 */

import {
  PRODUCT_CATEGORIES,
  PRODUCT_SUBCATEGORIES,
  UNCATEGORIZED_CATEGORY,
  type ProductCategory,
  type ProductSubCategory,
} from './categories';

type CategoryRule = { category: ProductCategory; keywords: string[] };

/** More specific categories first. */
const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'Oral Rehydration Salts',
    keywords: [
      'ors',
      'oral rehydration',
      'rehydration salt',
      'dioralyte',
      'pedialyte',
      'electral',
    ],
  },
  {
    category: 'Anti-Malarials',
    keywords: [
      'malaria',
      'artemether',
      'lumefantrine',
      'artesunate',
      'quinine',
      'chloroquine',
      'coartem',
      'lonart',
      'fansidar',
      'mefloquine',
      'primaquine',
      'atovaquone',
      'proguanil',
    ],
  },
  {
    category: 'Antibiotics',
    keywords: [
      'amoxicillin',
      'amoxi',
      'ampicillin',
      'penicillin',
      'cephalexin',
      'cefuroxime',
      'ceftriaxone',
      'cefotaxime',
      'azithromycin',
      'erythromycin',
      'clindamycin',
      'doxycycline',
      'tetracycline',
      'ciprofloxacin',
      'levofloxacin',
      'metronidazole',
      'flagyl',
      'clav',
      'augmentin',
      'zithromax',
      'bactrim',
      'septra',
      'gentamicin',
      'vancomycin',
      'antibiotic',
    ],
  },
  {
    category: 'Anthelmintics',
    keywords: [
      'albendazole',
      'mebendazole',
      'praziquantel',
      'ivermectin',
      'piperazine',
      'anthelmintic',
      'deworm',
      'worm',
      'vermox',
      'zentel',
    ],
  },
  {
    category: 'Anti-Fungals',
    keywords: [
      'fluconazole',
      'ketoconazole',
      'clotrimazole',
      'miconazole',
      'nystatin',
      'terbinafine',
      'griseofulvin',
      'antifungal',
      'fungal',
      'candida',
      'canesten',
    ],
  },
  {
    category: 'Antihistamines',
    keywords: [
      'cetirizine',
      'loratadine',
      'chlorpheniramine',
      'promethazine',
      'diphenhydramine',
      'antihistamine',
      'histamine',
      'zyrtec',
      'clarityne',
      'piriton',
    ],
  },
  {
    category: 'Anti-Asthmatic and Nasal Decongestants',
    keywords: [
      'salbutamol',
      'albuterol',
      'ventolin',
      'budesonide',
      'fluticasone',
      'montelukast',
      'theophylline',
      'asthma',
      'inhaler',
      'nebul',
      'decongestant',
      'nasal spray',
      'xylometazoline',
      'oxymetazoline',
      'beclomethasone',
    ],
  },
  {
    category: 'Anti diabetics',
    keywords: [
      'metformin',
      'glibenclamide',
      'gliclazide',
      'glipizide',
      'glimepiride',
      'insulin',
      'sitagliptin',
      'diabetes',
      'diabetic',
      'glucophage',
      'amaryl',
      'januvia',
      'glucometer',
      'glucose strip',
    ],
  },
  {
    category: 'Anti hypertensives',
    keywords: [
      'amlodipine',
      'atenolol',
      'metoprolol',
      'propranolol',
      'lisinopril',
      'enalapril',
      'losartan',
      'valsartan',
      'nifedipine',
      'hydralazine',
      'hypertension',
      'antihypertensive',
      'blood pressure',
      'ace inhibitor',
      'calcium channel',
    ],
  },
  {
    category: 'Diuretics',
    keywords: [
      'furosemide',
      'hydrochlorothiazide',
      'spironolactone',
      'amiloride',
      'bendroflumethiazide',
      'diuretic',
      'lasix',
    ],
  },
  {
    category: 'Antacids',
    keywords: [
      'antacid',
      'gaviscon',
      'maalox',
      'magnesium trisilicate',
      'aluminium hydroxide',
      'calcium carbonate chew',
    ],
  },
  {
    category: 'Antiseptics',
    keywords: [
      'antiseptic',
      'chlorhexidine',
      'povidone iodine',
      'betadine',
      'hydrogen peroxide',
      'savlon',
      'detol',
      'dettol',
      'disinfectant',
      'hand sanitizer',
      'sanitiser',
    ],
  },
  {
    category: 'Cough & Cold products',
    keywords: [
      'cough',
      'cold',
      'flu syrup',
      'expectorant',
      'mucolytic',
      'ambroxol',
      'bromhexine',
      'guaifenesin',
      'dextromethorphan',
      'codral',
      'benylin',
      'robitussin',
    ],
  },
  {
    category: 'Vitamins',
    keywords: [
      'probiotic',
      'cranberry',
      'vitamin',
      'multivitamin',
      'b complex',
      'b-complex',
      'vit c',
      'vit d',
      'folic acid',
      'folate',
      'ascorbic',
      'thiamine',
      'riboflavin',
      'niacin',
      'pyridoxine',
      'cyanocobalamin',
      'zinc tablet',
      'calcium tablet',
      'iron tablet',
      'ferrous',
    ],
  },
  {
    category: 'Tonics',
    keywords: [
      'tonic',
      'appetizer',
      'appetiser',
      'blood tonic',
      'hematinic',
      '3fer',
      'ferrous',
      'folic',
      'b12',
      'multivite',
    ],
  },
  {
    category: 'Herbals',
    keywords: [
      'herbal',
      'herb',
      'moringa',
      'neem',
      'bitter leaf',
      'ginger mixture',
      'garlic',
      'mixture',
      'ginseng',
      'echinacea',
      'traditional',
      'green tea',
      'slimming tea',
    ],
  },
  {
    category: 'Gastrointestinal',
    keywords: [
      'omeprazole',
      'pantoprazole',
      'lansoprazole',
      'ranitidine',
      'loperamide',
      'metoclopramide',
      'domperidone',
      'ondansetron',
      'hyoscine',
      'buscopan',
      'lactulose',
      'bisacodyl',
      'senna',
      'ulcer',
      'reflux',
      'gerd',
      'ppi',
      'gastro',
      'intestinal',
      'stomach',
      'nausea',
      'vomit',
      'diarr',
      'constipation',
      'laxative',
    ],
  },
  {
    category: 'Cosmetics',
    keywords: [
      'cosmetic',
      'lipstick',
      'foundation',
      'mascara',
      'perfume',
      'fragrance',
      'makeup',
      'beauty cream',
      'face cream',
      'body cream cosmetic',
    ],
  },
  {
    category: 'Toiletories',
    keywords: [
      'toilet',
      'toothpaste',
      'toothbrush',
      'mouthwash',
      'dental',
      'floss',
      'deodorant',
      'sanitary pad',
      'tampon',
      'panty liner',
      'tissue',
      'wipe',
    ],
  },
  {
    category: 'Skin products',
    keywords: [
      'skin',
      'derma',
      'eczema',
      'psoriasis',
      'acne',
      'sunscreen',
      'sun block',
      'moistur',
      'lotion',
      'emollient',
      'benzyl benzoate',
      'calamine',
      'hydrocortisone cream',
      'candid',
    ],
  },
  {
    category: 'Creams/Ointments',
    keywords: [
      'cream',
      'ointment',
      'unguent',
      'topical',
      'gel ',
      'balm',
      'pomade',
      'aboniki',
      'rub ',
    ],
  },
  {
    category: 'Anti-inflammatories',
    keywords: [
      'ibuprofen',
      'diclofenac',
      'naproxen',
      'indomethacin',
      'piroxicam',
      'meloxicam',
      'celecoxib',
      'brufen',
      'voltaren',
      'anti-inflammatory',
      'antiinflammatory',
      'nsaid',
    ],
  },
  {
    category: 'Analgesics',
    keywords: [
      'paracetamol',
      'acetaminophen',
      'aspirin',
      'tramadol',
      'morphine',
      'codeine phosphate',
      'panadol',
      'tylenol',
      'analgesic',
      'pain',
      'dolor',
    ],
  },
];

function scoreKeywords(searchText: string, keywords: string[]): number {
  let score = 0;
  for (const keyword of keywords) {
    if (searchText.includes(keyword)) {
      score += keyword.length;
    }
  }
  return score;
}

function matchByFormPatterns(nameUpper: string): ProductCategory | null {
  if (
    /\b(INF|INFUSION|DEXTROSE|GLUCOSE INF|NS |NORMAL SALINE|RINGER)\b/.test(
      nameUpper
    )
  ) {
    return 'Gastrointestinal';
  }
  if (/\b(INJ|INJECTION|IV |IM |AMP)\b/.test(nameUpper)) {
    return null;
  }
  if (/\b(EYE|EAR|OPHTHAL|OTIC)\b/.test(nameUpper)) {
    return 'Skin products';
  }
  return null;
}

/**
 * Therapeutic / product category from name and optional description.
 */
export function categorizeDrug(name: string, description?: string): ProductCategory {
  const searchText = `${name} ${description || ''}`.toLowerCase();
  const nameUpper = (name || '').toUpperCase();

  let best: { category: ProductCategory; score: number } | null = null;
  for (const rule of CATEGORY_RULES) {
    const score = scoreKeywords(searchText, rule.keywords);
    if (score > 0 && (!best || score > best.score)) {
      best = { category: rule.category, score };
    }
  }
  if (best) return best.category;

  const formCategory = matchByFormPatterns(nameUpper);
  if (formCategory) return formCategory;

  const legacy = normalizeLegacyCategory(name);
  if (legacy) return legacy;

  return UNCATEGORIZED_CATEGORY;
}

type SubRule = { sub: ProductSubCategory; patterns: RegExp[] };

const SUBCATEGORY_RULES: SubRule[] = [
  {
    sub: 'Toiletries & Cosmetics',
    patterns: [
      /\b(SOAP|SHAMPOO|CONDITIONER|TOOTHPASTE|TOOTHBRUSH|DEODORANT|COSMETIC|LOTION|PERFUME|SANITARY|TISSUE|WIPE|BEAUTY)\b/i,
    ],
  },
  {
    sub: 'Device',
    patterns: [
      /\b(DEVICE|METER|GLUCOMETER|THERMOMETER|NEBULIZER|NEBULISER|INHALER|STRIP|TEST KIT|SYRINGE|NEEDLE|BP APPARATUS|STETHOSCOPE|MASK|GLOVE)\b/i,
    ],
  },
  {
    sub: 'Infusion',
    patterns: [
      /\b(INFUSION|INF |DEXTROSE|GLUCOSE INF|NORMAL SALINE|RINGER|HARTMANN|D5W|D10W|NS )\b/i,
    ],
  },
  {
    sub: 'Injections',
    patterns: [
      /\b(INJ|INJECTION|INJECTABLE|IV |IM |AMP(OULE)?|VIAL)\b/i,
    ],
  },
  {
    sub: 'Syrups/Suspension',
    patterns: [
      /\b(SYR|SYRUP|SUSP|SUSPENSION|MIXTURE|ELIXIR|LINCTUS)\b/i,
    ],
  },
  {
    sub: 'Drops',
    patterns: [/\b(DROP|DROPS|EYE DROP|EAR DROP|OPHTHAL|OTIC)\b/i],
  },
  {
    sub: 'Creams/Ointments',
    patterns: [/\b(CREAM|OINT|OINTMENT|GEL|TOPICAL|BALM|PASTE)\b/i],
  },
  {
    sub: 'Capsules',
    patterns: [/\b(CAP|CAPS|CAPSULE|CAPSULES)\b/i],
  },
  {
    sub: 'Powdered',
    patterns: [
      /\b(POWDER|POWD|SACHET|GRANULE|EFFERVESCENT|ORS PACK)\b/i,
    ],
  },
  {
    sub: 'Tablets',
    patterns: [/\b(TAB|TABLET|TABLETS|FILM COATED TAB)\b/i],
  },
];

/**
 * Dosage form / type subcategory from product name.
 */
export function inferProductSubCategory(
  name: string,
  description?: string
): ProductSubCategory | undefined {
  const text = `${name} ${description || ''}`;

  for (const rule of SUBCATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return rule.sub;
    }
  }

  return undefined;
}

/** Classify both category and subcategory. */
export function classifyProduct(
  name: string,
  description?: string,
  options?: { previousCategory?: string }
): { category: ProductCategory; subCategory?: ProductSubCategory } {
  let category = categorizeDrug(name, description);
  if (
    category === UNCATEGORIZED_CATEGORY &&
    options?.previousCategory
  ) {
    const fromLegacy = normalizeLegacyCategory(options.previousCategory);
    if (fromLegacy && fromLegacy !== UNCATEGORIZED_CATEGORY) {
      category = fromLegacy;
    }
  }
  const sub = inferProductSubCategory(name, description);
  if (sub && PRODUCT_SUBCATEGORIES.includes(sub)) {
    return { category, subCategory: sub };
  }
  return { category };
}

/** Map legacy Firestore category strings to the new list (fallback). */
const LEGACY_CATEGORY_MAP: Record<string, ProductCategory> = {
  'ANALGESICS & ANTI-INFLAMMATORIES (PAINKILLERS)': 'Analgesics',
  'ANTIPYRETICS (FEVER REDUCERS)': 'Analgesics',
  ANTIBIOTICS: 'Antibiotics',
  'ANTIMICROBIALS (NON-ANTIBIOTIC)': 'Antiseptics',
  'ANTI-MALARIALS': 'Anti-Malarials',
  'ANTIPARASITICS (ANTI-WORM MEDICINES)': 'Anthelmintics',
  ANTIVIRALS: 'Uncategorized',
  ANTIFUNGALS: 'Anti-Fungals',
  'GASTROINTESTINAL MEDICINES': 'Gastrointestinal',
  'CARDIOVASCULAR MEDICINES': 'Anti hypertensives',
  'DIABETES MEDICINES': 'Anti diabetics',
  'RESPIRATORY MEDICINES': 'Anti-Asthmatic and Nasal Decongestants',
  'VITAMINS & MINERALS': 'Vitamins',
  'DIETARY OR NUTRITIONAL SUPPLEMENTS': 'Tonics',
  'HORMONAL MEDICATIONS': 'Uncategorized',
  'NEUROLOGICAL & PSYCHIATRIC MEDICINES': 'Uncategorized',
  'DERMATOLOGICAL (SKIN) MEDICINES': 'Skin products',
  'EYE & EAR PREPARATIONS': 'Skin products',
  'SPECIALTY INJECTIONS': 'Uncategorized',
  'IV FLUIDS (INFUSIONS)': 'Gastrointestinal',
  'ANTIHELMINTICS (Worm medicines)': 'Anthelmintics',
  'OTC (OVER-THE-COUNTER) PRODUCTS': 'Uncategorized',
  'HERBAL PRODUCTS': 'Herbals',
  'MEDICAL CONSUMABLES': 'Antiseptics',
  'MEDICAL DEVICES': 'Uncategorized',
  'BABY & MATERNAL CARE ITEMS': 'Toiletories',
  'HYGIENE & PERSONAL CARE': 'Toiletories',
  Uncategorized: 'Uncategorized',
};

export function normalizeLegacyCategory(
  legacy: string | undefined
): ProductCategory | undefined {
  if (!legacy) return undefined;
  if (PRODUCT_CATEGORIES.includes(legacy as ProductCategory)) {
    return legacy as ProductCategory;
  }
  return LEGACY_CATEGORY_MAP[legacy];
}
