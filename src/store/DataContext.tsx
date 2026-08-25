import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  assignDriverToDelivery,
  createCourierAccount,
  deleteOrderRow,
  deleteProductRow,
  fetchAll,
  insertCustomer,
  insertProduct,
  updateCustomerRow,
  updateDeliveryRow,
  updateOrderStatus as updateOrderStatusRow,
  updateProductRow,
} from '../lib/api'
import {
  customers as mockCustomers,
  deliveries as mockDeliveries,
  drivers as mockDrivers,
  orders as mockOrders,
  products as mockProducts,
} from '../lib/data'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import type { CustomerRow, CustomerStatus, DeliveryRow, DriverRow, OrderRow, OrderStatus, ProductRow, StockStatus } from '../lib/types'

export interface NewProductInput {
  name: string
  sku: string
  category: string
  price: number
  priceExternal?: number | null
  unit: string
  units?: string[]
  stock: StockStatus
  active: boolean
  imageUrl?: string
}

export interface NewCustomerInput {
  name: string
  type: string
  contact: string
  location: string
}

interface DataContextValue {
  /** True once VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY are set — false falls back to local-only demo state. */
  connected: boolean
  loading: boolean

  products: ProductRow[]
  toggleProductActive: (id: string) => Promise<void>
  updateProduct: (id: string, patch: Partial<ProductRow>) => Promise<void>
  addProduct: (input: NewProductInput) => Promise<void>
  removeProduct: (id: string) => Promise<void>

  orders: OrderRow[]
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>
  removeOrder: (id: string) => Promise<void>

  customers: CustomerRow[]
  addCustomer: (input: NewCustomerInput) => Promise<void>
  updateCustomer: (id: string, patch: Partial<CustomerRow>) => Promise<void>

  deliveries: DeliveryRow[]
  drivers: string[]
  driverRows: DriverRow[]
  assignDriver: (deliveryId: string, driver: string) => Promise<void>
  updateDelivery: (id: string, patch: Partial<DeliveryRow>) => Promise<void>
  addCourier: (input: { name: string; phone: string; email: string; password: string }) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const connected = Boolean(supabase)

  const [products, setProducts] = useState<ProductRow[]>(connected ? [] : mockProducts)
  const [orders, setOrders] = useState<OrderRow[]>(connected ? [] : mockOrders)
  const [customers, setCustomers] = useState<CustomerRow[]>(connected ? [] : mockCustomers)
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>(connected ? [] : mockDeliveries)
  const [drivers, setDrivers] = useState<string[]>(connected ? [] : mockDrivers)
  const [driverRows, setDriverRows] = useState<DriverRow[]>([])
  const [loading, setLoading] = useState(connected)

  const refresh = useCallback(async () => {
    if (!connected) return
    const data = await fetchAll()
    setProducts(data.products)
    setOrders(data.orders)
    setCustomers(data.customers)
    setDeliveries(data.deliveries)
    setDrivers(data.drivers)
    setDriverRows(data.driverRows)
    setLoading(false)
  }, [connected])

  useEffect(() => {
    if (!connected || !supabase) return
    refresh().catch((err) => {
      console.error('Failed to load data from Supabase', err)
      setLoading(false)
    })

    // Any change on any of these tables (from this tab, another tab, or the
    // mobile app) refetches everything — simple, and plenty fast at this scale.
    const client = supabase
    const channel = client
      .channel('provisio-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => refresh())
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [connected, refresh])

  const value = useMemo<DataContextValue>(
    () => ({
      connected,
      loading,

      products,
      toggleProductActive: async (id) => {
        if (!connected) {
          setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p)))
          return
        }
        const product = products.find((p) => p.id === id)
        if (!product) return
        await updateProductRow(id, { active: !product.active })
        await refresh()
      },
      updateProduct: async (id, patch) => {
        if (!connected) {
          setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
          return
        }
        await updateProductRow(id, patch)
        await refresh()
      },
      addProduct: async (input) => {
        if (!connected) {
          setProducts((prev) => [
            {
              id: input.sku,
              name: input.name,
              sku: input.sku,
              category: input.category,
              price: formatMoney(input.price),
              priceExternal: '',
              unit: input.unit,
              units: input.units ?? [],
              stock: input.stock,
              active: input.active,
              updated: 'Just now',
              image: input.imageUrl ?? '',
            },
            ...prev,
          ])
          return
        }
        await insertProduct(input)
        await refresh()
      },
      removeProduct: async (id) => {
        if (!connected) {
          setProducts((prev) => prev.filter((p) => p.id !== id))
          return
        }
        await deleteProductRow(id)
        await refresh()
      },

      orders,
      updateOrderStatus: async (id, status) => {
        if (!connected) {
          setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
          return
        }
        await updateOrderStatusRow(id, status)
        await refresh()
      },
      removeOrder: async (id) => {
        if (!connected) {
          setOrders((prev) => prev.filter((o) => o.id !== id))
          return
        }
        await deleteOrderRow(id)
        await refresh()
      },

      customers,
      addCustomer: async (input) => {
        if (!connected) {
          setCustomers((prev) => [
            {
              id: `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
              name: input.name,
              type: input.type,
              contact: input.contact,
              phone: '',
              email: '',
              location: input.location,
              orders: 0,
              spent: '$0.00',
              status: 'active' as CustomerStatus,
              initials: input.name.slice(0, 2).toUpperCase(),
              approvalStatus: 'approved',
              priceTier: 'with_price',
              hasLogin: false,
            },
            ...prev,
          ])
          return
        }
        await insertCustomer(input)
        await refresh()
      },
      updateCustomer: async (id, patch) => {
        if (!connected) {
          setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
          return
        }
        await updateCustomerRow(id, patch)
        await refresh()
      },

      deliveries,
      drivers,
      driverRows,
      addCourier: async (input) => {
        if (!connected) return
        await createCourierAccount(input)
        await refresh()
      },
      assignDriver: async (deliveryId, driver) => {
        if (!connected) {
          setDeliveries((prev) => prev.map((d) => (d.id === deliveryId ? { ...d, driver } : d)))
          return
        }
        await assignDriverToDelivery(deliveryId, driver)
        await refresh()
      },
      updateDelivery: async (id, patch) => {
        if (!connected) {
          setDeliveries((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
          return
        }
        await updateDeliveryRow(id, patch)
        await refresh()
      },
    }),
    [connected, loading, products, orders, customers, deliveries, drivers, driverRows, refresh],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within a DataProvider')
  return ctx
}
