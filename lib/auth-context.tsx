'use client';

import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { User } from '@/types';
import { useRouter } from 'next/navigation';
import { isAdminEmail } from '@/lib/admin-config';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  viewMode: 'admin' | 'client' | 'staff';
  setViewMode: (mode: 'admin' | 'client' | 'staff') => void;
  logout: () => Promise<void>;
  hasPermission: (permission: keyof import('@/types').StaffPermissions) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  isStaff: false,
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

  useEffect(() => {
    if (!auth || !db) {
      console.error(
        'Firebase not initialized. Please check your .env.local configuration.'
      );
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Try to fetch user profile from Firestore
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            // Update photoURL from Firebase Auth if available
            const updatedUser = {
              ...userData,
              photoURL: firebaseUser.photoURL || userData.photoURL,
            };
            setUser(updatedUser);
            // Set view mode based on role
            if (updatedUser.role === 'admin') {
              setViewMode('admin');
            } else if (updatedUser.role === 'staff') {
              setViewMode('staff');
            }
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
              photoURL: firebaseUser.photoURL || undefined,
              createdAt: Date.now(),
            };

            // Try to save to Firestore
            try {
              await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
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
    if (user?.role === 'admin') return true;
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
        isAdmin: user?.role === 'admin',
        isStaff: user?.role === 'staff',
        viewMode: user?.role === 'admin' ? viewMode : user?.role === 'staff' ? 'staff' : 'client',
        setViewMode: (mode) => {
          if (user?.role === 'admin') {
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
