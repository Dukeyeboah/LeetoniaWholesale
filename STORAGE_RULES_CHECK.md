# Firebase Storage Rules Check

## Current Issue: 403 Permission Denied

You're getting a 403 error when accessing images, which means the Storage security rules are blocking access.

## Step 1: Verify Storage Rules Are Deployed

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Navigate to **Storage** → **Rules** tab
3. Make sure your rules match the `storage.rules` file in your project
4. **Click "Publish"** to deploy the rules (even if they look correct)

## Step 2: Verify the Rules Content

Your Storage rules should include this section:

```javascript
// Inventory images (drug/product images)
match /inventoryImages/{allPaths=**} {
  // Anyone can read inventory images (authenticated or not) - for browsing
  allow read: if true;
  
  // Admins and staff with inventory management permission can upload/update/delete inventory images
  allow write: if isAdmin() || staffCanManageInventory();
}
```

## Step 3: Verify File Exists

1. Go to **Storage** → **Files** tab
2. Navigate to the `inventoryImages` folder
3. Verify the file `21ST_CENTURY_ASHWAGANDHA_60S.jpg` exists
4. Check the file path matches exactly (case-sensitive)

## Step 4: Test the URL Format

The URL format should be:
```
https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media
```

Where:
- `{bucket}` is your bucket name (e.g., `leetonia-43222`)
- `{encodedPath}` is the fully encoded path (e.g., `inventoryImages%2F21ST_CENTURY_ASHWAGANDHA_60S.jpg`)

## Step 5: Alternative - Use Firebase SDK to Get Download URL

If manual URLs don't work, you can use Firebase SDK's `getDownloadURL()` function which automatically handles the correct format. However, for static URLs in Firestore, the manual format should work once rules are correct.

## Common Issues

1. **Rules not deployed**: Make sure you clicked "Publish" in Firebase Console
2. **Bucket name mismatch**: Check your `.env.local` file - the `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` should match your actual bucket
3. **File doesn't exist**: Verify the file is actually uploaded to Storage
4. **Case sensitivity**: File names are case-sensitive in Firebase Storage

## Quick Fix

1. **Deploy Storage Rules:**
   - Go to Firebase Console → Storage → Rules
   - Copy the content from `storage.rules` in your project
   - Paste and click "Publish"

2. **Verify Bucket Name:**
   - Check your `.env.local` file
   - The bucket name should be just the project ID (e.g., `leetonia-43222`)
   - Not the full domain (e.g., not `leetonia-43222.firebasestorage.app`)

3. **Re-run the fix script:**
   ```bash
   pnpm fix-image-urls
   ```

This will regenerate URLs with the correct bucket name format.

