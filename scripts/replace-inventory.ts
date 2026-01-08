/**
 * Replace all inventory products with new data from JSON
 * This script will:
 * 1. Delete all existing inventory products
 * 2. Import new products from data/new-inventory.json
 * 
 * Run with: pnpm replace-inventory
 * 
 * IMPORTANT: Before running, temporarily allow writes to inventory in Firestore rules
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc,
  writeBatch 
} from 'firebase/firestore';
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

// Read new inventory data from JSON file
const jsonFilePath = path.join(__dirname, '../data/new-inventory.json');
let inventoryData: any[] = [];

try {
  const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
  inventoryData = JSON.parse(fileContent);
  console.log(`✅ Loaded ${inventoryData.length} products from JSON file\n`);
} catch (error) {
  console.error('Error reading inventory data file:', error);
  process.exit(1);
}

/**
 * Sanitize drug name for use in Firebase Storage path
 */
function sanitizeFileName(name: string, preserveCase: boolean = false): string {
  let sanitized = name
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .trim();
  
  if (!preserveCase) {
    sanitized = sanitized.toLowerCase();
  }
  
  return sanitized;
}

/**
 * Generate image URL for a drug
 */
function generateImageUrl(drugName: string, useUppercase: boolean = false): string {
  const sanitized = sanitizeFileName(drugName, useUppercase);
  
  if (storageBucket) {
    const imageFileName = `${sanitized}.jpg`;
    const fullPath = `inventoryImages/${imageFileName}`;
    
    const pathSegments = fullPath.split('/');
    const encodedSegments = pathSegments.map(segment => encodeURIComponent(segment));
    const encodedPath = encodedSegments.join('%2F');
    
    let bucketName = storageBucket;
    if (bucketName.includes('.appspot.com')) {
      bucketName = bucketName.replace('.appspot.com', '');
    } else if (bucketName.includes('.firebasestorage.app')) {
      bucketName = bucketName.replace('.firebasestorage.app', '');
    }
    
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`;
  }
  
  return `inventoryImages/${sanitized}.jpg`;
}

/**
 * Parse expiry date from format "12-Mar-27" to timestamp
 */
function parseExpiryDate(expiryStr: string): number | undefined {
  if (!expiryStr || expiryStr.trim() === '') return undefined;

  try {
    const parts = expiryStr.trim().split('-');
    if (parts.length !== 3) return undefined;

    const day = parseInt(parts[0], 10);
    const monthStr = parts[1];
    const yearStr = parts[2];

    const months: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };

    const month = months[monthStr];
    if (month === undefined) return undefined;

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

  return 'Unit';
}

/**
 * Generate product code from name
 */
function generateCode(name: string, index: number): string {
  const numbers = name.match(/\d+/);
  if (numbers) {
    return numbers[0];
  }
  const letters = name.replace(/[^A-Z]/g, '').substring(0, 4);
  return letters || `PROD${String(index + 1).padStart(4, '0')}`;
}

/**
 * Generate default price based on category and stock
 */
function generateDefaultPrice(category: string, stock: number): number {
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
    'HERBAL PRODUCTS': 15.00,
    'OTC (OVER-THE-COUNTER) PRODUCTS': 12.00,
  };

  const basePrice = basePrices[category] || 20.00;
  return basePrice;
}

/**
 * Delete all existing inventory products
 */
async function deleteAllInventory() {
  console.log('🗑️  Deleting all existing inventory products...');
  
  try {
    const inventoryRef = collection(db, 'inventory');
    const snapshot = await getDocs(inventoryRef);
    
    if (snapshot.empty) {
      console.log('   No existing products to delete.\n');
      return;
    }
    
    console.log(`   Found ${snapshot.size} existing products to delete...`);
    
    // Delete in batches of 500 (Firestore limit)
    const batchSize = 500;
    const docs = snapshot.docs;
    let deletedCount = 0;
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchDocs = docs.slice(i, i + batchSize);
      
      batchDocs.forEach((docSnapshot) => {
        batch.delete(docSnapshot.ref);
      });
      
      await batch.commit();
      deletedCount += batchDocs.length;
      console.log(`   Deleted ${deletedCount}/${docs.length} products...`);
    }
    
    console.log(`✅ Deleted ${deletedCount} existing products\n`);
  } catch (error) {
    console.error('❌ Error deleting existing inventory:', error);
    throw error;
  }
}

/**
 * Import new inventory products
 */
async function importNewInventory() {
  console.log('📦 Importing new inventory products...');
  console.log(`   Total products to import: ${inventoryData.length}\n`);
  
  const USE_UPPERCASE_FILENAMES = true; // Match your current file format
  
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < inventoryData.length; i++) {
    const item = inventoryData[i];
    try {
      const name = item.Drug.trim();
      const stock = item.Quantity || 0;
      const expiryDate = parseExpiryDate(item.Expiry);

      if (!name || name === '') {
        errorCount++;
        continue;
      }

      // Generate unique product ID
      const productId = `PROD-${sanitizeFileName(name).substring(0, 20)}-${i + 1}`;
      
      // Categorize the drug
      const category = categorizeDrug(name);
      
      // Extract unit
      const unit = extractUnit(name);
      
      // Generate code
      const code = generateCode(name, i);
      
      // Generate default price
      const price = generateDefaultPrice(category, stock);
      
      // Generate image URL
      const imageUrl = generateImageUrl(name, USE_UPPERCASE_FILENAMES);

      // Build product object with all required fields
      const product: any = {
        id: productId,
        name: name,
        category: category,
        price: price,
        stock: stock,
        unit: unit,
        description: name, // Use name as description
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

      if (successCount % 10 === 0) {
        console.log(`   ✓ Imported ${successCount}/${inventoryData.length} products...`);
      }
    } catch (error) {
      errorCount++;
      console.error(`   ✗ Error importing ${item.Drug}:`, error);
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📊 Total: ${inventoryData.length}`);
}

/**
 * Main function
 */
async function replaceInventory() {
  console.log('🚀 Starting inventory replacement...\n');
  console.log('⚠️  WARNING: This will delete ALL existing inventory products!');
  console.log('   Make sure you have backed up your data if needed.\n');
  
  try {
    // Step 1: Delete all existing inventory
    await deleteAllInventory();
    
    // Step 2: Import new inventory
    await importNewInventory();
    
    console.log('\n✅ Inventory replacement completed successfully!');
    console.log('\n📝 Next Steps:');
    console.log('1. Verify products in Firebase Console → Firestore → inventory collection');
    console.log('2. Check that images are correctly linked (run pnpm match-images if needed)');
    console.log('3. Restore secure Firestore rules if you temporarily changed them');
  } catch (error) {
    console.error('\n❌ Inventory replacement failed:', error);
    throw error;
  }
}

// Run the replacement
replaceInventory()
  .then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

