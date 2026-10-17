import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = { params: Promise<{ slug: string }>; children: ReactNode };

/** Per-product title and description for the browser tab and link previews. Falls back to the site default if the API is unreachable. */
export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  try {
    const { slug } = await params;
    const base = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
    const res = await fetch(`${base}/api/v1/products/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } });
    if (!res.ok) return {};
    const { data } = await res.json() as { data?: { name: string; shortDescription: string | null; brand: { name: string } } };
    if (!data) return {};
    return { title: `${data.name} by ${data.brand.name}`, description: data.shortDescription ?? undefined };
  } catch { return {}; }
}

export default function Layout({ children }: Props) { return children; }
