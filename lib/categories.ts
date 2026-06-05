/**
 * Product categories and subcategories for Leetonia Wholesale
 */

export const PRODUCT_CATEGORIES = [
  'Analgesics',
  'Anthelmintics',
  'Anti-Asthmatic and Nasal Decongestants',
  'Antacids',
  'Anti diabetics',
  'Anti-inflammatories',
  'Anti hypertensives',
  'Antibiotics',
  'Antihistamines',
  'Anti-Fungals',
  'Anti-viral',
  'Anti-Malarials',
  'Antiseptics',
  'Cosmetics',
  'Cough & Cold products',
  'Creams/Ointments',
  'Diuretics',
  'Gastrointestinal',
  'Infusion',
  'Herbals',
  'Oral Rehydration Salts',
  'Skin products',
  'Toiletories',
  'Tonics',
  'Uncategorized',
  'Vitamins',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_SUBCATEGORIES = [
  'Tablets',
  'Capsules',
  'Drops',
  'Device',
  'Syrups/Suspension',
  'Injections',
  'Infusion',
  'Creams/Ointments',
  'Powdered',
  'Toiletries & Cosmetics',
] as const;

export type ProductSubCategory = (typeof PRODUCT_SUBCATEGORIES)[number];

export const UNCATEGORIZED_CATEGORY: ProductCategory = 'Uncategorized';

/** Same subcategory options for every main category (form / filter). */
export const CATEGORY_SUBCATEGORIES: Record<ProductCategory, ProductSubCategory[]> =
  Object.fromEntries(
    PRODUCT_CATEGORIES.map((cat) => [cat, [...PRODUCT_SUBCATEGORIES]])
  ) as Record<ProductCategory, ProductSubCategory[]>;
