'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { offlineDB } from '@/lib/db';
import type { Product } from '@/types';
import { toast } from 'sonner';



export function useInventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
  console.log("DB VALUE:", db);
  console.log("USEEFFECT PROJECT ID:", db.app.options.projectId);
}, []);

// useEffect(() => {
//   if (!db) {
//     console.log("DB NOT READY");
//     return;
//   }

//   console.log("DB IS READY, ATTACHING SNAPSHOT");

//   const q = collection(db, 'inventory');

//   const unsubscribe = onSnapshot(q, (snapshot) => {
//     console.log("🔥 SNAPSHOT SIZE:", snapshot.size);
//     setProducts(snapshot.docs.map(doc => ({
//       id: doc.id,
//       ...doc.data()
//     })) as Product[]);
//     setLoading(false);
//   });

//   return () => unsubscribe();
// }, [db]);

  useEffect(() => {
    let unsubscribe: () => void;

    const fetchInventory = async () => {
      console.log("fetchinventory PROJECT ID:", db.app.options.projectId);
      // let cachedProducts: Product[] = [];
      try {
        // Try to load from IndexedDB first for instant render
        // const cachedProducts = await offlineDB.getAll<Product>('inventory');
        const cachedProducts: Product[] = [];
        console.log("CACHE LENGTH:", cachedProducts.length);
        // if (cachedProducts.length > 0) {
        //   setProducts(cachedProducts);
        //   setLoading(false);
        //   console.log('Database does not exist, using cached data')
        // }

        if (db) {
          console.log("if db PROJECT ID:", db.app.options.projectId);
          // Check if we can actually connect (sometimes onLine is true but no internet)
          // For now, we assume if the snapshot listener fails, we fall back.
          // const q = query(collection(db, 'inventory'), orderBy('name'));
          console.log('the db Database exists')
            const q = collection(db, 'inventory');
          unsubscribe = onSnapshot(
            q,
            (snapshot) => {
              console.log("🔥 SNAPSHOT SIZE:", snapshot.size);
              const newProducts = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              })) as Product[];

              setProducts(newProducts);
              setOffline(false);

              // Update offline cache
              newProducts.forEach((product) => {
                offlineDB.put('inventory', product);
              });
              setLoading(false);
              
            },
            (error) => {
              console.error('Firestore error, falling back to offline:', error);
              setOffline(true);
              setLoading(false);
              // If we haven't loaded cache yet (empty cache), try again
              if (products.length === 0) {
                offlineDB.getAll<Product>('inventory').then((cached) => {
                  setProducts(cached);
                });
              }
            }
          );
        } else {
          setOffline(true);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching inventory:', error);
        setOffline(true);
        setLoading(false);
      }
    };

    fetchInventory();

    // Handle online/offline events
    const handleOnline = () => {
      toast.success('You are back online. Syncing data...');
      fetchInventory();
    };
    const handleOffline = () => {
      setOffline(true);
      toast.warning('You are offline. Using cached data.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { products, loading, offline };
}




// export function useInventory() {
//   const [products, setProducts] = useState<Product[]>([]);
//   const [loading, setLoading] = useState(true);

//   // useEffect(() => {
//   //   console.log("ATTACHING SIMPLE SNAPSHOT");

//   //   const q = collection(db, "inventory");

//   //   const unsubscribe = onSnapshot(q, (snapshot) => {
//   //     console.log("🔥 SIMPLE SNAPSHOT SIZE:", snapshot.size);

//   //     const items = snapshot.docs.map(doc => ({
//   //       id: doc.id,
//   //       ...doc.data()
//   //     })) as Product[];

//   //     setProducts(items);
//   //     setLoading(false);
//   //   }, (error) => {
//   //     console.error("SNAPSHOT ERROR:", error);
//   //   });

//   //   return () => unsubscribe();
//   // }, []);
 

//   // useEffect(() => {
//   //   const fetch = async () => {
//   //     console.log("RUNNING GETDOCS TEST");
//   //     //console.log("DATABASE ID:", db._databaseId?.database);
  
//   //     try {
//   //       const snapshot = await getDocs(collection(db, "inventory"));
//   //       console.log("GETDOCS SIZE:", snapshot.size);
  
//   //       const items = snapshot.docs.map(doc => ({
//   //         id: doc.id,
//   //         ...doc.data(),
//   //       })) as Product[];
  
//   //       setProducts(items);
//   //       setLoading(false);
//   //     } catch (err) {
//   //       console.error("GETDOCS ERROR:", err);
//   //       setLoading(false);
//   //     }
//   //   };
  
//   //   fetch();
//   // }, []);

//   //for debugging single doc fetch
//   // useEffect(() => {
//   //   const testSingleDoc = async () => {
//   //     console.log("TESTING SINGLE DOC FETCH");
//   //     console.log(`dtabse: ${db}`);
  
//   //     const ref = doc(db, "inventory", "PROD-2bbenzyl_benzoate_2_-4");
//   //     const snap = await getDoc(ref);
  
//   //     console.log("EXISTS?", snap.exists());
  
//   //     if (snap.exists()) {
//   //       console.log("DATA:", snap.data());
//   //     } else {
//   //       console.log("DOCUMENT NOT FOUND");
//   //     }
//   //   };
  
//   //   testSingleDoc();
//   // }, []);
  
//   return { products, loading, offline: false };
// }