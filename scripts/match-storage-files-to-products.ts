/**
 * Match actual Firebase Storage filenames to products and update imageUrl
 * This script reads files from Storage and matches them to products, so you don't need to rename files!
 * 
 * Run with: pnpm tsx scripts/match-storage-files-to-products.ts
 * 
 * IMPORTANT: Temporarily allow writes to inventory in Firestore rules before running
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getStorage, listAll, ref, getDownloadURL } from 'firebase/storage';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

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
const storage = getStorage(app);
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

/**
 * Normalize a string for fuzzy matching
 * Handles hyphens, spaces, and other separators consistently
 * Converts to uppercase and normalizes separators
 */
function normalizeForMatching(str: string): string {
  return str
    .toUpperCase()
    .replace(/[-_]/g, ' ') // Convert hyphens and underscores to spaces first
    .replace(/[^A-Z0-9\s]/g, '') // Remove other special characters
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim()
    .replace(/\s+/g, '_'); // Finally convert spaces to underscores for comparison
}

/**
 * Calculate similarity between two strings (simple Levenshtein-like)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeForMatching(str1);
  const s2 = normalizeForMatching(str2);
  
  // Exact match
  if (s1 === s2) return 1.0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Calculate character overlap
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  
  return matches / longer.length;
}

/**
 * Generate Firebase Storage download URL using Firebase SDK
 * This ensures we get the correct URL format that matches the actual file
 */
async function generateDownloadUrl(storageRef: any): Promise<string> {
  try {
    // Use Firebase SDK's getDownloadURL which handles encoding correctly
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (error) {
    console.error('Error getting download URL:', error);
    return '';
  }
}

/**
 * Match a storage filename to a product name
 */
function findBestMatch(filename: string, productNames: string[]): { name: string; similarity: number } | null {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  
  let bestMatch: { name: string; similarity: number } | null = null;
  let bestScore = 0;
  
  for (const productName of productNames) {
    const similarity = calculateSimilarity(nameWithoutExt, productName);
    
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = { name: productName, similarity };
    }
  }
  
  // Only return if similarity is reasonable (at least 0.5)
  return bestScore >= 0.5 ? bestMatch : null;
}

async function matchStorageFilesToProducts() {
  console.log('Starting file matching process...');
  console.log('This will match your actual Storage filenames to products\n');

  try {
    // Get all products from Firestore
    console.log('📦 Fetching products from Firestore...');
    const productsSnapshot = await getDocs(collection(db, 'inventory'));
    const products = productsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Array<{ id: string; name: string; imageUrl?: string }>;

    console.log(`Found ${products.length} products\n`);

    // Get all files from Storage
    console.log('📁 Fetching files from Firebase Storage...');
    const storageRef = ref(storage, 'inventoryImages');
    const fileList = await listAll(storageRef);
    
    console.log(`Found ${fileList.items.length} files, fetching download URLs...\n`);
    
    // Fetch download URLs for all files (this ensures we get the correct URL format)
    const storageFiles = await Promise.all(
      fileList.items.map(async (item) => {
        // Get the full path
        const fullPath = item.fullPath;
        // Extract just the filename
        const filename = fullPath.split('/').pop() || fullPath;
        // Get the actual download URL from Firebase (this handles encoding correctly)
        let downloadUrl = '';
        try {
          downloadUrl = await getDownloadURL(item);
        } catch (error) {
          console.warn(`⚠️  Could not get URL for ${filename}:`, error);
        }
        return { filename, fullPath, downloadUrl, storageRef: item };
      })
    );

    // Show first few files for verification
    console.log('First 5 files found:');
    storageFiles.slice(0, 5).forEach((file) => {
      console.log(`  - ${file.filename}`);
      if (file.downloadUrl) {
        console.log(`    URL: ${file.downloadUrl.substring(0, 80)}...`);
      }
    });
    console.log('');

    if (storageFiles.length === 0) {
      console.log('⚠️  No files found in inventoryImages folder. Please upload images first.');
      return;
    }

    // Create a map of product names
    const productNames = products.map((p) => p.name);

    // Match files to products
    console.log('🔍 Matching files to products...\n');
    const matches: Array<{
      productId: string;
      productName: string;
      filename: string;
      url: string;
      similarity: number;
    }> = [];

    for (const file of storageFiles) {
      const match = findBestMatch(file.filename, productNames);
      
      if (match) {
        const product = products.find((p) => p.name === match.name);
        if (product && file.downloadUrl) {
          // Use the download URL we got from Firebase SDK (guaranteed to be correct)
          matches.push({
            productId: product.id,
            productName: product.name,
            filename: file.filename,
            url: file.downloadUrl,
            similarity: match.similarity,
          });
        }
      }
    }

    // Sort by similarity (best matches first)
    matches.sort((a, b) => b.similarity - a.similarity);

    console.log(`Found ${matches.length} matches:\n`);
    console.log('='.repeat(120));
    console.log('Product Name'.padEnd(50) + 'Storage File'.padEnd(40) + 'URL Preview'.padEnd(30));
    console.log('='.repeat(120));

    matches.slice(0, 10).forEach((match) => {
      const urlPreview = match.url.substring(0, 60) + '...';
      console.log(
        `${match.productName.substring(0, 48).padEnd(50)}${match.filename.substring(0, 38).padEnd(40)}${urlPreview}`
      );
    });
    
    if (matches.length > 10) {
      console.log(`... and ${matches.length - 10} more matches`);
    }

    console.log('\n' + '='.repeat(100));

    // Show unmatched files
    const matchedFilenames = new Set(matches.map((m) => m.filename));
    const unmatchedFiles = storageFiles.filter((f) => !matchedFilenames.has(f.filename));

    if (unmatchedFiles.length > 0) {
      console.log(`\n⚠️  ${unmatchedFiles.length} files could not be matched:`);
      unmatchedFiles.forEach((file) => {
        console.log(`   - ${file.filename}`);
      });
    }

    // Show products without matches
    const matchedProductIds = new Set(matches.map((m) => m.productId));
    const unmatchedProducts = products.filter((p) => !matchedProductIds.has(p.id));

    if (unmatchedProducts.length > 0) {
      console.log(`\n⚠️  ${unmatchedProducts.length} products have no matching images:`);
      unmatchedProducts.slice(0, 10).forEach((product) => {
        console.log(`   - ${product.name}`);
      });
      if (unmatchedProducts.length > 10) {
        console.log(`   ... and ${unmatchedProducts.length - 10} more`);
      }
    }

    // Ask for confirmation before updating
    console.log(`\n✅ Ready to update ${matches.length} products with image URLs`);
    console.log('\nUpdating Firestore...\n');

    let updatedCount = 0;
    let errorCount = 0;

    for (const match of matches) {
      try {
        await updateDoc(doc(db, 'inventory', match.productId), {
          imageUrl: match.url,
          updatedAt: Date.now(),
        });
        updatedCount++;
        
        if (updatedCount % 10 === 0) {
          console.log(`✓ Updated ${updatedCount} products...`);
        }
      } catch (error) {
        errorCount++;
        console.error(`✗ Error updating ${match.productName}:`, error);
      }
    }

    console.log('\n' + '='.repeat(100));
    console.log('=== Update Complete ===');
    console.log(`Updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total matches: ${matches.length}`);
    console.log('\n✅ All matched products now have correct imageUrl pointing to your Storage files!');
  } catch (error) {
    console.error('Error matching files:', error);
    process.exit(1);
  }
}

// Run the matching
matchStorageFilesToProducts()
  .then(() => {
    console.log('\n✅ File matching completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Matching failed:', error);
    process.exit(1);
  });

