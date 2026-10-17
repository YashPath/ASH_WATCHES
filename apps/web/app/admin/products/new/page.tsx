'use client';
import Link from 'next/link';
import { ProductForm } from '@/components/admin/ProductForm';
import { useAuth } from '@/lib/auth';

export default function NewProduct() {
  const { user, loading } = useAuth();
  if (loading) return <div className="container-x py-16 text-white/50">Loading…</div>;
  if (!user || user.role === 'CUSTOMER') return <div className="container-x py-24 text-center"><p className="text-white/60">This area is for administrators.</p><Link href="/login?next=/admin/products/new" className="btn-gold mt-6">Sign in</Link></div>;
  return (
    <div className="container-x max-w-4xl py-10">
      <Link href="/admin" className="text-sm text-white/50 hover:text-gold-300">← Administration</Link>
      <h1 className="mt-3 font-display text-4xl">New product</h1>
      <p className="mt-1 text-sm text-white/60">Save the details first; you can add photos and variants on the next screen.</p>
      <div className="mt-6"><ProductForm /></div>
    </div>
  );
}
