/**
 * Admin Configuration
 *
 * Add admin emails here. These users will be able to access admin features
 * after providing their passkey.
 */

export interface AdminConfig {
  email: string;
  passkey: string;
  name?: string;
}

// Admin email whitelist with passkeys
// In production, consider storing this in Firestore or environment variables
export const ADMIN_WHITELIST: AdminConfig[] = [
  { email: 'dkyeboah1@gmail.com', passkey: 'M@trix', name: 'Duke Yeboah' },
  {
    email: 'judithbanquist@gmail.com',
    passkey: '3mpre$$',
    name: 'Nana Afrakuma',
  },

  // Add your admin emails and passkeys here
  // Example:
  // { email: "admin@leetonia.com", passkey: "ADMIN2024", name: "Pharmacy Manager" },
  // { email: "manager@leetonia.com", passkey: "MGR2024", name: "Store Manager" },
];

/**
 * Check if an email is in the admin whitelist
 */
export function isAdminEmail(email: string): boolean {
  return ADMIN_WHITELIST.some(
    (admin) => admin.email.toLowerCase() === email.toLowerCase()
  );
}

/**
 * Verify admin passkey for an email
 */
export function verifyAdminPasskey(email: string, passkey: string): boolean {
  const admin = ADMIN_WHITELIST.find(
    (a) =>
      a.email.toLowerCase() === email.toLowerCase() && a.passkey === passkey
  );
  return !!admin;
}

/**
 * Get admin config by email
 */
export function getAdminConfig(email: string): AdminConfig | undefined {
  return ADMIN_WHITELIST.find(
    (a) => a.email.toLowerCase() === email.toLowerCase()
  );
}
