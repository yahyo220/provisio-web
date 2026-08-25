import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

interface AuthState {
  /** True once we've checked for an existing session (avoids a login-page flash). */
  ready: boolean
  session: Session | null
  /** True once we've confirmed the signed-in user is in admin_users. */
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return
    }
    const client = supabase

    client.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) setIsAdmin(await checkAdmin())
      setReady(true)
    })

    const { data: sub } = client.auth.onAuthStateChange(async (_event, next) => {
      setSession(next)
      setIsAdmin(next ? await checkAdmin() : false)
    })

    async function checkAdmin() {
      const { data, error } = await client.rpc('is_admin')
      if (error) {
        console.error(error)
        return false
      }
      return Boolean(data)
    }

    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    if (!supabase) return 'Supabase is not configured.'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  return <AuthContext.Provider value={{ ready, session, isAdmin, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
