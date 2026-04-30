/**
 * Firestore rejects `undefined` anywhere in document data.
 * Strip those keys before setDoc / updateDoc / addDoc.
 */
export function omitUndefinedFields<T extends Record<string, unknown>>(
  data: T
): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}
