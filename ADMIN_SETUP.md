# Admin Setup Guide

## Setting Up Admin Users

### Method 1: Email Whitelist + Passkey (Recommended)

1. **Edit `lib/admin-config.ts`** and add admin emails with passkeys:

```typescript
export const ADMIN_WHITELIST: AdminConfig[] = [
  {
    email: 'admin@leetonia.com',
    passkey: 'ADMIN2024',
    name: 'Pharmacy Manager',
  },
  {
    email: 'manager@leetonia.com',
    passkey: 'MGR2024',
    name: 'Store Manager',
  },
];
```

2. **When an admin logs in:**
   - If their email is in the whitelist, they'll be prompted for their passkey
   - After entering the correct passkey, their role is updated to `admin` in Firestore
   - They gain access to admin features

### Method 2: Manual Firestore Update

1. Go to Firebase Console > Firestore Database
2. Navigate to `users` collection
3. Find the user document
4. Edit the document and set `role` field to `"admin"`
5. Save

## Admin Features

### View Toggle

Admins can switch between:

- **Admin View**: Access to admin dashboard, inventory management, order management
- **Client View**: Browse inventory, add to cart, place orders (like regular clients)

Toggle is available in the sidebar.

### Admin Dashboard

- View all orders
- Manage inventory (add, edit, delete products)
- Update order statuses
- Track stock levels

## Security Notes

- **Passkeys are stored in code** - For production, consider:

  - Moving to environment variables
  - Storing in Firestore (with proper security rules)
  - Using Firebase Custom Claims
  - Implementing a more robust authentication system

- **Admin emails are case-insensitive** - Matching is done by lowercase comparison

- **Passkeys are case-sensitive** - Must match exactly

## Firestore Index for Orders

The orders query requires a composite index. When you see the error:

1. Click the link provided in the error message
2. Or manually create in Firebase Console:
   - Go to Firestore > Indexes
   - Create composite index:
     - Collection: `orders`
     - Fields: `userId` (Ascending), `createdAt` (Descending)

## Inventory Fields

Products now include:

- `imageUrl` - URL for product image (can be empty)
- `expiryDate` - Unix timestamp for expiry date
- `code` - Product code from your inventory list

These fields are included in the seed script and can be edited in the admin dashboard.
