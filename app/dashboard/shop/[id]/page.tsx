import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { formatShopPrice, getShopProduct, shopCategories, shopCategoryLabel, shopStatusLabel } from "@/lib/shop-catalog";
import type { ShopProduct } from "@/lib/shop-catalog";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type ShopProductPageProps = {
  params: {
    id: string;
  };
};

const accentStyles = {
  teal: "border-court-teal/45 bg-court-mist text-court-teal",
  navy: "border-court-navy/20 bg-court-navy text-white",
  green: "border-emerald-300 bg-emerald-50 text-emerald-700",
  amber: "border-amber-300 bg-amber-50 text-amber-800",
  blue: "border-court-blue/30 bg-blue-50 text-court-blue"
} as const;

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words font-black text-court-navy">{value}</p>
    </div>
  );
}

function statusClass(product: ShopProduct) {
  switch (product.status) {
    case "available":
      return "ui-chip-success";
    case "limited":
      return "ui-chip-warning";
    case "coming_soon":
      return "ui-chip-brand";
    case "reserved":
      return "ui-chip-muted";
  }
}

export default async function ShopProductPage({ params }: ShopProductPageProps) {
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

  const product = getShopProduct(params.id);

  if (!product) {
    notFound();
  }

  const category = shopCategories.find((item) => item.slug === product.category);

  return (
    <PageShell eyebrow="Shop" subtitle="Catalogue item for club collection. No online checkout yet." title={product.name}>
      <div className="mb-5 flex flex-wrap gap-2">
        <Link className="btn-secondary px-3 py-2" href="/dashboard/shop">
          Back to Shop
        </Link>
        <Link className="btn-secondary px-3 py-2" href={`/dashboard/shop?category=${product.category}`}>
          {shopCategoryLabel(product.category)}
        </Link>
      </div>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className={`grid min-h-72 place-items-center rounded-lg border shadow-sm ${accentStyles[product.accent]}`}>
          <div className="p-8 text-center">
            <p className="text-xs font-black uppercase tracking-wide opacity-80">{shopCategoryLabel(product.category)}</p>
            <p className="mt-4 text-6xl font-black tracking-tight">{category?.icon ?? "SHOP"}</p>
            <p className="mt-4 text-sm font-bold opacity-80">Club collection item</p>
          </div>
        </div>

        <article className="surface-card p-5 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip ui-chip-brand">{shopCategoryLabel(product.category)}</span>
            <span className={`ui-chip ${statusClass(product)}`}>{shopStatusLabel(product.status)}</span>
          </div>
          <h2 className="mt-4 text-3xl font-black text-court-navy">{product.name}</h2>
          <p className="mt-3 text-2xl font-black text-court-teal">{formatShopPrice(product.priceCents)}</p>
          <p className="mt-4 text-sm leading-6 text-slate-700">{product.description}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <DetailRow label="Condition" value={product.condition ?? "Condition to be confirmed"} />
            <DetailRow label="Collect" value={product.collectionClub ?? "Collection club to be confirmed"} />
            <DetailRow label="Availability" value={shopStatusLabel(product.status)} />
            <DetailRow label="Seller / Source" value={product.source ?? "Source to be confirmed"} />
          </div>
        </article>
      </section>

      <section className="surface-card mt-5 p-5 sm:p-6" id="reserve">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="section-kicker">Reserve / Enquire</p>
            <h2 className="section-title mt-2">Reserve for club collection</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Shop V1 does not store reservations or take payment online yet. Ask the club desk to reserve this item and quote the item name.
            </p>
          </div>
          <div className="rounded-lg border border-court-teal/25 bg-court-mist p-4 text-sm font-bold leading-6 text-court-navy">
            Collection only. Payment and final availability are confirmed by the club.
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <DetailRow label="Item" value={product.name} />
          <DetailRow label="Price" value={formatShopPrice(product.priceCents)} />
          <DetailRow label="Club" value={product.collectionClub ?? "Collection club to be confirmed"} />
        </div>
        <div className="ui-empty-card mt-5">Online enquiry capture is coming later. For now, reserve this item with the club desk.</div>
      </section>
    </PageShell>
  );
}
