import type { Metadata } from 'next';
import { CONTACT_EMAIL } from '@/lib/policies';

export const metadata: Metadata = { title: 'Contact', description: 'Get in touch with the ASH_ team.' };

export default function ContactPage() {
  return (
    <div className="container-x max-w-3xl py-12">
      <h1 className="font-display text-4xl">Contact us</h1>
      <p className="mt-2 text-white/70">We reply within one business day.</p>
      <dl className="card mt-8 space-y-5 p-6 text-sm">
        <div><dt className="label">Email</dt><dd><a className="text-gold-300 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></dd></div>
        <div><dt className="label">Hours</dt><dd className="text-white/70">Monday to Saturday, 10:00 to 18:00 IST</dd></div>
        <div><dt className="label">Orders</dt><dd className="text-white/70">Include your order number (it starts with ASH-) so we can find it quickly.</dd></div>
      </dl>
    </div>
  );
}
