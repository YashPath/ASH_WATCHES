import Link from 'next/link';
export const metadata = { title: 'Order received' };
export default function Success() {
  return (
    <div className="container-x py-24 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-500">Thank you</p>
      <h1 className="mt-3 font-display text-5xl">Payment received</h1>
      <p className="mx-auto mt-5 max-w-md text-white/60">Your order is being confirmed. This usually takes a few seconds; the status updates on your orders page once the payment is verified.</p>
      <Link href="/account" className="btn-gold mt-8">View my orders</Link>
    </div>
  );
}
