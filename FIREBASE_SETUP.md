# Firebase Setup Guide

This guide will help you configure Firebase security rules and seed your inventory.

## 🔐 Security Rules Setup

### Firestore Rules

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** > **Rules**
4. Copy the contents of `firestore.rules` from this project
5. Paste it into the Firebase Console rules editor
6. Click **Publish**

### Storage Rules

1. In Firebase Console, navigate to **Storage** > **Rules**
2. Copy the contents of `storage.rules` from this project
3. Paste it into the Firebase Console rules editor
4. Click **Publish**

## 📦 Inventory Seeding

### Prerequisites

- Firebase project configured
- `.env.local` file with Firebase credentials
- Dependencies installed (`pnpm install`)
- **Firestore rules must allow writes** (see below)

### Option 1: Temporarily Allow Writes (Recommended for Seeding)

Before running the seed script, temporarily update your Firestore rules to allow writes:

```javascript
// Temporarily allow writes for seeding
match /inventory/{productId} {
  allow read, write: if true; // Remove this after seeding!
}
```

**Important**: After seeding, restore your security rules!

### Option 2: Use Admin Dashboard

1. Log in as admin
2. Go to Admin Dashboard > Manage Inventory
3. Click "Add Product" and enter products manually

### Run the Seed Script

```bash
pnpm seed
```

This will:

- Connect to your Firestore database
- Add all products from the inventory list
- Generate appropriate stock levels based on price
- Assign categories and units automatically
- Generate expiry dates (6-24 months from now)

### Manual Setup

If you prefer to seed manually or the script fails:

1. Go to Firestore Database in Firebase Console
2. Create a collection named `inventory`
3. Add documents with the following structure:

```json
{
  "id": "PROD-4571",
  "name": "10D GLUCOSE INF 500ML",
  "category": "Infusion",
  "price": 11.36,
  "stock": 500,
  "unit": "ml",
  "description": "10D GLUCOSE INF 500ML - Infusion",
  "code": "4571",
  "updatedAt": 1732500000000
}
```

## 🔑 Authentication Setup

### Enable Authentication Methods

1. Go to **Authentication** > **Sign-in method** in Firebase Console
2. Enable the following providers:
   - **Email/Password** ✓
   - **Google** ✓ (requires OAuth consent screen setup)
   - **Phone** ✓ (requires reCAPTCHA setup)

### Google Sign-In Setup

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Click on **Google**
3. Enable it and add your project's support email
4. Save

### Phone Authentication Setup

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Click on **Phone**
3. Enable it
4. The reCAPTCHA will be automatically configured

## 👤 Creating Admin Users

After a user signs up, you need to manually set their role to `admin` in Firestore:

1. Go to **Firestore Database** > **users** collection
2. Find the user document
3. Edit the document and set `role` field to `"admin"`
4. Save

Alternatively, you can use the Firebase Console to update the user's role.

## 📝 Security Rules Overview

### Firestore Rules

- **Users**: Can read their own profile, admins can read all
- **Inventory**: All authenticated users can read, only admins can write
- **Orders**: Users can read/create their own orders, admins can manage all
- **Logs**: Only admins can access

### Storage Rules

- **Product Images**: All authenticated users can read, only admins can write
- **User Avatars**: Users can manage their own, admins can manage all
- **Order Documents**: Users can read their own, only admins can write

## 🚨 Important Notes

1. **Never commit `.env.local`** - It's already in `.gitignore`
2. **Test rules in Firebase Console** - Use the Rules Playground
3. **Start with test mode** - Then gradually tighten rules
4. **Monitor Firestore usage** - Watch for unexpected reads/writes

## 🔍 Verifying Setup

After setup, verify:

1. ✅ Firestore rules are published
2. ✅ Storage rules are published
3. ✅ Authentication methods are enabled
4. ✅ Inventory is seeded (check Firestore `inventory` collection)
5. ✅ Admin user exists (check Firestore `users` collection with `role: "admin"`)

## 🆘 Troubleshooting

### Seed Script Fails

- Check `.env.local` has all required variables
- Verify Firebase project ID matches
- Ensure Firestore is enabled in your project
- Check that you have write permissions (rules allow admin)

### Authentication Not Working

- Verify authentication methods are enabled
- Check browser console for errors
- Ensure reCAPTCHA is not blocked by ad blockers
- Verify Firebase API keys are correct

### Rules Not Working

- Use Firebase Console Rules Playground to test
- Check for syntax errors in rules
- Verify user authentication status
- Check user role in Firestore
