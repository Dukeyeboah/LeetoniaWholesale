export const SALES_ANALYTICS_ROLES = ['admin', 'super_admin'] as const;

export function isAuthorizedAdminRole(role: unknown): boolean {
  return (
    typeof role === 'string' &&
    (SALES_ANALYTICS_ROLES as readonly string[]).includes(role)
  );
}

export type AdminAuthDeps = {
  verifyIdToken: (token: string) => Promise<{ uid: string }>;
  getUserRole: (uid: string) => Promise<string | null>;
};

export type AdminAuthResult =
  | { ok: true; uid: string }
  | { ok: false; status: 401 | 403; error: string };

/** Checks the Firebase ID token in `Authorization: Bearer …` and the user's admin role. */
export async function authorizeAdminRequest(
  req: Request,
  deps: AdminAuthDeps
): Promise<AdminAuthResult> {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return { ok: false, status: 401, error: 'Please sign in again.' };

  let uid: string;
  try {
    ({ uid } = await deps.verifyIdToken(match[1]));
  } catch {
    return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' };
  }

  let role: string | null = null;
  try {
    role = await deps.getUserRole(uid);
  } catch {
    role = null;
  }
  if (!isAuthorizedAdminRole(role)) {
    return { ok: false, status: 403, error: 'Only administrators can use this feature.' };
  }
  return { ok: true, uid };
}
