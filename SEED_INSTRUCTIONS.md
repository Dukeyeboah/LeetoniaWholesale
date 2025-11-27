# Seeding Inventory Instructions

## Quick Setup

To import all drugs from `data/drug-list.json` into Firestore:

### Step 1: Temporarily Allow Writes

The seed script needs write access. Temporarily update your Firestore rules:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → **Firestore Database** → **Rules** tab
3. Temporarily replace the `inventory` section with:

```javascript
// Inventory collection - TEMPORARY RULES FOR SEEDING
match /inventory/{productId} {
  // Allow all reads and writes temporarily for seeding
  allow read, write: if true;
}
```

4. Click **Publish** to save the temporary rules

### Step 2: Run the Seed Script

```bash
pnpm seed
```

This will:

- Read all 2000+ drugs from `data/drug-list.json`
- Auto-categorize each drug based on its name
- Import them into Firestore with proper structure
- Show progress every 100 products

### Step 3: Restore Secure Rules

**IMPORTANT:** After seeding, immediately restore the secure rules:

1. Go back to Firestore Rules
2. Replace the temporary inventory rules with:

```javascript
// Inventory collection
match /inventory/{productId} {
  // Anyone authenticated can read inventory
  allow read: if isAuthenticated();

  // Only admins can create, update, or delete inventory
  allow create, update, delete: if isAdmin();
}
```

3. Click **Publish** to restore security

### Step 4: Verify

1. Check Firebase Console → Firestore → `inventory` collection
2. You should see thousands of products
3. Visit your app's inventory page - all drugs should be visible

## What Gets Imported

Each product includes:

- ✅ **Name** - From `Description` field
- ✅ **Code** - Product code
- ✅ **Price** - From `CSH` field
- ✅ **Category** - Auto-categorized using intelligent matching
- ✅ **Stock** - Generated based on price (or from `Stock` field if available)
- ✅ **Unit** - Extracted from product name
- ✅ **Expiry Date** - From `Expiry` field or generated
- ✅ **Image URL** - From `Image_Url` field (if available)
- ✅ **Sub Category** - From `Sub_Category` field (if available)

## Troubleshooting

### Permission Denied Errors

- Make sure you've temporarily allowed writes in Firestore rules
- Verify your `.env.local` has correct Firebase credentials
- Check that your Firebase project ID matches

### No Products Showing

- Verify the seed script completed successfully
- Check Firestore Console for the `inventory` collection
- Refresh your browser - the app uses real-time listeners
- Check browser console for any errors

### Categories Not Assigned

- The categorizer uses keyword matching
- Some products may default to "OTC (OVER-THE-COUNTER) PRODUCTS"
- You can update categories later via the admin dashboard
