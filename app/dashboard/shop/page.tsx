import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { CostIcon, LocationIcon, ShopIcon, StatusIcon, TagIcon } from "@/components/playr-icons";
import { formatShopPrice, shopCategories, shopCategoryLabel, shopProducts, shopStatusLabel } from "@/lib/shop-catalog";
import type { ShopCategorySlug, ShopProduct } from "@/lib/shop-catalog";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type ShopPageProps = {
  searchParams?: {
    category?: string;
  };
};

const accentStyles = {
  teal: "border-court-teal/45 bg-court-mist text-court-teal",
  navy: "border-court-navy/20 bg-court-navy text-white",
  green: "border-emerald-300 bg-emerald-50 text-emerald-700",
  amber: "border-amber-300 bg-amber-50 text-amber-800",
  blue: "border-court-blue/30 bg-blue-50 text-court-blue"
} as const;

function isShopCategory(value: string | undefined): value is ShopCategorySlug {
  return Boolean(value && shopCategories.some((category) => category.slug === value));
}

function ProductCard({ product }: { product: ShopProduct }) {
  const statusClass =
    product.status === "available"
      ? "ui-chip-success"
      : product.status === "limited"
        ? "ui-chip-warning"
        : product.status === "coming_soon"
          ? "ui-chip-brand"
          : "ui-chip-muted";

  return (
    <article className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-court-teal hover:shadow-court">
      <div className={`grid aspect-[4/2.2] place-items-center border-b ${accentStyles[product.accent]}`}>
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-wide opacity-80">{shopCategoryLabel(product.category)}</p>
          <div className="mt-2 flex justify-center">
            <ShopIcon size={34} />
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-chip ui-chip-muted">
            <TagIcon size={14} /> {shopCategoryLabel(product.category)}
          </span>
          <span className={`ui-chip ${statusClass}`}>
            <StatusIcon size={14} /> {shopStatusLabel(product.status)}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-black text-court-navy">{product.name}</h2>
        <div className="mt-3 grid gap-2 text-sm text-slate-600">
          <p className="flex items-center gap-2 font-black text-court-navy">
            <CostIcon size={16} /> {formatShopPrice(product.priceCents)}
          </p>
          {product.condition ? <p>Condition: {product.condition}</p> : null}
          <p className="flex items-center gap-2">
            <LocationIcon size={15} /> Collect: {product.collectionClub ?? "Collection club to be confirmed"}
          </p>
        </div>
        <Link className="btn-primary mt-4 w-full" href={`/dashboard/shop/${product.id}`}>
          View
        </Link>
      </div>
    </article>
  );
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Shop" title="Supabase is not configured.">
        <div className="ui-empty-card">Add Supabase environment variables to use the dashboard shop.</div>
      </PageShell>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeCategory = isShopCategory(searchParams?.category) ? searchParams.category : null;
  const products = activeCategory ? shopProducts.filter((product) => product.category === activeCategory) : shopProducts;

  return (
    <PageShell eyebrow="Shop" subtitle="Browse tennis gear, reserve interest, and collect at the club." title="PlayR Shop">
      <section className="mb-6 overflow-hidden rounded-lg border border-court-teal/30 bg-white shadow-court">
        <div className="h-2 bg-court-teal" />
        <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="section-kicker">Catalogue V1</p>
            <h2 className="mt-2 text-2xl font-black text-court-navy">Reserve for club collection</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Shop V1 is a catalogue and enquiry experience. Online checkout, delivery and payment processing are not enabled yet.
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-court-mist p-4 text-sm font-bold leading-6 text-court-navy">
            <LocationIcon className="mt-1" size={16} />
            <span>Collect at club. Pay and confirm directly with the club desk for now.</span>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="section-kicker">Categories</p>
            <h2 className="section-title mt-1">Browse gear</h2>
          </div>
          {activeCategory ? (
            <Link className="btn-secondary px-3 py-2" href="/dashboard/shop">
              Clear
            </Link>
          ) : null}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link className={`shrink-0 rounded border px-3 py-2 text-sm font-black ${activeCategory ? "border-slate-200 bg-white text-court-navy" : "border-court-teal bg-court-mist text-court-navy"}`} href="/dashboard/shop">
            All
          </Link>
          {shopCategories.map((category) => {
            const active = activeCategory === category.slug;
            return (
              <Link
                className={`shrink-0 rounded border px-3 py-2 text-sm font-black ${active ? "border-court-teal bg-court-mist text-court-navy" : "border-slate-200 bg-white text-court-navy"}`}
                href={`/dashboard/shop?category=${category.slug}`}
                key={category.slug}
              >
                <ShopIcon className="mr-2 text-court-teal" size={14} />
                {category.label}
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="section-kicker">{activeCategory ? shopCategoryLabel(activeCategory) : "All products"}</p>
          <h2 className="section-title mt-1">{products.length} catalogue items</h2>
        </div>
        {products.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2 className="section-title">No products yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">More club collection items will appear here as the catalogue grows.</p>
          </div>
        )}
      </section>
    </PageShell>
  );
}
