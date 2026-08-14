"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canReviewTeamRPlayerRequests, getTeamRAccess, teamRJuniorStages } from "@/lib/teamr";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function teamPath(teamId?: string) {
  return teamId ? `/dashboard/teamr/teams/${teamId}` : "/dashboard/teamr/teams";
}

function errorCode(error: { code?: string; message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (error?.code === "23505") return "duplicate";
  if (["access", "invalid_request", "request_closed"].some((code) => message.includes(code))) return message.split(/[\s:]/)[0];
  return fallback;
}

async function requireTeamRWriteContext() {
  const access = await getTeamRAccess();
  if (access.context.kind !== "authenticated" || !access.allowed || !access.context.venueId) {
    redirect("/dashboard/teamr?error=access");
  }
  return access.context;
}

export async function reviewTeamRPlayerRequest(formData: FormData) {
  const context = await requireTeamRWriteContext();
  const linkId = text(formData, "linkId");
  const decision = text(formData, "decision");

  if (!linkId || !["approve", "reject"].includes(decision) || !canReviewTeamRPlayerRequests(context)) {
    redirect("/dashboard/teamr/players?error=access&view=pending");
  }

  const { error } = await context.supabase.rpc("teamr_review_player_request", {
    p_decision: decision,
    p_link_id: linkId
  });

  if (error) redirect(`/dashboard/teamr/players?error=${errorCode(error, "review_failed")}&view=pending`);
  revalidatePath("/dashboard/teamr");
  revalidatePath("/dashboard/teamr/players");
  redirect(`/dashboard/teamr/players?message=${decision === "approve" ? "approved" : "rejected"}&view=pending`);
}

export async function createTeamRTeam(formData: FormData) {
  const context = await requireTeamRWriteContext();
  const name = text(formData, "name");
  const requestedStage = text(formData, "juniorStage");
  const juniorStage = teamRJuniorStages.some((stage) => stage.value === requestedStage) ? requestedStage : null;

  if (!name || name.length > 100) redirect("/dashboard/teamr/teams?error=invalid_team");

  const { data, error } = await context.supabase
    .from("teamr_teams")
    .insert({
      created_by_user_id: context.user.id,
      junior_stage: juniorStage,
      name,
      status: "active",
      venue_id: context.venueId
    })
    .select("id")
    .single();

  if (error || !data?.id) redirect(`/dashboard/teamr/teams?error=${errorCode(error, "create_failed")}`);
  revalidatePath("/dashboard/teamr");
  revalidatePath("/dashboard/teamr/teams");
  redirect(`${teamPath(String(data.id))}?message=created`);
}

export async function updateTeamRTeam(formData: FormData) {
  const context = await requireTeamRWriteContext();
  const teamId = text(formData, "teamId");
  const name = text(formData, "name");
  const requestedStage = text(formData, "juniorStage");
  const juniorStage = teamRJuniorStages.some((stage) => stage.value === requestedStage) ? requestedStage : null;

  if (!teamId || !name || name.length > 100) redirect(`${teamPath(teamId)}?error=invalid_team`);

  const { data, error } = await context.supabase
    .from("teamr_teams")
    .update({ junior_stage: juniorStage, name })
    .eq("id", teamId)
    .eq("venue_id", context.venueId)
    .select("id")
    .maybeSingle();

  if (error || !data) redirect(`${teamPath(teamId)}?error=${errorCode(error, "update_failed")}`);
  revalidatePath("/dashboard/teamr/teams");
  revalidatePath(teamPath(teamId));
  redirect(`${teamPath(teamId)}?message=updated`);
}

export async function archiveTeamRTeam(formData: FormData) {
  const context = await requireTeamRWriteContext();
  const teamId = text(formData, "teamId");
  if (!teamId) redirect("/dashboard/teamr/teams?error=invalid_team");

  const { data, error } = await context.supabase
    .from("teamr_teams")
    .update({ status: "archived" })
    .eq("id", teamId)
    .eq("venue_id", context.venueId)
    .select("id")
    .maybeSingle();

  if (error || !data) redirect(`${teamPath(teamId)}?error=${errorCode(error, "archive_failed")}`);
  revalidatePath("/dashboard/teamr");
  revalidatePath("/dashboard/teamr/teams");
  redirect("/dashboard/teamr/teams?message=archived");
}

export async function addTeamRRosterMember(formData: FormData) {
  const context = await requireTeamRWriteContext();
  const teamId = text(formData, "teamId");
  const playerLinkId = text(formData, "playerLinkId");
  if (!teamId || !playerLinkId) redirect(`${teamPath(teamId)}?error=invalid_roster`);

  const [{ data: team }, { data: playerLink }] = await Promise.all([
    context.supabase.from("teamr_teams").select("id").eq("id", teamId).eq("venue_id", context.venueId).eq("status", "active").maybeSingle(),
    context.supabase.from("organisation_player_links").select("id").eq("id", playerLinkId).eq("venue_id", context.venueId).eq("status", "active").maybeSingle()
  ]);

  if (!team || !playerLink) redirect(`${teamPath(teamId)}?error=roster_access`);

  const { error } = await context.supabase.from("teamr_roster_memberships").insert({
    created_by_user_id: context.user.id,
    organisation_player_link_id: playerLinkId,
    team_id: teamId,
    venue_id: context.venueId
  });

  if (error) redirect(`${teamPath(teamId)}?error=${errorCode(error, "roster_add_failed")}`);
  revalidatePath("/dashboard/teamr");
  revalidatePath("/dashboard/teamr/teams");
  revalidatePath(teamPath(teamId));
  redirect(`${teamPath(teamId)}?message=player_added`);
}

export async function removeTeamRRosterMember(formData: FormData) {
  const context = await requireTeamRWriteContext();
  const teamId = text(formData, "teamId");
  const rosterMembershipId = text(formData, "rosterMembershipId");
  if (!teamId || !rosterMembershipId) redirect(`${teamPath(teamId)}?error=invalid_roster`);

  const { data, error } = await context.supabase
    .from("teamr_roster_memberships")
    .delete()
    .eq("id", rosterMembershipId)
    .eq("team_id", teamId)
    .eq("venue_id", context.venueId)
    .select("id")
    .maybeSingle();

  if (error || !data) redirect(`${teamPath(teamId)}?error=${errorCode(error, "roster_remove_failed")}`);
  revalidatePath("/dashboard/teamr");
  revalidatePath("/dashboard/teamr/teams");
  revalidatePath(teamPath(teamId));
  redirect(`${teamPath(teamId)}?message=player_removed`);
}
