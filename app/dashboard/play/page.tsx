import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type DashboardPlayPageProps = {
  searchParams?: {
    invite?: string;
    result?: string;
    error?: string;
  };
};

export default function DashboardPlayPage({ searchParams }: DashboardPlayPageProps) {
  const params = new URLSearchParams();
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  redirect(query ? `/dashboard/compete?${query}` : "/dashboard/compete");
}
