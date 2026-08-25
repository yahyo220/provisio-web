import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import AddCustomer from './pages/AddCustomer'
import AddProduct from './pages/AddProduct'
import Analytics from './pages/Analytics'
import Couriers from './pages/Couriers'
import CustomerDetail from './pages/CustomerDetail'
import Customers from './pages/Customers'
import Dashboard from './pages/Dashboard'
import DeliveryDetail from './pages/DeliveryDetail'
import Deliveries from './pages/Deliveries'
import Login from './pages/Login'
import OrderDetail from './pages/OrderDetail'
import Orders from './pages/Orders'
import ProductDetail from './pages/ProductDetail'
import Products from './pages/Products'
import Support from './pages/Support'
import { isSupabaseConfigured } from './lib/supabase'
import { DataProvider } from './store/DataContext'
import { useAuth } from './store/AuthContext'

function App() {
  const { ready, session, isAdmin } = useAuth()

  // No backend configured at all (local dev without env vars) — behave like
  // before, no login wall, so the static design still works standalone.
  if (!isSupabaseConfigured) return <DashboardRoutes />

  if (!ready) return null

  if (!session) return <Login />

  if (!isAdmin) return <Login deniedMessage="Этот аккаунт не привязан к панели администратора." />

  return (
    <DataProvider>
      <DashboardRoutes />
    </DataProvider>
  )
}

function DashboardRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:orderId" element={<OrderDetail />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/new" element={<AddProduct />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/new" element={<AddCustomer />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/deliveries" element={<Deliveries />} />
        <Route path="/deliveries/:id" element={<DeliveryDetail />} />
        <Route path="/couriers" element={<Couriers />} />
        <Route path="/support" element={<Support />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
