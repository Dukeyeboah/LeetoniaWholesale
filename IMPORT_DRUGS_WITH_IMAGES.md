# Import Drugs with Images

This guide explains how to import your drug inventory with images from Firebase Storage.

## Overview

The import script converts your drug list JSON into Firestore products with:
- ✅ Drug names, quantities, and expiry dates
- ✅ Auto-categorized products
- ✅ Image URLs pointing to Firebase Storage
- ✅ Generated product codes and units

## Step 1: Prepare Your Drug Data

Your drug data is stored in `data/drugs-inventory.json`. The format is:

```json
[
  {
    "Drug": "COX B-200(CELECOXIB) 10'S",
    "Quantity": 3,
    "Expiry": "12-Mar-27"
  },
  ...
]
```

**To add more drugs:** Simply add new entries to this JSON file.

## Step 2: Upload Images to Firebase Storage

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Navigate to **Storage**
3. Create a folder called `inventoryImages` (if it doesn't exist)
4. Upload your product images to this folder

### Image Naming Convention

Images should be named using the **sanitized version** of the drug name:

**Example:**
- Drug Name: `"COX B-200(CELECOXIB) 10'S"`
- Image Name: `cox_b_200_celecoxib_10s.jpg`

**Naming Rules:**
- All special characters are removed: `()`, `-`, `/`, `%`, etc.
- Spaces are replaced with underscores: `_`
- Everything is lowercase
- Default extension is `.jpg` (but `.png`, `.jpeg`, `.webp` also work)

**Quick Reference:**
- `"10D GLUCOSE INF 500ML"` → `10d_glucose_inf_500ml.jpg`
- `"ABONIKI"` → `aboniki.jpg`
- `"ACICLOVIR CREAM-PHARMANOVA"` → `aciclovir_cream_pharmanova.jpg`
- `"ADOM W&G CAPSULES"` → `adom_wg_capsules.jpg`

**Tip:** The import script will show you the sanitized name for each drug, so you can verify your image names match.

## Step 3: Temporarily Allow Writes (For Import) ⚠️ IMPORTANT

**You MUST do this before running the import script!**

Before running the import, temporarily update your Firestore rules:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Navigate to **Firestore Database** → **Rules** tab
3. Find the inventory section (around line 45-52)
4. **Temporarily replace** the inventory rules with:

```javascript
// Inventory collection - TEMPORARY RULES FOR IMPORT
// ⚠️ REMOVE THIS AFTER IMPORT AND RESTORE SECURE RULES!
match /inventory/{productId} {
  // Anyone can read inventory (including unauthenticated users for browsing)
  allow read: if true;
  
  // Temporarily allow writes for import script
  allow create, update, delete: if true;
}
```

5. Click **Publish** to save the temporary rules
6. **Run your import script now**
7. **IMMEDIATELY restore the secure rules** after import completes (see Step 5)

## Step 4: Run the Import Script

```bash
pnpm import-drugs
```

This will:
- Read all drugs from `data/drugs-inventory.json`
- Auto-categorize each drug
- Generate image URLs based on drug names
- Import all products into Firestore
- Show progress every 10 products

## Step 5: Restore Secure Rules

**IMPORTANT:** After importing, restore your secure Firestore rules:

```javascript
match /inventory/{productId} {
  allow read: if true;
  allow create, update, delete: if isAdmin() || staffHasPermission('canManageInventory');
}
```

## Step 6: Verify

1. Check Firebase Console → Firestore → `inventory` collection
2. Verify products have `imageUrl` fields
3. Visit your app's inventory page
4. Product cards should display images from Firebase Storage

## Image URL Format

The script generates Firebase Storage URLs in this format:

```
https://firebasestorage.googleapis.com/v0/b/{bucket}/o/inventoryImages%2F{drug_name}.jpg?alt=media
```

## Troubleshooting

### Images Not Showing

1. **Check image names match:** The sanitized drug name must exactly match the image filename (case-insensitive, but extension must match)
2. **Verify Storage rules:** Make sure Storage rules allow public reads:
   ```javascript
   match /inventoryImages/{allPaths=**} {
     allow read: if true;
   }
   ```
3. **Check image exists:** Verify the image is actually uploaded to `inventoryImages/` folder in Storage

### Import Errors

- **Permission errors:** Make sure you temporarily allowed writes in Firestore rules
- **Missing .env.local:** Ensure your Firebase credentials are configured
- **Invalid expiry dates:** Check that expiry dates are in format "DD-MMM-YY"

## Adding More Drugs

1. Add new entries to `data/drugs-inventory.json`
2. Upload corresponding images to Firebase Storage with matching names
3. Run `pnpm import-drugs` again (it will update existing products or add new ones)

## Default Prices

The script generates default prices based on category:
- Antibiotics: ₵25.00
- Painkillers: ₵15.00
- Cardiovascular: ₵30.00
- Vitamins: ₵20.00
- etc.

You can update prices manually in the admin dashboard after import.

## Next Steps

After importing:
1. Review products in the admin dashboard
2. Update prices as needed
3. Verify all images are displaying correctly
4. Add any missing product details (descriptions, etc.)

