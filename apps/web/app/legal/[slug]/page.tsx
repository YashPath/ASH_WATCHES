import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { POLICIES } from '@/lib/policies';

export function generateStaticParams() { return Object.keys(POLICIES).map(slug => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const policy = POLICIES[(await params).slug];
  return { title: policy?.title ?? 'Not found', description: policy?.intro };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const policy = POLICIES[(await params).slug];
  if (!policy) notFound();
  return (
    <article className="container-x max-w-3xl py-12">
      <h1 className="font-display text-4xl">{policy.title}</h1>
      <p className="mt-2 text-white/70">{policy.intro}</p>
      {policy.sections.map(s => (
        <section key={s.h} className="mt-8"><h2 className="font-display text-2xl">{s.h}</h2>{s.p.map(t => <p key={t} className="mt-2 leading-relaxed text-white/70">{t}</p>)}</section>
      ))}
      <p className="mt-10 text-sm text-white/60">Questions? <Link href="/contact" className="text-gold-300 underline">Contact us</Link>.</p>
    </article>
  );
}
