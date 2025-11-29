'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Notification } from '@/types';

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId || !db) {
      setLoading(false);
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    // Only query if we have a valid userId and db
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const fetchedNotifications = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Notification[];
          setNotifications(fetchedNotifications);
          setUnreadCount(fetchedNotifications.filter((n) => !n.read).length);
          setLoading(false);
        },
        (error) => {
          // Silently handle permission errors for unauthenticated users
          // Only log other errors
          if (error.code === 'permission-denied') {
            // Permission denied is expected when user is not authenticated
            // or rules haven't been deployed yet
            setLoading(false);
            setNotifications([]);
            setUnreadCount(0);
            return;
          }

          // Log other errors
          if (userId) {
            console.error('Error fetching notifications:', error);
          }
          setLoading(false);
          setNotifications([]);
          setUnreadCount(0);
        }
      );

      return () => unsubscribe();
    } catch (error) {
      console.error('Error setting up notifications query:', error);
      setLoading(false);
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [userId]);

  return { notifications, unreadCount, loading };
}
