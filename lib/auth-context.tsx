'use client';

import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import type { User } from '@/types';
import { useRouter } from 'next/navigation';
import { isAdminEmail } from '@/lib/admin-config';
import { omitUndefinedFields } from '@/lib/firestore-sanitize';
import { inferSignInProvider } from '@/lib/auth-providers';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isStaff: boolean;
  /** Client (or staff) must complete pharmacy onboarding before shopping. */
  needsClientPharmacyProfile: boolean;
  refreshUser: () => Promise<void>;
  viewMode: 'admin' | 'client' | 'staff';
  setViewMode: (mode: 'admin' | 'client' | 'staff') => void;
  logout: () => Promise<void>;
  hasPermission: (permission: keyof import('@/types').StaffPermissions) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  isStaff: false,
  needsClientPharmacyProfile: false,
  refreshUser: async () => {},
  viewMode: 'client',
  setViewMode: () => {},
  logout: async () => {},
  hasPermission: () => false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'admin' | 'client' | 'staff'>('client');
  const router = useRouter();

  const refreshUser = async () => {
    if (!db || !auth?.currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        setUser({
          ...userData,
          photoURL: auth.currentUser.photoURL || userData.photoURL,
        });
      }
    } catch (e) {
      console.error('refreshUser', e);
    }
  };

  const needsClientPharmacyProfile = Boolean(
    user &&
      user.role === 'client' &&
      user.pharmacyProfileComplete !== true
  );

  useEffect(() => {
    if (!auth || !db) {
      console.error(
        'Firebase not initialized. Please check your .env.local configuration.'
      );
      setLoading(false);
      return;
    }

    const applyFirebaseUser = (
      firebaseUser: FirebaseUser,
      userData: User
    ) => {
      const updatedUser = {
        ...userData,
        photoURL: firebaseUser.photoURL || userData.photoURL,
      };
      setUser(updatedUser);
      if (updatedUser.role === 'admin' || updatedUser.role === 'super_admin') {
        setViewMode('admin');
      } else if (updatedUser.role === 'staff') {
        setViewMode('staff');
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Try to fetch user profile from Firestore
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            let userData = userDoc.data() as User;
            if (!userData.signInProvider) {
              const inferred = inferSignInProvider(firebaseUser);
              try {
                await updateDoc(userDocRef, { signInProvider: inferred });
                userData = { ...userData, signInProvider: inferred };
              } catch (e) {
                console.error('Backfill signInProvider failed', e);
              }
            }
            applyFirebaseUser(firebaseUser, userData);
          } else {
            // Check if email is in admin whitelist
            const email = firebaseUser.email || '';
            const shouldBeAdmin = isAdminEmail(email);

            // Create new user profile
            const newUser: User = {
              id: firebaseUser.uid,
              email: email,
              role: shouldBeAdmin ? 'admin' : 'client',
              name: firebaseUser.displayName || '',
              phone: firebaseUser.phoneNumber || '',
              signInProvider: inferSignInProvider(firebaseUser),
              ...(firebaseUser.photoURL ? { photoURL: firebaseUser.photoURL } : {}),
              createdAt: Date.now(),
            };

            // Try to save to Firestore
            try {
              await setDoc(
                doc(db, 'users', firebaseUser.uid),
                omitUndefinedFields(newUser as unknown as Record<string, unknown>)
              );
            } catch (error) {
              console.error('Error creating user profile:', error);
            }

            setUser(newUser);
            if (shouldBeAdmin) {
              setViewMode('admin');
            } else if (newUser.role === 'staff') {
              setViewMode('staff');
            }
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          // Fallback for when Firestore fails (e.g. missing permissions/rules)
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: 'client',
            createdAt: Date.now(),
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      if (auth) {
        await signOut(auth);
      }
      setUser(null);
      setViewMode('client');
      router.push('/');
    } catch (error) {
      console.error('Error during logout:', error);
      // Still clear local state even if Firebase signOut fails
      setUser(null);
      setViewMode('client');
      router.push('/');
    }
  };

  const hasPermission = (permission: keyof import('@/types').StaffPermissions): boolean => {
    if (user?.role === 'admin' || user?.role === 'super_admin') return true;
    if (user?.role === 'staff' && user.permissions) {
      return user.permissions[permission] === true;
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
        isSuperAdmin: user?.role === 'super_admin',
        isStaff: user?.role === 'staff',
        needsClientPharmacyProfile,
        refreshUser,
        viewMode:
          user?.role === 'admin' || user?.role === 'super_admin'
            ? viewMode
            : user?.role === 'staff'
              ? 'staff'
              : 'client',
        setViewMode: (mode) => {
          if (user?.role === 'admin' || user?.role === 'super_admin') {
            setViewMode(mode);
            // Navigate to appropriate page when switching views
            if (mode === 'admin') {
              router.push('/admin');
            } else {
              router.push('/inventory');
            }
          }
        },
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
