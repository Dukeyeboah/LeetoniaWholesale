"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Package, ShoppingCart, ClipboardList, LayoutDashboard, LogOut, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth-context"

export function AppSidebar() {
  const pathname = usePathname()
  const { user, logout, isAdmin } = useAuth()

  const routes = [
    {
      name: "Inventory",
      path: "/inventory",
      icon: Package,
      show: true,
    },
    {
      name: "My Cart",
      path: "/cart",
      icon: ShoppingCart,
      show: !isAdmin,
    },
    {
      name: "My Orders",
      path: "/orders",
      icon: ClipboardList,
      show: !isAdmin,
    },
    {
      name: "Admin Dashboard",
      path: "/admin",
      icon: LayoutDashboard,
      show: isAdmin,
    },
  ]

  const NavContent = () => (
    <div className="flex h-full flex-col gap-4">
      <div className="flex h-16 items-center border-b px-6">
        <Package className="mr-2 h-6 w-6 text-primary" />
        <span className="text-lg font-serif font-bold text-primary">PharmaWholesale</span>
      </div>
      <div className="flex-1 px-4 py-4">
        <nav className="grid gap-2">
          {routes
            .filter((r) => r.show)
            .map((route) => {
              const isActive = pathname === route.path
              return (
                <Link
                  key={route.path}
                  href={route.path}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                  ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <route.icon className="h-4 w-4" />
                  {route.name}
                </Link>
              )
            })}
        </nav>
      </div>
      <div className="border-t p-4">
        <div className="mb-4 flex items-center gap-3 px-2">
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-primary font-bold">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="overflow-hidden">
            <p className="truncate text-sm font-medium">{user?.name || "User"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 bg-transparent"
          onClick={() => logout()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log Out
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden border-r bg-sidebar md:block md:w-64 lg:w-72 fixed inset-y-0 z-30">
        <NavContent />
      </div>

      {/* Mobile Sheet */}
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden fixed top-4 left-4 z-40 bg-background/80 backdrop-blur border shadow-sm"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72">
          <NavContent />
        </SheetContent>
      </Sheet>
    </>
  )
}
