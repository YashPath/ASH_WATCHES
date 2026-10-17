'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export type CartItem = { id: string; variantId: string; quantity: number; product: { id: string; name: string; slug: string; brand: string }; variant: { name: string; price: number; stockQuantity: number }; image: string | null; lineTotal: number };
export type Cart = { id: string; currency: string; items: CartItem[]; subtotal: number };

type CartState = { cart: Cart | null; count: number; loading: boolean; refresh(): Promise<void>; add(variantId: string, quantity?: number): Promise<void>; setQuantity(itemId: string, quantity: number): Promise<void>; remove(itemId: string): Promise<void> };
const Ctx = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setCart(null); return; }
    setLoading(true);
    try { setCart((await api<Cart>('/cart', { auth: true })).data); }
    catch { setCart({ id: '', currency: 'INR', items: [], subtotal: 0 }); } // API answers 404 until the first item is added
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<CartState>(() => ({
    cart, loading, refresh,
    count: cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0,
    async add(variantId, quantity = 1) { await api('/cart/items', { method: 'POST', auth: true, body: { variantId, quantity } }); await refresh(); },
    async setQuantity(itemId, quantity) { await api(`/cart/items/${itemId}`, { method: 'PATCH', auth: true, body: { quantity } }); await refresh(); },
    async remove(itemId) { await api(`/cart/items/${itemId}`, { method: 'DELETE', auth: true }); await refresh(); }
  }), [cart, loading, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useCart() { const ctx = useContext(Ctx); if (!ctx) throw new Error('useCart outside CartProvider'); return ctx; }
