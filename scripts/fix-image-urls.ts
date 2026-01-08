/**
 * Fix existing image URLs in Firestore
 * This script updates all product imageUrl fields to use proper Firebase Storage URL encoding
 * 
 * Run with: pnpm tsx scripts/fix-image-urls.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
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
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

/**
 * Fix a Firebase Storage URL by properly encoding the path
 */
function fixImageUrl(url: string): string | null {
  if (!url || !storageBucket) return null;

  // Check if it's already a Firebase Storage URL
  if (url.includes('firebasestorage.googleapis.com')) {
    // Extract the path from the URL
    // Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media
    const match = url.match(/\/o\/([^?]+)/);
    if (match) {
      const currentPath = decodeURIComponent(match[1]);
      
      // If the path doesn't have %2F, it means it's incorrectly formatted
      if (currentPath.includes('/') && !url.includes('%2F')) {
        // Re-encode the path properly
        const encodedPath = encodeURIComponent(currentPath);
        return `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodedPath}?alt=media`;
      }
      
      // If it's already properly encoded, return as is
      return url;
    }
  }

  // If it's a relative path, convert to full URL
  if (url.startsWith('inventoryImages/')) {
    const encodedPath = encodeURIComponent(url);
    return `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodedPath}?alt=media`;
  }

  return url;
}

async function fixAllImageUrls() {
  console.log('Starting image URL fix...');
  console.log(`Storage bucket: ${storageBucket}`);

  try {
    // Get all products
    const productsSnapshot = await getDocs(collection(db, 'inventory'));
    const products = productsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log(`Found ${products.length} products to check`);

    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const product of products) {
      try {
        if (!product.imageUrl) {
          skippedCount++;
          continue;
        }

        const fixedUrl = fixImageUrl(product.imageUrl);
        
        if (fixedUrl && fixedUrl !== product.imageUrl) {
          await updateDoc(doc(db, 'inventory', product.id), {
            imageUrl: fixedUrl,
          });
          fixedCount++;
          console.log(`✓ Fixed: ${product.name?.substring(0, 40)}...`);
        } else {
          skippedCount++;
        }
      } catch (error) {
        errorCount++;
        console.error(`✗ Error fixing ${product.name}:`, error);
      }
    }

    console.log('\n=== Fix Complete ===');
    console.log(`Fixed: ${fixedCount}`);
    console.log(`Skipped (already correct): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total: ${products.length}`);
  } catch (error) {
    console.error('Error fixing image URLs:', error);
    process.exit(1);
  }
}

// Run the fix
fixAllImageUrls()
  .then(() => {
    console.log('\n✅ Image URL fix completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fix failed:', error);
    process.exit(1);
  });

