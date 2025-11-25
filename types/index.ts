export interface User {
  id: string
  email: string
  role: "admin" | "client"
  name?: string
  phone?: string
  createdAt: number
}

export interface Product {
  id: string
  name: string
  category: string
  price: number
  stock: number
  unit: string
  description?: string
  imageUrl?: string
  updatedAt: number
}

export interface CartItem extends Product {
  quantity: number
}

export interface Order {
  id: string
  userId: string
  items: CartItem[]
  status: "pending" | "checking_stock" | "pharmacy_confirmed" | "customer_confirmed" | "completed" | "cancelled"
  total: number
  createdAt: number
  updatedAt: number
}

export interface Log {
  id: string
  action: string
  userId: string
  details: string
  timestamp: number
}
