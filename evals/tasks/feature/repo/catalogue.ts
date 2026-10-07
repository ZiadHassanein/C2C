// Frozen fictional repository evidence. Not a runnable application.
type Listing = { id: string; make: string; priceCents: number; status: 'draft' | 'published' | 'sold' };
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

// Public route currently returns published listings only. Old clients pass page.
export async function getCatalogue(db: any, query: Record<string, string>) {
  const page = Number(query.page ?? '1');
  return db.listings.findMany({
    where: { status: 'published' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE,
  });
}

// Admin creation stores minor units. The public UI shows dollars.
export function displayPrice(row: Listing) { return (row.priceCents / 100).toFixed(2); }
