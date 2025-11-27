# Deploying Firestore and Storage Rules

Your local `firestore.rules` and `storage.rules` files are already configured correctly to allow unauthenticated users to browse inventory. However, you need to deploy these rules to Firebase.

## Option 1: Using Firebase CLI (Recommended)

1. **Install Firebase CLI** (if not already installed):

   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:

   ```bash
   firebase login
   ```

3. **Initialize Firebase in your project** (if not already done):

   ```bash
   firebase init firestore
   firebase init storage
   ```

   When prompted, select your Firebase project and use the existing `firestore.rules` and `storage.rules` files.

4. **Deploy the rules**:
   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only storage:rules
   ```

## Option 2: Using Firebase Console (Web UI)

1. **For Firestore Rules**:

   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Navigate to **Firestore Database** → **Rules** tab
   - Copy the contents of `firestore.rules` from your project
   - Paste into the rules editor
   - Click **Publish**

2. **For Storage Rules**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Navigate to **Storage** → **Rules** tab
   - Copy the contents of `storage.rules` from your project
   - Paste into the rules editor
   - Click **Publish**

## Verify the Rules

After deploying, your rules should allow:

- ✅ **Unauthenticated users** can read inventory (browse products)
- ✅ **Authenticated users** can read/write their own cart
- ✅ **Clients** can create orders
- ✅ **Admins** can manage inventory, orders, and users

## Current Rules Summary

### Firestore Rules:

- **Inventory**: `allow read: if true;` (anyone can browse)
- **Carts**: Users can read/write their own cart
- **Orders**: Users can read their own orders, create orders
- **Users**: Users can read/update their own profile

### Storage Rules:

- **Product Images**: `allow read: if true;` (anyone can view)
- **Avatars**: Authenticated users can read any avatar
- **Order Documents**: Users can read their own order documents
