import { Suspense } from 'react';
import { ShopClient } from './ShopClient';
export const metadata = { title: 'Shop' };
export default function ShopPage() { return <Suspense fallback={<div className="container-x py-16 text-white/50">Loading…</div>}><ShopClient /></Suspense>; }
