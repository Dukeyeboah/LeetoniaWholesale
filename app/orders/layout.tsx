import type React from "react"
import { AppSidebar } from "@/components/app-sidebar"

export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 md:ml-64 lg:ml-72 transition-all duration-300 ease-in-out">
        <div className="container max-w-6xl py-8 md:py-10 px-4 md:px-8 mt-12 md:mt-0">{children}</div>
      </main>
    </div>
  )
}
