/**
 * Seed script to populate Firestore with inventory data
 * Run with: npx tsx scripts/seed-inventory.ts
 *
 * Make sure your .env.local file is configured with Firebase credentials
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables from .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error(
    'Error: .env.local file not found. Please create it with your Firebase credentials.'
  );
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Inventory data from the provided list
const inventoryData = [
  {
    code: '4571',
    name: '10D GLUCOSE INF 500ML',
    price: 11.36,
    category: 'Infusion',
  },
  { code: '4758', name: '3FER SYR', price: 13.42, category: 'Syrup' },
  { code: '5059', name: '3P GARLIC MIXTURE', price: 39.5, category: 'Mixture' },
  {
    code: '5807',
    name: '5D (DEXTROSE 5%) INFUSION 500ML',
    price: 10.55,
    category: 'Infusion',
  },
  { code: '5482', name: 'ABONIKI', price: 7.7, category: 'Topical' },
  {
    code: '1387',
    name: 'ACCU-CHECK ACTIVE STRIPS',
    price: 180.0,
    category: 'Medical Device',
  },
  {
    code: '908',
    name: 'ACCU-CHECK INSTANT STRIPS',
    price: 222.0,
    category: 'Medical Device',
  },
  {
    code: '6262',
    name: 'ACETYLCYSTEINE 400MG/2ML (MUCOMIX)',
    price: 154.0,
    category: 'Injection',
  },
  {
    code: '1333',
    name: "ACICLOVIR 200MG TABS 25'S UK",
    price: 37.0,
    category: 'Antiviral',
  },
  {
    code: '2817',
    name: "ACICLOVIR 400MG TABS 56'S UK",
    price: 65.34,
    category: 'Antiviral',
  },
  {
    code: '1081',
    name: 'ACICLOVIR CREAM (LIPSORE)2GM UK',
    price: 40.32,
    category: 'Topical',
  },
  {
    code: '6343',
    name: 'ACICLOVIR CREAM-PHARMANOVA',
    price: 10.7,
    category: 'Topical',
  },
  {
    code: '6346',
    name: "ACICLOVIR TABS 200MG 28'S VEGA",
    price: 27.44,
    category: 'Antiviral',
  },
  {
    code: '4719',
    name: 'ACIDOM 40MG(OMEPRAZOLE) INJ',
    price: 14.0,
    category: 'Injection',
  },
  {
    code: '1401',
    name: "ACIDOM CAPS 2 X 10'S",
    price: 38.0,
    category: 'Gastrointestinal',
  },
  {
    code: '4241',
    name: 'ACIGUARD SUSP 200ML',
    price: 18.38,
    category: 'Suspension',
  },
  {
    code: '4749',
    name: 'ACIGUARD-O SUSP',
    price: 20.01,
    category: 'Suspension',
  },
  {
    code: '4072',
    name: 'ACNE OVAL FACIAL BAR(CLEAR SOAP)',
    price: 39.99,
    category: 'Personal Care',
  },
  {
    code: '4073',
    name: 'ACNE TRANSPARENT BAR( TREATMENT',
    price: 27.99,
    category: 'Personal Care',
  },
  {
    code: '1351',
    name: "ACTIFED MULTIACTION TABS 12'S",
    price: 109.03,
    category: 'Cold & Flu',
  },
  { code: '3', name: 'ACTILIFE', price: 22.0, category: 'Supplements' },
  {
    code: '5539',
    name: 'ACTILIFE WOMENS FLORA TABS',
    price: 30.0,
    category: 'Supplements',
  },
  {
    code: '6801',
    name: "ACTRAPID FLEXPEN 3ML 5'S",
    price: 307.91,
    category: 'Diabetes',
  },
  {
    code: '5122',
    name: 'ACTRAPID HM 100IU',
    price: 81.0,
    category: 'Diabetes',
  },
  {
    code: '5674',
    name: 'ACYVLOVIR DENK 200MG',
    price: 108.49,
    category: 'Antiviral',
  },
  {
    code: '5784',
    name: 'ADALAT LA 30MG TABS',
    price: 398.0,
    category: 'Cardiovascular',
  },
  {
    code: '4',
    name: 'ADDYZOA CAPSULES',
    price: 140.0,
    category: 'Supplements',
  },
  {
    code: '6354',
    name: 'ADIDAS SHOWER GEL 400ML',
    price: 41.8,
    category: 'Personal Care',
  },
  {
    code: '3977',
    name: 'ADIDAS SPRAY 150ML',
    price: 50.37,
    category: 'Personal Care',
  },
  { code: '3091', name: 'ADOM KOO MIXTURE', price: 17.0, category: 'Mixture' },
  {
    code: '4181',
    name: 'ADOM NATURAL MAN CAPS',
    price: 38.5,
    category: 'Supplements',
  },
  {
    code: '5589',
    name: 'ADOM P.AWAY MIXTURE',
    price: 22.0,
    category: 'Mixture',
  },
  {
    code: '3093',
    name: 'ADOM W&G CAPSULES',
    price: 38.5,
    category: 'Supplements',
  },
  {
    code: '5658',
    name: "ADRENALINE INJ 1ML/1ML 10'S",
    price: 50.0,
    category: 'Injection',
  },
  {
    code: '5349',
    name: 'ADUTWUMWAA BITTERS',
    price: 20.0,
    category: 'Mixture',
  },
  { code: '5533', name: 'ADUTWUMWAA TONIC', price: 19.0, category: 'Tonic' },
  {
    code: '5741',
    name: 'ADVANTAN 0.1% KREM',
    price: 90.0,
    category: 'Topical',
  },
  {
    code: '6031',
    name: 'ADVIL LIQUID GEL 50X2',
    price: 476.35,
    category: 'Pain Relief',
  },
  {
    code: '5752',
    name: 'AENEAS 500MG (LEVOFLOXACIN)',
    price: 70.0,
    category: 'Antibiotic',
  },
  { code: '1339', name: 'AGBEVE TONIC', price: 25.5, category: 'Tonic' },
  {
    code: '5013',
    name: "AJ WELLNESS IPACE CAPS 30'S",
    price: 80.28,
    category: 'Supplements',
  },
  {
    code: '6158',
    name: "AJ WELLNESS PREGNA TABS 30'S",
    price: 81.0,
    category: 'Supplements',
  },
  {
    code: '5016',
    name: "AJ WELLNESS PROCARE CAPS 30'S",
    price: 83.54,
    category: 'Supplements',
  },
  {
    code: '5017',
    name: "AJ WELLNESS SKIN RADIENCE CAPS 30'S",
    price: 96.04,
    category: 'Supplements',
  },
  {
    code: '5018',
    name: 'AJ WELLNESS SKIN,HAIR & NAILS CAPS',
    price: 86.6,
    category: 'Supplements',
  },
  {
    code: '5917',
    name: "AJ WELLNESS VITAL B PLUS CAPS 30'S",
    price: 84.0,
    category: 'Supplements',
  },
  {
    code: '6159',
    name: "AJ WELLNESS VITAL MAN TABS 30'S",
    price: 81.0,
    category: 'Supplements',
  },
  {
    code: '5913',
    name: 'AJ WELLNESS VITAL SEAS GOLD CAPS',
    price: 89.25,
    category: 'Supplements',
  },
  {
    code: '5914',
    name: 'AJ WELLNESS VITAL SEAS SILVER CAPS',
    price: 78.75,
    category: 'Supplements',
  },
  {
    code: '5019',
    name: "AJ WELLNESS VITAL WOMAN CAPS 30'S",
    price: 81.17,
    category: 'Supplements',
  },
  { code: '5534', name: 'ALAFIA BITTERS', price: 18.0, category: 'Mixture' },
  {
    code: '748',
    name: 'ALBENDAZOLE 400MG(OBEND)',
    price: 1.5,
    category: 'Anthelmintic',
  },
  {
    code: '3873',
    name: "ALDACTONE 25MG TABS 100'S",
    price: 300.0,
    category: 'Cardiovascular',
  },
  {
    code: '4830',
    name: "ALDOMET 250MG TABS 60'S",
    price: 173.8,
    category: 'Cardiovascular',
  },
  {
    code: '6265',
    name: "ALENDRONIC ACID 70MG TABS 4'S",
    price: 38.03,
    category: 'Bone Health',
  },
  {
    code: '4171',
    name: "ALKA SELTZER TABS 20'S",
    price: 103.23,
    category: 'Pain Relief',
  },
  {
    code: '3158',
    name: 'ALKA SELTZER X 10',
    price: 69.49,
    category: 'Pain Relief',
  },
  { code: '5', name: 'ALKA-5 SYR 100ML', price: 54.0, category: 'Syrup' },
  { code: '6194', name: 'ALLEREX EYE DROP', price: 49.6, category: 'Eye Care' },
  {
    code: '3055',
    name: 'ALLOPURINOL 100MG X 28',
    price: 22.36,
    category: 'Gout',
  },
  {
    code: '3035',
    name: "ALLUPIRINOL 300MG TABS 28'S UK",
    price: 25.68,
    category: 'Gout',
  },
  {
    code: '4242',
    name: 'ALMOL(PARA INFUSION)100ML',
    price: 15.81,
    category: 'Infusion',
  },
  {
    code: '6098',
    name: "ALPHA GARLIC CAPS 30'S",
    price: 36.0,
    category: 'Supplements',
  },
  {
    code: '1415',
    name: "ALPHA GARLIC CAPS 60'S",
    price: 54.0,
    category: 'Supplements',
  },
  {
    code: '6152',
    name: "ALPHA LIFE Q-CALCIUM TABS 60'S",
    price: 75.0,
    category: 'Supplements',
  },
  {
    code: '6011',
    name: 'ALPHA OMEGA 3 CAPS 10X10',
    price: 60.0,
    category: 'Supplements',
  },
  {
    code: '6012',
    name: "ALPHA VIT E 400IU CAPS 30'S",
    price: 50.0,
    category: 'Supplements',
  },
  {
    code: '6009',
    name: "ALPHA VITAMIN C EFF 1000MG TABS 20'S",
    price: 28.0,
    category: 'Supplements',
  },
  {
    code: '3828',
    name: "ALPHA-DR CHRIS OMEGA 3 CAPS 30'S",
    price: 45.0,
    category: 'Supplements',
  },
  {
    code: '6604',
    name: "ALWAYS CLASSIC NIGHT 8'S",
    price: 53.0,
    category: 'Personal Care',
  },
  {
    code: '6094',
    name: "ALWAYS PANTYLINER NORMAL 20'S",
    price: 25.0,
    category: 'Personal Care',
  },
  {
    code: '8',
    name: 'AMARYL 2MG 30 TABS',
    price: 169.06,
    category: 'Diabetes',
  },
  {
    code: '10',
    name: 'AMARYL 4MG 30 TABS',
    price: 373.1,
    category: 'Diabetes',
  },
  {
    code: '4784',
    name: 'AMCICLOX SUSP 100ML',
    price: 7.6,
    category: 'Suspension',
  },
  { code: '3109', name: 'AMCOF ADULT', price: 13.0, category: 'Cold & Flu' },
  {
    code: '4941',
    name: 'AMCOF CHESTY SYR 200ML',
    price: 19.5,
    category: 'Cold & Flu',
  },
  { code: '3108', name: 'AMCOF JUNIOR', price: 13.5, category: 'Cold & Flu' },
  {
    code: '794',
    name: 'AMICLOX 250MG/5ML SUSP 100ML',
    price: 14.98,
    category: 'Suspension',
  },
  {
    code: '6227',
    name: 'AMIKACIN AMIKIN 500MG INJECTION',
    price: 19.99,
    category: 'Injection',
  },
  {
    code: '5897',
    name: "AMINOPHYLLINE 250MG INJ 1ML 50'S PER",
    price: 6.0,
    category: 'Injection',
  },
  {
    code: '5956',
    name: "AMIODARONE 200MG TABS 28'S",
    price: 58.08,
    category: 'Cardiovascular',
  },
  {
    code: '1202',
    name: 'AMITRIPTYLINE 25MG TEVA',
    price: 23.0,
    category: 'Antidepressant',
  },
  {
    code: '5641',
    name: 'AMLO DENK 5MG 10X5',
    price: 72.0,
    category: 'Cardiovascular',
  },
  {
    code: '3261',
    name: 'AMLO-DENK 10MG TABS 10X5',
    price: 121.0,
    category: 'Cardiovascular',
  },
  {
    code: '15',
    name: 'AMLODIPINE BES TAB 10MG TEV 28',
    price: 12.8,
    category: 'Cardiovascular',
  },
  {
    code: '16',
    name: 'AMLODIPINE BES TAB 5MG TEV 28',
    price: 12.0,
    category: 'Cardiovascular',
  },
  {
    code: '4236',
    name: "AMLONOVA 10MG TABS 30'S",
    price: 5.83,
    category: 'Cardiovascular',
  },
  {
    code: '17',
    name: 'AMOKSIKLAV 1G TAB',
    price: 69.53,
    category: 'Antibiotic',
  },
  {
    code: '20',
    name: 'AMOKSIKLAV 457 SUSP',
    price: 45.57,
    category: 'Suspension',
  },
  {
    code: '21',
    name: 'AMOKSIKLAV 625 TAB',
    price: 48.0,
    category: 'Antibiotic',
  },
  {
    code: '6352',
    name: 'AMOKXICLAV 625MG TABS VEGA',
    price: 68.98,
    category: 'Antibiotic',
  },
  {
    code: '6259',
    name: 'AMOKXINATE 457MG SUSP',
    price: 35.0,
    category: 'Suspension',
  },
  {
    code: '6260',
    name: 'AMOKXINATE 625MG TABS',
    price: 49.1,
    category: 'Antibiotic',
  },
  {
    code: '6425',
    name: 'AMOKXINATE 1.2G INJ',
    price: 21.5,
    category: 'Injection',
  },
  {
    code: '6295',
    name: "AMOKXINATE 1G TABS 14'S",
    price: 58.55,
    category: 'Antibiotic',
  },
  {
    code: '5994',
    name: 'AMOVULIN 1.2G INJ (AMOKSICLAV)',
    price: 21.39,
    category: 'Injection',
  },
  { code: '23', name: 'AMOVULIN 457', price: 42.8, category: 'Suspension' },
  { code: '24', name: 'AMOVULIN 625', price: 43.2, category: 'Antibiotic' },
  {
    code: '4435',
    name: 'AMOXI & CLAV 228MG SUSP 70ML LUEX',
    price: 28.0,
    category: 'Suspension',
  },
  {
    code: '4436',
    name: 'AMOXI & CLAV 475MG SUSP 70ML LUEX',
    price: 38.0,
    category: 'Suspension',
  },
  {
    code: '5821',
    name: "AMOXI CLAV. 625 TABS 14'S LUEX",
    price: 50.0,
    category: 'Antibiotic',
  },
  {
    code: '6120',
    name: "AMOXI+CLAV 1G TABS 14'S",
    price: 61.5,
    category: 'Antibiotic',
  },
  {
    code: '5998',
    name: 'AMOXICILLIN 125MG/5ML SUSP 100ML',
    price: 31.5,
    category: 'Suspension',
  },
  {
    code: '4549',
    name: 'AMOXICILLIN 250MG CAPS 50X10-LETAP',
    price: 130.0,
    category: 'Antibiotic',
  },
  {
    code: '3923',
    name: 'AMOXICILLIN 500MG CAPS 10X10 LETAP',
    price: 44.55,
    category: 'Antibiotic',
  },
  {
    code: '3920',
    name: 'AMOXICILLIN SUSP 100ML LETAP',
    price: 5.0,
    category: 'Suspension',
  },
  {
    code: '4103',
    name: 'AMOXICILLIN SUSP 100ML M&G',
    price: 8.8,
    category: 'Suspension',
  },
  {
    code: '6347',
    name: "AMOXICLAV INJ 20ML 10'S VEGA",
    price: 20.0,
    category: 'Injection',
  },
  {
    code: '26',
    name: 'AMOXYCILLIN 125MG/5ML (LUEX)',
    price: 13.0,
    category: 'Suspension',
  },
  {
    code: '27',
    name: "AMOXYCILLIN CAP EXETER 21'S",
    price: 29.8,
    category: 'Antibiotic',
  },
  {
    code: '28',
    name: "AMOXYCILLIN CAPS 500MG 21'S UK",
    price: 35.0,
    category: 'Antibiotic',
  },
  {
    code: '6760',
    name: 'AMOXYCILLIN SUSP 125MG/5ML UK',
    price: 19.6,
    category: 'Suspension',
  },
  {
    code: '4157',
    name: 'AMPICILLIN 250MG CAPS',
    price: 120.0,
    category: 'Antibiotic',
  },
  {
    code: '6038',
    name: 'AMUROX 250MG(CEFUROXIME) TABS',
    price: 26.2,
    category: 'Antibiotic',
  },
  {
    code: '5930',
    name: 'AMUZU GARLIC MIXTURE',
    price: 35.5,
    category: 'Mixture',
  },
  { code: '6722', name: 'ANACONDA BALM 65GM', price: 9.6, category: 'Topical' },
  {
    code: '6023',
    name: "ANAFRANIL 25MG TABS 50'S INDIA",
    price: 83.0,
    category: 'Antidepressant',
  },
  {
    code: '2974',
    name: 'ANAFRANIL TAB 25MG 1 X 30',
    price: 129.0,
    category: 'Antidepressant',
  },
  {
    code: '6402',
    name: "ANASTRAZOLE TABS 1MG 28'S",
    price: 48.28,
    category: 'Oncology',
  },
  { code: '32', name: 'ANCIGEL', price: 25.3, category: 'Topical' },
  {
    code: '6204',
    name: 'ANKLE BRACE (POLAR)',
    price: 65.0,
    category: 'Medical Device',
  },
  { code: '6730', name: 'ANTI-ITCH CREAM', price: 25.99, category: 'Topical' },
  {
    code: '6277',
    name: 'ANTI-SNAKE VENOM',
    price: 280.0,
    category: 'Emergency',
  },
  {
    code: '3806',
    name: 'ANTICID PLUS SUSP 250ML',
    price: 22.0,
    category: 'Suspension',
  },
  {
    code: '4953',
    name: 'ANTICID PLUS TABS 2X10',
    price: 11.5,
    category: 'Gastrointestinal',
  },
  {
    code: '6817',
    name: 'ANTIPLAR 75MG CLOPIDOGREL 10X10',
    price: 99.49,
    category: 'Cardiovascular',
  },
  {
    code: '1352',
    name: 'ANUSOL OINTMENT 25GM',
    price: 94.86,
    category: 'Topical',
  },
  { code: '38', name: 'APETAMIN SYRUP', price: 35.0, category: 'Syrup' },
  {
    code: '5269',
    name: 'APETATRUST SYR 100ML',
    price: 14.5,
    category: 'Syrup',
  },
  {
    code: '1198',
    name: 'APETATRUST SYR 200ML',
    price: 24.5,
    category: 'Syrup',
  },
  {
    code: '6616',
    name: 'APPLE CIDER VINEGAR GUMMIES',
    price: 132.0,
    category: 'Supplements',
  },
  {
    code: '5645',
    name: 'APROVEL 150MG',
    price: 282.0,
    category: 'Cardiovascular',
  },
  {
    code: '5740',
    name: "APROVEL 300MG TABS 28'S",
    price: 508.0,
    category: 'Cardiovascular',
  },
  { code: '39', name: 'APTIZOOM SYRUP', price: 54.0, category: 'Syrup' },
  { code: '6742', name: 'AQUEOUS CREAM', price: 10.0, category: 'Topical' },
  {
    code: '6083',
    name: 'ARFAN 20/120MG SUSP',
    price: 5.0,
    category: 'Suspension',
  },
  {
    code: '3081',
    name: "ARFAN 20/120MG TABS 24'S",
    price: 6.6,
    category: 'Cardiovascular',
  },
  {
    code: '5876',
    name: 'ARGAN OIL BODY BUTTER 250ML',
    price: 24.16,
    category: 'Personal Care',
  },
  {
    code: '936',
    name: 'ARGAN OIL CONDITIONER 300ML',
    price: 24.16,
    category: 'Personal Care',
  },
  {
    code: '5877',
    name: 'ARGAN OIL HAIR MASK 220ML',
    price: 23.0,
    category: 'Personal Care',
  },
];

// Helper function to generate stock based on price (higher price = lower stock)
function generateStock(price: number): number {
  if (price < 10) return Math.floor(Math.random() * 500) + 200; // 200-700
  if (price < 50) return Math.floor(Math.random() * 300) + 100; // 100-400
  if (price < 200) return Math.floor(Math.random() * 100) + 50; // 50-150
  return Math.floor(Math.random() * 50) + 10; // 10-60
}

// Helper function to extract unit from product name
function extractUnit(name: string): string {
  const unitPatterns = [
    { pattern: /(\d+)\s*ML/i, unit: 'ml' },
    { pattern: /(\d+)\s*GM/i, unit: 'gm' },
    { pattern: /TABS?\s*(\d+)/i, unit: 'tabs' },
    { pattern: /CAPS?\s*(\d+)/i, unit: 'caps' },
    { pattern: /(\d+)\s*'S/i, unit: 'units' },
  ];

  for (const { pattern, unit } of unitPatterns) {
    if (pattern.test(name)) {
      return unit;
    }
  }

  // Default units based on category
  if (name.includes('SUSP') || name.includes('SYR') || name.includes('MIXTURE'))
    return 'bottle';
  if (name.includes('TAB') || name.includes('CAP')) return 'pack';
  if (name.includes('INJ') || name.includes('INJ')) return 'vial';
  return 'unit';
}

async function seedInventory() {
  console.log('Starting inventory seed...');
  console.log(`Total products to add: ${inventoryData.length}`);

  let successCount = 0;
  let errorCount = 0;

  for (const item of inventoryData) {
    try {
      const productId = `PROD-${item.code}`;
      const stock = generateStock(item.price);
      const unit = extractUnit(item.name);

      // Generate a random expiry date (6-24 months from now)
      const monthsFromNow = Math.floor(Math.random() * 18) + 6;
      const expiryDate = Date.now() + monthsFromNow * 30 * 24 * 60 * 60 * 1000;

      const product = {
        id: productId,
        name: item.name,
        category: item.category,
        price: item.price,
        stock: stock,
        unit: unit,
        description: `${item.name} - ${item.category}`,
        code: item.code,
        imageUrl: '', // Empty by default, can be added later
        expiryDate: expiryDate,
        updatedAt: Date.now(),
      };

      await setDoc(doc(db, 'inventory', productId), product);
      successCount++;
      console.log(`✓ Added: ${item.name}`);
    } catch (error) {
      errorCount++;
      console.error(`✗ Error adding ${item.name}:`, error);
    }
  }

  console.log('\n=== Seed Complete ===');
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${inventoryData.length}`);
}

// Run the seed
seedInventory()
  .then(() => {
    console.log('\nInventory seeding completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error during seeding:', error);
    process.exit(1);
  });
