/**
 * Seed script to populate Firestore with inventory data from JSON file
 * Run with: pnpm seed
 *
 * Make sure your .env.local file is configured with Firebase credentials
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { categorizeDrug } from '../lib/drug-categorizer';

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

// Read JSON file from data folder
const jsonFilePath = path.join(__dirname, '../data/drug-list.json');
let drugList: any[] = [];

try {
  const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
  drugList = JSON.parse(fileContent);
  console.log(`✓ Loaded ${drugList.length} products from JSON file`);
} catch (error) {
  console.error('Error reading JSON file:', error);
  process.exit(1);
}

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

  // Default units based on name patterns
  if (name.includes('SUSP') || name.includes('SYR') || name.includes('MIXTURE'))
    return 'bottle';
  if (name.includes('TAB') || name.includes('CAP')) return 'pack';
  if (name.includes('INJ') || name.includes('INJECTION')) return 'vial';
  if (name.includes('INF') || name.includes('INFUSION')) return 'bottle';
  return 'unit';
}

// Helper to parse expiry date from string or generate one
function parseExpiryDate(expiryStr: string | undefined): number | undefined {
  if (!expiryStr || expiryStr.trim() === '') {
    // Generate a random expiry date (6-24 months from now)
    const monthsFromNow = Math.floor(Math.random() * 18) + 6;
    return Date.now() + monthsFromNow * 30 * 24 * 60 * 60 * 1000;
  }

  // Try to parse the expiry string (assuming various formats)
  const parsed = new Date(expiryStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.getTime();
  }

  // If parsing fails, generate a random date
  const monthsFromNow = Math.floor(Math.random() * 18) + 6;
  return Date.now() + monthsFromNow * 30 * 24 * 60 * 60 * 1000;
}

// Helper to parse stock from string or generate one
function parseStock(stockStr: string | undefined, price: number): number {
  if (stockStr && stockStr.trim() !== '') {
    const parsed = parseInt(stockStr, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return generateStock(price);
}

async function seedInventory() {
  console.log('Starting inventory seed from JSON file...');
  console.log(`Total products to process: ${drugList.length}`);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const item of drugList) {
    try {
      // Skip empty entries
      if (
        !item.Code ||
        !item.Description ||
        item.Code.trim() === '' ||
        item.Description.trim() === ''
      ) {
        skippedCount++;
        continue;
      }

      const code = item.Code.toString().trim();
      const name = item.Description.toString().trim();
      const priceStr = item.CSH?.toString().trim() || '0';
      const price = parseFloat(priceStr) || 0;

      // Skip if no price or invalid price
      if (price <= 0) {
        skippedCount++;
        continue;
      }

      const productId = `PROD-${code}`;
      const stock = parseStock(item.Stock, price);
      const unit = extractUnit(name);
      const expiryDate = parseExpiryDate(item.Expiry);

      // Use provided category or intelligently categorize based on name
      let category = item.Category?.toString().trim();
      if (!category || category === '') {
        category = categorizeDrug(name, item.Description?.toString());
      }

      const subCategory = item.Sub_Category?.toString().trim() || undefined;
      const imageUrl = item.Image_Url?.toString().trim() || undefined;

      const product = {
        id: productId,
        name: name,
        category: category,
        subCategory: subCategory || undefined,
        price: price,
        stock: stock,
        unit: unit,
        description: name, // Use name as description for now
        code: code,
        imageUrl: imageUrl || undefined,
        expiryDate: expiryDate,
        updatedAt: Date.now(),
      };

      await setDoc(doc(db, 'inventory', productId), product);
      successCount++;

      if (successCount % 100 === 0) {
        console.log(`✓ Processed ${successCount} products...`);
      }
    } catch (error) {
      errorCount++;
      console.error(`✗ Error adding ${item.Description}:`, error);
    }
  }

  console.log('\n=== Seed Complete ===');
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Total processed: ${drugList.length}`);
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
