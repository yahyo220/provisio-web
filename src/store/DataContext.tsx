import type { ReactNode } from 'react'
import { createContext, useContext, useMemo, useState } from 'react'
import {
  customers as initialCustomers,
  deliveries as initialDeliveries,
  orders as initialOrders,
  products as initialProducts,
} from '../lib/data'
import type { CustomerRow, DeliveryRow, OrderRow, ProductRow } from '../lib/types'

interface DataContextValue {
  products: ProductRow[]
  toggleProductActive: (id: string) => void
  updateProduct: (id: string, patch: Partial<ProductRow>) => void
  addProduct: (product: ProductRow) => void
  removeProduct: (id: string) => void

  orders: OrderRow[]

  customers: CustomerRow[]
  addCustomer: (customer: CustomerRow) => void
  updateCustomer: (id: string, patch: Partial<CustomerRow>) => void

  deliveries: DeliveryRow[]
  assignDriver: (deliveryId: string, driver: string) => void
  updateDelivery: (id: string, patch: Partial<DeliveryRow>) => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts)
  const [orders] = useState<OrderRow[]>(initialOrders)
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers)
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>(initialDeliveries)

  const value = useMemo<DataContextValue>(
    () => ({
      products,
      toggleProductActive: (id) =>
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p))),
      updateProduct: (id, patch) =>
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p))),
      addProduct: (product) => setProducts((prev) => [product, ...prev]),
      removeProduct: (id) => setProducts((prev) => prev.filter((p) => p.id !== id)),

      orders,

      customers,
      addCustomer: (customer) => setCustomers((prev) => [customer, ...prev]),
      updateCustomer: (id, patch) =>
        setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))),

      deliveries,
      assignDriver: (deliveryId, driver) =>
        setDeliveries((prev) => prev.map((d) => (d.id === deliveryId ? { ...d, driver } : d))),
      updateDelivery: (id, patch) =>
        setDeliveries((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d))),
    }),
    [products, orders, customers, deliveries],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within a DataProvider')
  return ctx
}
