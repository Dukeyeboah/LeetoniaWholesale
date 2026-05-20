/**
 * Match Storage image filenames to products and update imageUrl (one product per file).
 * Recursively scans inventoryImages/ (including products/ subfolders).
 *
 *   pnpm match-images
 *
 * For a detailed report first: pnpm crosscheck-images
 * For apply with service account: pnpm crosscheck-images --apply
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import {
  getStorage,
  ref,
  listAll,
  getDownloadURL,
  type StorageReference,
} from 'firebase/storage';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import {
  assignBestImageMatches,
  normalizeImageBasename,
  type ImageFileEntry,
  type ProductEntry,
} from '../lib/product-image-match';

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

const MIN_SCORE = 0.82;

async function listImagesRecursive(
  storageRef: StorageReference
): Promise<ImageFileEntry[]> {
  const out: ImageFileEntry[] = [];
  const listing = await listAll(storageRef);
  for (const item of listing.items) {
    if (!/\.(jpe?g|png|webp|gif)$/i.test(item.name)) continue;
    out.push({
      filename: item.name,
      fullPath: item.fullPath,
      normalized: normalizeImageBasename(item.name),
    });
  }
  for (const prefix of listing.prefixes) {
    out.push(...(await listImagesRecursive(prefix)));
  }
  return out;
}

async function matchStorageFilesToProducts() {
  console.log('Matching Storage filenames to products (recursive)…\n');

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const storage = getStorage(app);

  const productsSnapshot = await getDocs(collection(db, 'inventory'));
  const products = productsSnapshot.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ProductEntry, 'id'>),
  })) as ProductEntry[];

  console.log(`Found ${products.length} products`);

  const files = await listImagesRecursive(ref(storage, 'inventoryImages'));
  console.log(`Found ${files.length} image files under inventoryImages/\n`);

  const visible = products.filter((p) => !p.isHidden);
  const { pairings, unpairedProducts, unpairedFiles } = assignBestImageMatches(
    visible,
    files,
    MIN_SCORE
  );

  console.log(`Matched ${pairings.length} visible products to image files`);
  console.log(
    `Unmatched products: ${unpairedProducts.length}, unmatched files: ${unpairedFiles.length}\n`
  );

  let updatedCount = 0;
  let errorCount = 0;

  for (const match of pairings) {
    try {
      const url = await getDownloadURL(ref(storage, match.fullPath));
      await updateDoc(doc(db, 'inventory', match.productId), {
        imageUrl: url,
        updatedAt: Date.now(),
      });
      updatedCount++;
      if (updatedCount % 25 === 0) {
        console.log(`✓ Updated ${updatedCount}…`);
      }
    } catch (error) {
      errorCount++;
      console.error(`✗ ${match.productName}:`, error);
    }
  }

  console.log('\n=== Complete ===');
  console.log(`Updated: ${updatedCount}`);
  console.log(`Errors: ${errorCount}`);
  if (unpairedFiles.length > 0) {
    console.log(`\nUnmatched files (first 15):`);
    unpairedFiles.slice(0, 15).forEach((f) => console.log(`  - ${f.fullPath}`));
  }
}

matchStorageFilesToProducts()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
