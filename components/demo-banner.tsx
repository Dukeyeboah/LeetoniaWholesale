"use client"

import { useEffect, useState } from "react"
import { db } from "@/lib/firebase"

export function DemoBanner() {
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    if (!db) setIsDemo(true)
  }, [])

  if (!isDemo) return null

  return (
    <div className="bg-amber-100 text-amber-900 px-4 py-2 text-xs font-medium text-center border-b border-amber-200">
      Demo Mode: Firebase is not connected. Changes will not be saved to the cloud.
    </div>
  )
}
