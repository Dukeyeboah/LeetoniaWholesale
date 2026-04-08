"use client"

import type React from "react"

import { AuthProvider } from "@/lib/auth-context"
import { Toaster } from "@/components/ui/sonner"
import { DemoBanner } from "@/components/demo-banner"
import { PharmacyProfileGate } from "@/components/pharmacy-profile-gate"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DemoBanner />
      <PharmacyProfileGate>{children}</PharmacyProfileGate>
      <Toaster />
    </AuthProvider>
  )
}
