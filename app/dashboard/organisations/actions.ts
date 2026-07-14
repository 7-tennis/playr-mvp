"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPermissionContext } from "@/lib/permissions";
import { productForOrganisationMembership } from "@/lib/organisations";
import { loadOrganisationSetup, productSetupPath } from "@/lib/organisation-setup";
import type { ProductContext } from "@/types/courtside";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function productLanding(product: ProductContext) {
  switch (product) {
    case "clubr":
      return "/dashboard/clubr";
    case "coachr":
      return "/dashboard/coachr";
    case "teamr":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

function revalidateOrganisationSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clubr");
  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/coaches");
  revalidatePath("/dashboard/coachr/students");
  revalidatePath("/dashboard/coachr/schedule");
  revalidatePath("/dashboard/organisations/invitations");
}

export async function switchActiveOrganisation(formData: FormData) {
  const context = await getPermissionContext();
  const membershipId = text(formData, "membershipId");

  if (context.kind !== "authenticated" || !membershipId) {
    redirect("/dashboard?organisation=invalid");
  }

  const membership = context.organisationMemberships.find((item) => item.id === membershipId);

  if (!membership || membership.status !== "active" || membership.venue?.status === "inactive") {
    redirect("/dashboard?organisation=restricted");
  }

  const productContext = productForOrganisationMembership(membership);
  const { error } = await context.supabase.from("user_active_organisations").upsert(
    {
      product_context: productContext,
      updated_at: new Date().toISOString(),
      user_id: context.user.id,
      venue_id: membership.venue_id
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("Active organisation switch failed", { error, membershipId, userId: context.user.id.slice(0, 8) });
    redirect("/dashboard?organisation=switch_failed");
  }

  revalidateOrganisationSurfaces();
  if (productContext === "clubr" || productContext === "coachr") {
    const setup = await loadOrganisationSetup(context.supabase, membership.venue_id, productContext);

    if (setup.migrationReady && setup.setup.status !== "complete") {
      redirect(productSetupPath(productContext, setup.setup.current_step));
    }
  }

  redirect(productLanding(productContext));
}
