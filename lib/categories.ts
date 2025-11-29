/**
 * Product Categories for Leetonia Wholesale
 * These categories are used for organizing and filtering products
 */

export const PRODUCT_CATEGORIES = [
  'ANALGESICS & ANTI-INFLAMMATORIES (PAINKILLERS)',
  'ANTIPYRETICS (FEVER REDUCERS)',
  'ANTIBIOTICS',
  'ANTIMICROBIALS (NON-ANTIBIOTIC)',
  'ANTI-MALARIALS',
  'ANTIPARASITICS (ANTI-WORM MEDICINES)',
  'ANTIVIRALS',
  'ANTIFUNGALS',
  'GASTROINTESTINAL MEDICINES',
  'CARDIOVASCULAR MEDICINES',
  'DIABETES MEDICINES',
  'RESPIRATORY MEDICINES',
  'VITAMINS & MINERALS',
  'DIETARY OR NUTRITIONAL SUPPLEMENTS',
  'HORMONAL MEDICATIONS',
  'NEUROLOGICAL & PSYCHIATRIC MEDICINES',
  'DERMATOLOGICAL (SKIN) MEDICINES',
  'EYE & EAR PREPARATIONS',
  'SPECIALTY INJECTIONS',
  'IV FLUIDS (INFUSIONS)',
  'ANTIHELMINTICS (Worm medicines)',
  'OTC (OVER-THE-COUNTER) PRODUCTS',
  'HERBAL PRODUCTS',
  'MEDICAL CONSUMABLES',
  'MEDICAL DEVICES',
  'BABY & MATERNAL CARE ITEMS',
  'HYGIENE & PERSONAL CARE',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/**
 * Category subcategories mapping
 * This will be populated later when subcategories are defined
 */
export const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  // Example structure (to be populated later):
  // 'ANTIBIOTICS': ['Penicillins', 'Cephalosporins', 'Macrolides'],
};
