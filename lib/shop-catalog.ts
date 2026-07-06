export type ShopCategorySlug = "rackets" | "balls" | "shoes" | "grips" | "strings" | "bags" | "club-kit" | "junior-starter-packs" | "second-hand";

export type ShopProductStatus = "available" | "limited" | "reserved" | "coming_soon";

export type ShopProduct = {
  id: string;
  name: string;
  category: ShopCategorySlug;
  description: string;
  priceCents: number | null;
  condition: string | null;
  collectionClub: string | null;
  status: ShopProductStatus;
  source: string | null;
  accent: "teal" | "navy" | "green" | "amber" | "blue";
};

export const shopCategories: Array<{ slug: ShopCategorySlug; label: string; icon: string }> = [
  { slug: "rackets", label: "Rackets", icon: "RKT" },
  { slug: "balls", label: "Balls", icon: "BALL" },
  { slug: "shoes", label: "Shoes", icon: "SHOE" },
  { slug: "grips", label: "Grips", icon: "GRIP" },
  { slug: "strings", label: "Strings", icon: "STR" },
  { slug: "bags", label: "Bags", icon: "BAG" },
  { slug: "club-kit", label: "Club Kit", icon: "KIT" },
  { slug: "junior-starter-packs", label: "Junior Starter Packs", icon: "JR" },
  { slug: "second-hand", label: "Second-hand", icon: "2H" }
];

export const shopProducts: ShopProduct[] = [
  {
    id: "junior-racket-25",
    name: 'Junior Racket 25"',
    category: "rackets",
    description: "Lightweight junior tennis racket for orange and green ball players moving into longer rallies.",
    priceCents: 35000,
    condition: "Good",
    collectionClub: "Kenmare Tennis Club",
    status: "available",
    source: "Club shop",
    accent: "teal"
  },
  {
    id: "training-balls-green-dot",
    name: "Green Dot Training Balls",
    category: "balls",
    description: "Pack of lower-compression green dot balls for junior training and controlled match play.",
    priceCents: 12000,
    condition: "New",
    collectionClub: "Kenmare Tennis Club",
    status: "available",
    source: "Club shop",
    accent: "green"
  },
  {
    id: "court-shoes-entry-junior",
    name: "Junior Court Shoes",
    category: "shoes",
    description: "Entry-level junior court shoes suitable for hard court sessions and club events.",
    priceCents: null,
    condition: "New",
    collectionClub: "Kenmare Tennis Club",
    status: "limited",
    source: "Club supplier",
    accent: "blue"
  },
  {
    id: "overgrip-three-pack",
    name: "Overgrip 3 Pack",
    category: "grips",
    description: "Tacky overgrips for weekly training, social play and match days.",
    priceCents: 9000,
    condition: "New",
    collectionClub: "Kenmare Tennis Club",
    status: "available",
    source: "Club shop",
    accent: "teal"
  },
  {
    id: "synthetic-gut-restring",
    name: "Synthetic Gut Restring",
    category: "strings",
    description: "Basic restring enquiry for club players who need a fresh, comfortable setup.",
    priceCents: null,
    condition: null,
    collectionClub: "Kenmare Tennis Club",
    status: "available",
    source: "Coach referral",
    accent: "navy"
  },
  {
    id: "club-backpack",
    name: "PlayR Club Backpack",
    category: "bags",
    description: "Compact tennis backpack with racket sleeve, bottle pocket and shoe compartment.",
    priceCents: 48000,
    condition: "New",
    collectionClub: "Kenmare Tennis Club",
    status: "coming_soon",
    source: "Club kit supplier",
    accent: "navy"
  },
  {
    id: "club-event-shirt",
    name: "Club Event Shirt",
    category: "club-kit",
    description: "Lightweight event shirt for club days, junior fixtures and PlayR pilot events.",
    priceCents: null,
    condition: "New",
    collectionClub: "Kenmare Tennis Club",
    status: "limited",
    source: "Club kit supplier",
    accent: "green"
  },
  {
    id: "red-ball-starter-pack",
    name: "Red Ball Starter Pack",
    category: "junior-starter-packs",
    description: "Starter bundle idea for new red ball players: racket, balls, grip and simple carry bag.",
    priceCents: null,
    condition: "Pack to be confirmed",
    collectionClub: "Kenmare Tennis Club",
    status: "coming_soon",
    source: "Club shop",
    accent: "amber"
  },
  {
    id: "second-hand-adult-racket",
    name: "Second-hand Adult Racket",
    category: "second-hand",
    description: "Pre-owned adult racket suitable for social players starting club tennis.",
    priceCents: 65000,
    condition: "Used / good",
    collectionClub: "Kenmare Tennis Club",
    status: "available",
    source: "Member resale",
    accent: "amber"
  }
];

export function shopCategoryLabel(category: ShopCategorySlug) {
  return shopCategories.find((item) => item.slug === category)?.label ?? "Shop";
}

export function shopStatusLabel(status: ShopProductStatus) {
  switch (status) {
    case "available":
      return "Available";
    case "limited":
      return "Limited";
    case "reserved":
      return "Reserved";
    case "coming_soon":
      return "Coming soon";
  }
}

export function formatShopPrice(priceCents: number | null) {
  if (priceCents === null) {
    return "Price to be confirmed";
  }

  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0
  }).format(priceCents / 100);
}

export function getShopProduct(productId: string) {
  return shopProducts.find((product) => product.id === productId) ?? null;
}
