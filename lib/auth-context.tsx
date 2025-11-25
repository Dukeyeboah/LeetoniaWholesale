"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import type { User } from "@/types"
import { useRouter } from "next/navigation"

interface AuthContextType {
  user: User | null
  loading: boolean
  isAdmin: boolean
  logout: () => Promise<void>
  // For demo purposes only
  demoLogin: (role: "admin" | "client") => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  logout: async () => {},
  demoLogin: () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Try to fetch user profile from Firestore
          const userDocRef = doc(db, "users", firebaseUser.uid)
          const userDoc = await getDoc(userDocRef)

          if (userDoc.exists()) {
            setUser(userDoc.data() as User)
          } else {
            // If no profile exists, create a basic one (fallback)
            const newUser: User = {
              id: firebaseUser.uid,
              email: firebaseUser.email || "",
              role: "client", // Default to client
              createdAt: Date.now(),
            }
            // In a real app, we might want to block this or handle registration separately
            // But for now, let's just set it in state.
            // Note: Writing to DB might fail if permissions aren't set up yet.
            setUser(newUser)
          }
        } catch (error) {
          console.error("Error fetching user profile:", error)
          // Fallback for when Firestore fails (e.g. missing permissions/rules)
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email || "",
            role: "client",
            createdAt: Date.now(),
          })
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const logout = async () => {
    await signOut(auth)
    setUser(null)
    router.push("/login")
  }

  // Demo login helper for preview environments without backend
  const demoLogin = (role: "admin" | "client") => {
    const demoUser: User = {
      id: "demo-" + role,
      email: `demo-${role}@pharmacy.com`,
      role: role,
      name: role === "admin" ? "Pharmacy Manager" : "Kwame Apothecary",
      createdAt: Date.now(),
    }
    setUser(demoUser)
    if (role === "admin") {
      router.push("/admin")
    } else {
      router.push("/inventory")
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === "admin",
        logout,
        demoLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
