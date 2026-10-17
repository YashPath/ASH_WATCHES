import Link from 'next/link';
export const metadata = { title: 'Checkout cancelled' };
export default function Cancel() {
  return (
    <div className="container-x py-24 text-center">
      <h1 className="font-display text-4xl">Checkout cancelled</h1>
      <p className="mx-auto mt-5 max-w-md text-white/60">No payment was taken. Your order is held for a short time; you can resume payment from your orders page.</p>
      <Link href="/account" className="btn-gold mt-8">Go to my orders</Link>
    </div>
  );
}
