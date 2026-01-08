/**
 * Show expected image filenames for all drugs
 * This helps you rename your image files to match what the script expects
 * 
 * Run with: pnpm tsx scripts/show-expected-filenames.ts
 */

import * as path from 'path';
import * as fs from 'fs';

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

/**
 * Sanitize drug name for use in Firebase Storage path
 * Removes special characters and replaces spaces with underscores
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

console.log('Expected Image Filenames (UPPERCASE format):\n');
console.log('='.repeat(80));
console.log('Drug Name'.padEnd(50) + 'Expected Filename');
console.log('='.repeat(80));

drugData.forEach((item, index) => {
  const drugName = item.Drug.trim();
  const expectedFilename = `${sanitizeFileName(drugName, true)}.jpg`;
  console.log(`${drugName.padEnd(50)}${expectedFilename}`);
});

console.log('\n' + '='.repeat(80));
console.log(`\nTotal: ${drugData.length} products`);
console.log('\n💡 Tip: Rename your image files to match these exact filenames (case-sensitive)');

