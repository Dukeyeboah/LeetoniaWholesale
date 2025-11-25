// Simple Promise wrapper for IndexedDB
const DB_NAME = "PharmacyOfflineDB"
const DB_VERSION = 1
const STORES = ["inventory", "orders", "cart", "sync_queue"]

export class OfflineDB {
  private db: IDBDatabase | null = null

  constructor() {}

  async init(): Promise<void> {
    if (this.db) return
    if (typeof window === "undefined") return // SSR check

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = (event) => reject("IndexedDB error: " + (event.target as any).error)

      request.onsuccess = (event) => {
        this.db = (event.target as any).result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as any).result
        STORES.forEach((store) => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: "id" })
          }
        })
      }
    })
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    await this.init()
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not initialized")
      const transaction = this.db.transaction(storeName, "readonly")
      const store = transaction.objectStore(storeName)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async put<T>(storeName: string, value: T): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not initialized")
      const transaction = this.db.transaction(storeName, "readwrite")
      const store = transaction.objectStore(storeName)
      const request = store.put(value)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async get<T>(storeName: string, id: string): Promise<T | undefined> {
    await this.init()
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not initialized")
      const transaction = this.db.transaction(storeName, "readonly")
      const store = transaction.objectStore(storeName)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async clear(storeName: string): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not initialized")
      const transaction = this.db.transaction(storeName, "readwrite")
      const store = transaction.objectStore(storeName)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

export const offlineDB = new OfflineDB()
