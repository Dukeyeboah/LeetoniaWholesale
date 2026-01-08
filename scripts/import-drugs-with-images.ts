/**
 * Import script for drug inventory with image URLs
 * Converts JSON format to Firestore products with imageUrl from Firebase Storage
 * 
 * Run with: pnpm tsx scripts/import-drugs-with-images.ts
 * 
 * IMPORTANT: Before running, temporarily allow writes to inventory in Firestore rules
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { categorizeDrug } from '../lib/drug-categorizer';

// Load environment variables
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error('Error: .env.local file not found.');
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
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

// Read drug data from JSON file
const jsonFilePath = path.join(__dirname, '../data/drugs-inventory.json');
let drugData: any[] = [];

try {
  const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
  drugData = JSON.parse(fileContent);
} catch (error) {
  console.error('Error reading drug data file:', error);
  process.exit(1);
}

// Fallback: If file doesn't exist, use inline data
const fallbackDrugData = [
  {
    "Drug": "COX B-200(CELECOXIB) 10'S",
    "Quantity": 3,
    "Expiry": "12-Mar-27"
  },
  {
    "Drug": "10D GLUCOSE INF 500ML",
    "Quantity": 38,
    "Expiry": "04-Dec-28"
  },
  {
    "Drug": "21ST CENTURY ASHWAGANDHA 60'S",
    "Quantity": 1,
    "Expiry": "03-Mar-29"
  },
  {
    "Drug": "2B(BENZYL BENZOATE) 2% LOTION 100ML",
    "Quantity": 32,
    "Expiry": "06-Apr-26"
  },
  {
    "Drug": "3FER SYR",
    "Quantity": 28,
    "Expiry": "02-Apr-29"
  },
  {
    "Drug": "3P GARLIC MIXTURE",
    "Quantity": 27,
    "Expiry": "12-Apr-29"
  },
  {
    "Drug": "5D (DEXTROSE 5%) INFUSION 500ML",
    "Quantity": 44,
    "Expiry": "12-Oct-29"
  },
  {
    "Drug": "ABONIKI",
    "Quantity": 228,
    "Expiry": "13-Oct-29"
  },
  {
    "Drug": "ACCU-CHECK ACTIVE STRIPS",
    "Quantity": 6,
    "Expiry": "14-Oct-29"
  },
  {
    "Drug": "ACCU-CHECK INSTANT KIT",
    "Quantity": 5,
    "Expiry": "15-Oct-29"
  },
  {
    "Drug": "ACCU-CHECK INSTANT STRIPS",
    "Quantity": 2,
    "Expiry": "16-Oct-29"
  },
  {
    "Drug": "ACETYLCYSTEINE 400MG/2ML (MUCOMIX) INJ  20'S",
    "Quantity": 25,
    "Expiry": "17-Oct-29"
  },
  {
    "Drug": "ACICLOVIR 200MG TABS 25'S UK",
    "Quantity": 36,
    "Expiry": "18-Oct-29"
  },
  {
    "Drug": "ACICLOVIR 400MG TABS 56'S UK",
    "Quantity": 4,
    "Expiry": "19-Oct-29"
  },
  {
    "Drug": "ACICLOVIR 800MG TABS 35'S UK",
    "Quantity": 10,
    "Expiry": "20-Oct-29"
  },
  {
    "Drug": "ACICLOVIR CREAM (LIPSORE)2GM UK",
    "Quantity": 8,
    "Expiry": "21-Oct-29"
  },
  {
    "Drug": "ACICLOVIR CREAM-PHARMANOVA",
    "Quantity": 123,
    "Expiry": "22-Oct-29"
  },
  {
    "Drug": "ACICLOVIR TABS 200MG 28'S VEGA",
    "Quantity": 16,
    "Expiry": "23-Oct-29"
  },
  {
    "Drug": "ACIDOM 40MG(OMEPRAZOLE) INJ",
    "Quantity": 66,
    "Expiry": "24-Oct-29"
  },
  {
    "Drug": "ACIGUARD SUSP 200ML",
    "Quantity": 35,
    "Expiry": "25-Oct-29"
  },
  {
    "Drug": "ACIGUARD-O SUSP",
    "Quantity": 36,
    "Expiry": "26-Oct-29"
  },
  {
    "Drug": "ACNE OVAL FACIAL BAR(CLEAR SOAP)",
    "Quantity": 7,
    "Expiry": "27-Oct-29"
  },
  {
    "Drug": "ACTIFED DRY COUGH SYR",
    "Quantity": 13,
    "Expiry": "28-Oct-29"
  },
  {
    "Drug": "ACTIFED MULTIACTION TABS 12'S",
    "Quantity": 20,
    "Expiry": "29-Oct-29"
  },
  {
    "Drug": "ACTILIFE",
    "Quantity": 156,
    "Expiry": "30-Oct-29"
  },
  {
    "Drug": "ACTILIFE WOMENS FLORA TABS",
    "Quantity": 79,
    "Expiry": "31-Oct-29"
  },
  {
    "Drug": "ACYVLOVIR DENK 200MG",
    "Quantity": 70,
    "Expiry": "01-Nov-29"
  },
  {
    "Drug": "ADALAT LA 30MG TABS",
    "Quantity": 22,
    "Expiry": "02-Nov-29"
  },
  {
    "Drug": "ADAPALENE GEL 0.1% 15GM",
    "Quantity": 46,
    "Expiry": "03-Nov-29"
  },
  {
    "Drug": "ADDYZOA CAPSULES",
    "Quantity": 55,
    "Expiry": "04-Nov-29"
  },
  {
    "Drug": "ADIDAS SHOWER GEL 400ML",
    "Quantity": 9,
    "Expiry": "05-Nov-29"
  },
  {
    "Drug": "ADIDAS SPRAY 150ML",
    "Quantity": 3,
    "Expiry": "06-Nov-29"
  },
  {
    "Drug": "ADIDAS SPRAY 200ML",
    "Quantity": 33,
    "Expiry": "07-Nov-29"
  },
  {
    "Drug": "ADOM NATURAL MAN CAPS",
    "Quantity": 140,
    "Expiry": "08-Nov-29"
  },
  {
    "Drug": "ADOM P.AWAY MIXTURE",
    "Quantity": 4,
    "Expiry": "09-Nov-29"
  },
  {
    "Drug": "ADOM W&G CAPSULES",
    "Quantity": 420,
    "Expiry": "10-Nov-29"
  },
  {
    "Drug": "ADRENALINE INJ 1ML/1ML 10'S",
    "Quantity": 27,
    "Expiry": "11-Nov-29"
  },
  {
    "Drug": "ADUTWUMWAA BITTERS",
    "Quantity": 17,
    "Expiry": "12-Nov-29"
  },
  {
    "Drug": "ADUTWUMWAA TONIC",
    "Quantity": 58,
    "Expiry": "13-Nov-29"
  },
  {
    "Drug": "ADVANTAN 0.1% KREM",
    "Quantity": 95,
    "Expiry": "14-Nov-29"
  },
  {
    "Drug": "ADVIL 200MG 24'S",
    "Quantity": 9,
    "Expiry": "15-Nov-29"
  },
  {
    "Drug": "ADVIL 50 X 2",
    "Quantity": 1,
    "Expiry": "16-Nov-29"
  },
  {
    "Drug": "ADVIL LIQUIGEL 120'S X2",
    "Quantity": 3,
    "Expiry": "17-Nov-29"
  },
  {
    "Drug": "AENEAS 500MG (LEVOFLOXACIN)",
    "Quantity": 11,
    "Expiry": "18-Nov-29"
  },
  {
    "Drug": "AJ WELLNESS IPACE CAPS 30'S",
    "Quantity": 3,
    "Expiry": "19-Nov-29"
  },
  {
    "Drug": "AJ WELLNESS PREGNA TABS 30'S",
    "Quantity": 11,
    "Expiry": "20-Nov-29"
  },
  {
    "Drug": "AJ WELLNESS PROCARE CAPS 30'S",
    "Quantity": 2,
    "Expiry": "21-Nov-29"
  },
  {
    "Drug": "AJ WELLNESS SKIN,HAIR & NAILS CAPS 30'S",
    "Quantity": 9,
    "Expiry": "22-Nov-29"
  },
  {
    "Drug": "AJ WELLNESS VITAL B PLUS CAPS 30'S",
    "Quantity": 7,
    "Expiry": "23-Nov-29"
  },
  {
    "Drug": "AJ WELLNESS VITAL MAN TABS 30'S",
    "Quantity": 15,
    "Expiry": "24-Nov-29"
  },
  {
    "Drug": "AJ WELLNESS VITAL SEAS GOLD CAPS 30'S",
    "Quantity": 6,
    "Expiry": "25-Nov-29"
  },
  {
    "Drug": "AJ WELLNESS VITAL SEAS SILVER CAPS 30'S",
    "Quantity": 5,
    "Expiry": "26-Nov-29"
  },
  {
    "Drug": "ALBENDAZOLE 400MG(OBEND)",
    "Quantity": 110,
    "Expiry": "27-Nov-29"
  },
  {
    "Drug": "ALDACTONE 25MG TABS 100'S",
    "Quantity": 20,
    "Expiry": "28-Nov-29"
  },
  {
    "Drug": "ALDOMET 250MG TABS 60'S",
    "Quantity": 42,
    "Expiry": "29-Nov-29"
  },
  {
    "Drug": "ALENDRONIC ACID 70MG TABS 4'S",
    "Quantity": 45,
    "Expiry": "30-Nov-29"
  },
  {
    "Drug": "ALKA-5 SYR 100ML",
    "Quantity": 49,
    "Expiry": "01-Dec-29"
  },
  {
    "Drug": "ALLEREX EYE DROP",
    "Quantity": 9,
    "Expiry": "02-Dec-29"
  },
  {
    "Drug": "ALLOPURINOL 100MG X 28",
    "Quantity": 36,
    "Expiry": "03-Dec-29"
  },
  {
    "Drug": "ALLUPIRINOL 300MG TABS 28'S UK",
    "Quantity": 24,
    "Expiry": "04-Dec-29"
  },
  {
    "Drug": "ALMETRO (METRONIDAZOLE) INJECTION",
    "Quantity": 91,
    "Expiry": "05-Dec-29"
  },
  {
    "Drug": "ALMOL PARACETAMOL INFUSION 100ML",
    "Quantity": 1,
    "Expiry": "06-Dec-29"
  },
  {
    "Drug": "ALPHA GARLIC CAPS 30'S",
    "Quantity": 55,
    "Expiry": "07-Dec-29"
  },
  {
    "Drug": "ALPHA GARLIC CAPS 60'S",
    "Quantity": 28,
    "Expiry": "08-Dec-29"
  },
  {
    "Drug": "ALPHA LIFE Q-CALCIUM TABS 60'S",
    "Quantity": 8,
    "Expiry": "09-Dec-29"
  },
  {
    "Drug": "ALPHA OMEGA 3 CAPS 10X10",
    "Quantity": 81,
    "Expiry": "10-Dec-29"
  },
  {
    "Drug": "ALPHA VIT.C ZINC EFF. TABS",
    "Quantity": 144,
    "Expiry": "11-Dec-29"
  },
  {
    "Drug": "ALPHA VITAMIN E 400IU 30'S",
    "Quantity": 3,
    "Expiry": "12-Dec-29"
  },
  {
    "Drug": "ALPHAGAN EYE DROPS 5ML",
    "Quantity": 5,
    "Expiry": "13-Dec-29"
  },
  {
    "Drug": "ALUDROX TABS 100X10 LETAP",
    "Quantity": 3,
    "Expiry": "14-Dec-29"
  },
  {
    "Drug": "ALWAYS PANTYLINER NORMAL 20'S",
    "Quantity": 20,
    "Expiry": "15-Dec-29"
  },
  {
    "Drug": "AMARYL 2MG 30 TABS",
    "Quantity": 4,
    "Expiry": "16-Dec-29"
  },
  {
    "Drug": "AMARYL 4MG 30 TABS",
    "Quantity": 8,
    "Expiry": "17-Dec-29"
  },
  {
    "Drug": "AMCICLOX SUSP 100ML",
    "Quantity": 90,
    "Expiry": "18-Dec-29"
  },
  {
    "Drug": "AMCOF BABY",
    "Quantity": 70,
    "Expiry": "19-Dec-29"
  },
  {
    "Drug": "AMCOF JUNIOR",
    "Quantity": 102,
    "Expiry": "20-Dec-29"
  },
  {
    "Drug": "AMICLOX 250MG/5ML SUSP 100ML",
    "Quantity": 3,
    "Expiry": "21-Dec-29"
  },
  {
    "Drug": "AMIKACIN INJECTION",
    "Quantity": 10,
    "Expiry": "22-Dec-29"
  },
  {
    "Drug": "AMINOPHYLLINE 250MG INJ 1ML 50'S PER AMP",
    "Quantity": 43,
    "Expiry": "23-Dec-29"
  },
  {
    "Drug": "AMIODARONE 200MG TABS 28'S",
    "Quantity": 13,
    "Expiry": "24-Dec-29"
  },
  {
    "Drug": "AMITRIPTYLINE 10MG TABS 28'S UK",
    "Quantity": 47,
    "Expiry": "25-Dec-29"
  },
  {
    "Drug": "AMITRIPTYLINE 25MG TEVA",
    "Quantity": 38,
    "Expiry": "26-Dec-29"
  },
  {
    "Drug": "AMLO DENK 5MG 10X5",
    "Quantity": 9,
    "Expiry": "27-Dec-29"
  },
  {
    "Drug": "AMLO-DENK 10MG TABS 10X5",
    "Quantity": 10,
    "Expiry": "28-Dec-29"
  },
  {
    "Drug": "AMLODIPINE BES TAB 10MG TEV 28",
    "Quantity": 228,
    "Expiry": "29-Dec-29"
  },
  {
    "Drug": "AMLODIPINE BES TAB 5MG TEV 28",
    "Quantity": 10,
    "Expiry": "30-Dec-29"
  },
  {
    "Drug": "AMLONOVA 10MG TABS 30'S",
    "Quantity": 16,
    "Expiry": "31-Dec-29"
  },
  {
    "Drug": "AMOKSIKLAV 457 SUSP",
    "Quantity": 63,
    "Expiry": "01-Jan-30"
  },
  {
    "Drug": "AMOKSIKLAV 625 TAB",
    "Quantity": 158,
    "Expiry": "02-Jan-30"
  },
  {
    "Drug": "AMOKXICLAV 625MG TABS VEGA",
    "Quantity": 3,
    "Expiry": "03-Jan-30"
  },
  {
    "Drug": "AMOKXINATE 1.2G INJ",
    "Quantity": 42,
    "Expiry": "04-Jan-30"
  },
  {
    "Drug": "AMOKXINATE 1G TABS 14'S",
    "Quantity": 63,
    "Expiry": "05-Jan-30"
  },
  {
    "Drug": "AMOKXINATE 457MG SUSP",
    "Quantity": 55,
    "Expiry": "06-Jan-30"
  },
  {
    "Drug": "AMOKXINATE 625MG TABS",
    "Quantity": 42,
    "Expiry": "07-Jan-30"
  },
  {
    "Drug": "AMOVULIN 457",
    "Quantity": 55,
    "Expiry": "08-Jan-30"
  },
  {
    "Drug": "AMOVULIN 625",
    "Quantity": 122,
    "Expiry": "09-Jan-30"
  },
  {
    "Drug": "AMOXI & CLAV 228MG SUSP 70ML LUEX",
    "Quantity": 2,
    "Expiry": "10-Jan-30"
  },
  {
    "Drug": "AMOXI & CLAV 475MG SUSP 70ML LUEX",
    "Quantity": 53,
    "Expiry": "11-Jan-30"
  },
  {
    "Drug": "AMOXI + CLAV 1GM  14'S LUEX",
    "Quantity": 48,
    "Expiry": "12-Jan-30"
  },
  {
    "Drug": "AMOXI CLAV. 625 TABS 14'S LUEX",
    "Quantity": 66,
    "Expiry": "13-Jan-30"
  },
  {
    "Drug": "AMOXICILLIN 125MG/5ML SUSP 100ML VEGA",
    "Quantity": 46,
    "Expiry": "14-Jan-30"
  },
  {
    "Drug": "AMOXICILLIN 250MG CAPS 50X10-LETAP",
    "Quantity": 9,
    "Expiry": "15-Jan-30"
  },
  {
    "Drug": "AMOXICILLIN 500MG CAPS 10X10 LETAP",
    "Quantity": 8,
    "Expiry": "16-Jan-30"
  },
  {
    "Drug": "AMOXICILLIN SUSP 100ML LETAP",
    "Quantity": 78,
    "Expiry": "17-Jan-30"
  },
  {
    "Drug": "AMOXICILLIN SUSP 100ML M&G",
    "Quantity": 50,
    "Expiry": "18-Jan-30"
  },
  {
    "Drug": "AMOXYCILLIN CAP EXETER 21'S",
    "Quantity": 152,
    "Expiry": "19-Jan-30"
  },
  {
    "Drug": "AMOXYCILLIN CAPS 500MG 21'S UK",
    "Quantity": 21,
    "Expiry": "20-Jan-30"
  },
  {
    "Drug": "AMOXYCILLIN SUSP 125MG/5ML UK",
    "Quantity": 63,
    "Expiry": "21-Jan-30"
  },
  {
    "Drug": "AMPICILLIN 250MG CAPS",
    "Quantity": 3,
    "Expiry": "22-Jan-30"
  },
  {
    "Drug": "AMUROX 250MG(CEFUROXIME) TABS",
    "Quantity": 11,
    "Expiry": "23-Jan-30"
  },
  {
    "Drug": "AMUZU GARLIC MIXTURE",
    "Quantity": 13,
    "Expiry": "24-Jan-30"
  },
  {
    "Drug": "ANACONDA BALM 65GM",
    "Quantity": 34,
    "Expiry": "25-Jan-30"
  },
  {
    "Drug": "ANAFRANIL 25MG TABS 50'S INDIA",
    "Quantity": 42,
    "Expiry": "26-Jan-30"
  },
  {
    "Drug": "ANAFRANIL TAB 25MG 1 X 30",
    "Quantity": 15,
    "Expiry": "27-Jan-30"
  },
  {
    "Drug": "ANASTRAZOLE TABS 1MG 28'S",
    "Quantity": 4,
    "Expiry": "28-Jan-30"
  },
  {
    "Drug": "ANCIGEL",
    "Quantity": 20,
    "Expiry": "29-Jan-30"
  },
  {
    "Drug": "ANKLE BRACE (POLAR)",
    "Quantity": 15,
    "Expiry": "30-Jan-30"
  },
  {
    "Drug": "ANTASIL TABLET 50 X 10",
    "Quantity": 1,
    "Expiry": "31-Jan-30"
  },
  {
    "Drug": "ANTICID PLUS SUSP 250ML",
    "Quantity": 1,
    "Expiry": "01-Feb-30"
  },
  {
    "Drug": "ANTICID PLUS TABS 2X10",
    "Quantity": 4,
    "Expiry": "02-Feb-30"
  },
  {
    "Drug": "ANTIPLAR 75MG CLOPIDOGREL 10X10",
    "Quantity": 15,
    "Expiry": "03-Feb-30"
  },
  {
    "Drug": "ANUSOL OINTMENT 25GM",
    "Quantity": 25,
    "Expiry": "04-Feb-30"
  },
  {
    "Drug": "ANUSOL PLUS HC OINTMENT",
    "Quantity": 24,
    "Expiry": "05-Feb-30"
  },
  {
    "Drug": "APETAMIN SYRUP",
    "Quantity": 9,
    "Expiry": "06-Feb-30"
  },
  {
    "Drug": "APETATRUST SYR 100ML",
    "Quantity": 43,
    "Expiry": "07-Feb-30"
  },
  {
    "Drug": "APETATRUST SYR 200ML",
    "Quantity": 17,
    "Expiry": "08-Feb-30"
  },
  {
    "Drug": "APIXABAN TABS 2.5MG 60'S",
    "Quantity": 9,
    "Expiry": "09-Feb-30"
  },
  {
    "Drug": "APPLE CIDER VINEGAR GUMMIES",
    "Quantity": 13,
    "Expiry": "10-Feb-30"
  },
  {
    "Drug": "APROVEL 150MG",
    "Quantity": 10,
    "Expiry": "11-Feb-30"
  },
  {
    "Drug": "APROVEL 300MG TABS 28'S",
    "Quantity": 15,
    "Expiry": "12-Feb-30"
  },
  {
    "Drug": "AQUAFRESH MOUTH WASH 500ML",
    "Quantity": 60,
    "Expiry": "13-Feb-30"
  },
  {
    "Drug": "AQUAFRESH TOOTHPASTE 100ML",
    "Quantity": 52,
    "Expiry": "14-Feb-30"
  },
  {
    "Drug": "AQUEOUS CREAM",
    "Quantity": 13,
    "Expiry": "15-Feb-30"
  },
  {
    "Drug": "ARFAN 20/120MG SUSP",
    "Quantity": 9,
    "Expiry": "16-Feb-30"
  },
  {
    "Drug": "ARFAN 20/120MG TABS 24'S",
    "Quantity": 95,
    "Expiry": "17-Feb-30"
  },
  {
    "Drug": "ARGAN OIL CONDITIONER 300ML",
    "Quantity": 19,
    "Expiry": "18-Feb-30"
  },
  {
    "Drug": "ARGAN OIL HEAT DEFENCE",
    "Quantity": 52,
    "Expiry": "19-Feb-30"
  },
  {
    "Drug": "ARGAN OIL SHAMPOO 300ML",
    "Quantity": 24,
    "Expiry": "20-Feb-30"
  },
  {
    "Drug": "ARTENATE 120MG INJ",
    "Quantity": 7,
    "Expiry": "21-Feb-30"
  },
  {
    "Drug": "ARTENATE 30MG 1'",
    "Quantity": 132,
    "Expiry": "22-Feb-30"
  },
  {
    "Drug": "ARTENATE 60MG INJ",
    "Quantity": 2,
    "Expiry": "23-Feb-30"
  },
  {
    "Drug": "ARTHROSAMINE PLUS CAPS 60'S",
    "Quantity": 16,
    "Expiry": "24-Feb-30"
  },
  {
    "Drug": "ARTHROTEC 75MG 100'S",
    "Quantity": 1,
    "Expiry": "25-Feb-30"
  },
  {
    "Drug": "ARTHROTEC 75MG CAPS 20'S",
    "Quantity": 15,
    "Expiry": "26-Feb-30"
  },
  {
    "Drug": "ARZIGLOBIN PLUS SYR",
    "Quantity": 30,
    "Expiry": "27-Feb-30"
  },
  {
    "Drug": "ARZIGLOBIN SYR 200ML",
    "Quantity": 38,
    "Expiry": "28-Feb-30"
  },
  {
    "Drug": "ASCOVIT CEE TAB",
    "Quantity": 19,
    "Expiry": "01-Mar-30"
  },
  {
    "Drug": "ASENA",
    "Quantity": 8,
    "Expiry": "02-Mar-30"
  },
  {
    "Drug": "ASEPSO ACNE CARE SOAP",
    "Quantity": 2,
    "Expiry": "03-Mar-30"
  },
  {
    "Drug": "ASMADRIN 25X 4'S",
    "Quantity": 30,
    "Expiry": "04-Mar-30"
  },
  {
    "Drug": "ASNAC-SR 100MG DICLOFENAC TAB",
    "Quantity": 93,
    "Expiry": "05-Mar-30"
  },
  {
    "Drug": "ASNAC-SR 75MG DICLOFENAC TAB",
    "Quantity": 10,
    "Expiry": "06-Mar-30"
  },
  {
    "Drug": "ASPA MALARIA TEST KIT",
    "Quantity": 9,
    "Expiry": "07-Mar-30"
  },
  {
    "Drug": "ASPA PREGNANCY TEST (MIDSTREAM)",
    "Quantity": 245,
    "Expiry": "08-Mar-30"
  },
  {
    "Drug": "ASPANOL PRODUCTIVE SYR 125ML",
    "Quantity": 97,
    "Expiry": "09-Mar-30"
  },
  {
    "Drug": "ASPAR DISP ASPIRIN TAB 75MG 100BLISTER",
    "Quantity": 103,
    "Expiry": "10-Mar-30"
  },
  {
    "Drug": "ASPIRIN CARDIO",
    "Quantity": 16,
    "Expiry": "11-Mar-30"
  },
  {
    "Drug": "ASTHALEX INHALER",
    "Quantity": 24,
    "Expiry": "12-Mar-30"
  },
  {
    "Drug": "ASTHALEX SYRUP 100ML",
    "Quantity": 30,
    "Expiry": "13-Mar-30"
  },
  {
    "Drug": "ATENOLOL 100MG TABS 28'S UK",
    "Quantity": 16,
    "Expiry": "14-Mar-30"
  },
  {
    "Drug": "ATENOLOL 25MG TABS 28'S UK",
    "Quantity": 1,
    "Expiry": "15-Mar-30"
  },
  {
    "Drug": "ATENOLOL 50MG X 28 UK",
    "Quantity": 64,
    "Expiry": "16-Mar-30"
  },
  {
    "Drug": "ATENOVA 100MG TABS 30'S",
    "Quantity": 50,
    "Expiry": "17-Mar-30"
  },
  {
    "Drug": "ATORVASTATIN 40MG UK",
    "Quantity": 175,
    "Expiry": "18-Mar-30"
  },
  {
    "Drug": "ATORVASTATIN TAB 20MG TEVA",
    "Quantity": 8,
    "Expiry": "19-Mar-30"
  },
  {
    "Drug": "ATWOOD LAXATIVE BITTERS 177ML",
    "Quantity": 37,
    "Expiry": "20-Mar-30"
  },
  {
    "Drug": "AUGMENTIN 625",
    "Quantity": 2,
    "Expiry": "21-Mar-30"
  },
  {
    "Drug": "AUNTIE MARY GRIPEWATER 150ML",
    "Quantity": 47,
    "Expiry": "22-Mar-30"
  },
  {
    "Drug": "AVAMYS NASAL SPRAY",
    "Quantity": 21,
    "Expiry": "23-Mar-30"
  },
  {
    "Drug": "AVEENO BABY BATH 532ML",
    "Quantity": 5,
    "Expiry": "24-Jun-30"
  },
  {
    "Drug": "AVEENO MOISTURING BODY WASH 300ML",
    "Quantity": 2,
    "Expiry": "15-Feb-30"
  },
  {
    "Drug": "AVODART SOFT CAP 30'S",
    "Quantity": 1,
    "Expiry": "26-Mar-30"
  },
  {
    "Drug": "AZILEX 250MG 6'S",
    "Quantity": 68,
    "Expiry": "27-Mar-30"
  },
  {
    "Drug": "AZIS-500MG AZITHROMYCIN TABS",
    "Quantity": 25,
    "Expiry": "28-Mar-30"
  },
  {
    "Drug": "AZITEX 500MG CAPS 3'S",
    "Quantity": 1,
    "Expiry": "29-Mar-30"
  },
  {
    "Drug": "AZITHRAA 500MG (AZITHROMYCIN)",
    "Quantity": 203,
    "Expiry": "30-Mar-30"
  }
];

if (drugData.length === 0) {
  drugData = fallbackDrugData;
}

/**
 * Sanitize drug name for use in Firebase Storage path
 * Removes special characters and replaces spaces with underscores
 * Set preserveCase to true to keep original case (for uppercase filenames)
 */
function sanitizeFileName(name: string, preserveCase: boolean = false): string {
  let sanitized = name
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .trim();
  
  // Convert to lowercase unless preserving case
  if (!preserveCase) {
    sanitized = sanitized.toLowerCase();
  }
  
  return sanitized;
}

/**
 * Generate image URL for a drug
 * Firebase Storage URL format:
 * https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media
 * 
 * Set useUppercase to true if your image files are in UPPERCASE format
 */
function generateImageUrl(drugName: string, useUppercase: boolean = false): string {
  // If useUppercase is true, preserve the uppercase format
  const sanitized = sanitizeFileName(drugName, useUppercase);
  
  if (storageBucket) {
    // Firebase Storage URL format requires proper encoding
    // The path must be fully URL encoded, including the folder separator
    const imageFileName = `${sanitized}.jpg`; // Default to .jpg, user can change extension if needed
    const fullPath = `inventoryImages/${imageFileName}`;
    
    // Encode each path segment separately, then join with %2F
    // This ensures proper encoding for Firebase Storage
    const pathSegments = fullPath.split('/');
    const encodedSegments = pathSegments.map(segment => encodeURIComponent(segment));
    const encodedPath = encodedSegments.join('%2F');
    
    // Normalize bucket name (remove .appspot.com or .firebasestorage.app if present in env var)
    // Firebase Storage URLs use the bucket name without the domain suffix
    let bucketName = storageBucket;
    if (bucketName.includes('.appspot.com')) {
      bucketName = bucketName.replace('.appspot.com', '');
    } else if (bucketName.includes('.firebasestorage.app')) {
      bucketName = bucketName.replace('.firebasestorage.app', '');
    }
    
    // Build the Firebase Storage download URL
    // Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media
    // Example: https://firebasestorage.googleapis.com/v0/b/leetonia-43222/o/inventoryImages%2Fimage.jpg?alt=media
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`;
  }
  
  // Fallback path format
  return `inventoryImages/${sanitized}.jpg`;
}

/**
 * Parse expiry date from format "12-Mar-27" to timestamp
 */
function parseExpiryDate(expiryStr: string): number | undefined {
  if (!expiryStr || expiryStr.trim() === '') return undefined;

  try {
    // Format: "12-Mar-27" -> Date
    const parts = expiryStr.trim().split('-');
    if (parts.length !== 3) return undefined;

    const day = parseInt(parts[0], 10);
    const monthStr = parts[1];
    const yearStr = parts[2];

    // Month mapping
    const months: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };

    const month = months[monthStr];
    if (month === undefined) return undefined;

    // Handle 2-digit year (assume 2000s if < 50, else 1900s)
    let year = parseInt(yearStr, 10);
    if (year < 50) {
      year += 2000;
    } else {
      year += 1900;
    }

    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return undefined;

    return date.getTime();
  } catch (error) {
    console.error(`Error parsing expiry date: ${expiryStr}`, error);
    return undefined;
  }
}

/**
 * Extract unit from drug name
 */
function extractUnit(name: string): string {
  const unitPatterns = [
    /(\d+)\s*(ML|ml|L|l|GM|gm|G|g|MG|mg|KG|kg)/i,
    /(TABS?|CAPS?|TABLETS?|CAPSULES?|STRIPS?|KIT|INJ|SYR|SUSP|MIXTURE|CREAM|OINTMENT|DROPS?|SPRAY|GEL|BALM|SOAP|SHAMPOO|CONDITIONER|TOOTHPASTE|MOUTH\s*WASH)/i,
  ];

  for (const pattern of unitPatterns) {
    const match = name.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  // Default unit
  return 'Unit';
}

/**
 * Generate product code from name
 */
function generateCode(name: string, index: number): string {
  // Try to extract numbers from name, or use index
  const numbers = name.match(/\d+/);
  if (numbers) {
    return numbers[0];
  }
  // Generate code from first letters
  const letters = name.replace(/[^A-Z]/g, '').substring(0, 4);
  return letters || `DRUG${index + 1}`;
}

/**
 * Generate default price based on category and stock
 */
function generateDefaultPrice(category: string, stock: number): number {
  // Base prices by category (in GHS)
  const basePrices: Record<string, number> = {
    'ANTIBIOTICS': 25.00,
    'ANALGESICS & ANTI-INFLAMMATORIES (PAINKILLERS)': 15.00,
    'CARDIOVASCULAR MEDICINES': 30.00,
    'DIABETES MEDICINES': 35.00,
    'VITAMINS & MINERALS': 20.00,
    'DIETARY OR NUTRITIONAL SUPPLEMENTS': 25.00,
    'IV FLUIDS (INFUSIONS)': 50.00,
    'SPECIALTY INJECTIONS': 40.00,
    'DERMATOLOGICAL (SKIN) MEDICINES': 18.00,
    'EYE & EAR PREPARATIONS': 22.00,
    'RESPIRATORY MEDICINES': 20.00,
    'GASTROINTESTINAL MEDICINES': 15.00,
    'HYGIENE & PERSONAL CARE': 12.00,
    'MEDICAL CONSUMABLES': 10.00,
  };

  const basePrice = basePrices[category] || 20.00;
  
  // Adjust based on stock (higher stock might indicate lower price, but we'll keep it simple)
  return basePrice;
}

async function importDrugs() {
  console.log('Starting drug import with images...');
  console.log(`Total products to process: ${drugData.length}`);
  
  // Check if user wants to use uppercase filenames
  // Set this to true if your image files are in UPPERCASE format (e.g., 10D_GLUCOSE_INF_500ML.jpg)
  const USE_UPPERCASE_FILENAMES = true; // Change to false if you rename files to lowercase
  
  if (USE_UPPERCASE_FILENAMES) {
    console.log('⚠️  Using UPPERCASE filenames (matching your current file format)');
  } else {
    console.log('Using lowercase filenames');
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < drugData.length; i++) {
    const item = drugData[i];
    try {
      const name = item.Drug.trim();
      const stock = item.Quantity || 0;
      const expiryDate = parseExpiryDate(item.Expiry);

      // Skip if no name
      if (!name || name === '') {
        errorCount++;
        continue;
      }

      // Generate product ID from name
      const productId = `PROD-${sanitizeFileName(name).substring(0, 20)}-${i + 1}`;
      
      // Categorize the drug
      const category = categorizeDrug(name);
      
      // Extract unit
      const unit = extractUnit(name);
      
      // Generate code
      const code = generateCode(name, i);
      
      // Generate default price
      const price = generateDefaultPrice(category, stock);
      
      // Generate image URL (use uppercase if your files are uppercase)
      const imageUrl = generateImageUrl(name, USE_UPPERCASE_FILENAMES);

      // Build product object
      const product: any = {
        id: productId,
        name: name,
        category: category,
        price: price,
        stock: stock,
        unit: unit,
        description: name,
        code: code,
        imageUrl: imageUrl,
        updatedAt: Date.now(),
      };

      // Add expiry date if available
      if (expiryDate) {
        product.expiryDate = expiryDate;
      }

      // Save to Firestore
      await setDoc(doc(db, 'inventory', productId), product);
      successCount++;

      // Show expected image filename for first few products
      if (successCount <= 5) {
        const expectedImageName = `${sanitizeFileName(name, USE_UPPERCASE_FILENAMES)}.jpg`;
        console.log(`  → Expected image: ${expectedImageName}`);
      }

      if (successCount % 10 === 0) {
        console.log(`✓ Processed ${successCount} products...`);
      }
    } catch (error) {
      errorCount++;
      console.error(`✗ Error adding ${item.Drug}:`, error);
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${drugData.length}`);
  console.log('\n📝 Next Steps:');
  console.log('1. Upload images to Firebase Storage in folder: inventoryImages/');
  if (USE_UPPERCASE_FILENAMES) {
    console.log('2. Name images using sanitized drug names (UPPERCASE with underscores)');
    console.log('   Example: "10D GLUCOSE INF 500ML" → "10D_GLUCOSE_INF_500ML.jpg"');
    console.log('3. ✅ Your current UPPERCASE filenames will work!');
  } else {
    console.log('2. Name images using sanitized drug names (lowercase with underscores)');
    console.log('   Example: "10D GLUCOSE INF 500ML" → "10d_glucose_inf_500ml.jpg"');
    console.log('3. ⚠️  IMPORTANT: Filenames must be lowercase to match generated URLs');
  }
  console.log('4. Images will automatically be linked to products via imageUrl');
  console.log('\n💡 Tip: Check the first 5 products above to see expected image filenames');
}

// Run the import
importDrugs()
  .then(() => {
    console.log('\n✅ Import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });

