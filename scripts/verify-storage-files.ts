/**
 * Verify what files actually exist in Firebase Storage
 * This helps debug filename mismatches
 * 
 * Run with: pnpm tsx scripts/verify-storage-files.ts
 */

import { initializeApp } from 'firebase/app';
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
const storage = getStorage(app);

async function verifyStorageFiles() {
  console.log('Checking files in Firebase Storage...\n');

  try {
    const storageRef = ref(storage, 'inventoryImages');
    const fileList = await listAll(storageRef);
    
    console.log(`Found ${fileList.items.length} files in inventoryImages folder\n`);
    console.log('='.repeat(100));
    console.log('Filename'.padEnd(60) + 'Full Path'.padEnd(40));
    console.log('='.repeat(100));

    for (const item of fileList.items) {
      const filename = item.name;
      const fullPath = item.fullPath;
      
      // Try to get download URL to verify it's accessible
      try {
        const url = await getDownloadURL(item);
        console.log(`${filename.padEnd(60)}${fullPath.padEnd(40)} ✓`);
      } catch (error: any) {
        console.log(`${filename.padEnd(60)}${fullPath.padEnd(40)} ✗ (Error: ${error.message})`);
      }
    }

    console.log('\n' + '='.repeat(100));
    console.log(`\nTotal files: ${fileList.items.length}`);
    console.log('\n💡 Use these exact filenames when matching to products');
  } catch (error) {
    console.error('Error listing files:', error);
    process.exit(1);
  }
}

verifyStorageFiles()
  .then(() => {
    console.log('\n✅ Verification complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });

