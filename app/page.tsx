import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Package } from "lucide-react"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="bg-card p-8 md:p-12 rounded-xl shadow-sm border border-border max-w-md w-full space-y-8">
        <div className="flex justify-center">
          <div className="bg-primary/10 p-4 rounded-full">
            <Package className="h-10 w-10 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-serif text-foreground">Leetonia Wholesale</h1>
          <p className="text-muted-foreground">Accra's premier wholesale pharmacy ordering system.</p>
        </div>
        <div className="space-y-4">
          <Link href="/login" className="block">
            <Button className="w-full h-12 text-base" size="lg">
              Sign In to Order
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground">New client? Contact administration to register.</p>
        </div>
      </div>
    </div>
  )
}
