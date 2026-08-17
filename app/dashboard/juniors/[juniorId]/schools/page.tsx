import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { SchoolIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { formatLabel } from "@/lib/courtside-format";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { OrganisationLinkStatus, OrganisationType } from "@/types/courtside";
import { requestJuniorSchoolConnection } from "../../schools/actions";

export const dynamic = "force-dynamic";

type SchoolRow = {
  id: string;
  name: string;
  organisation_type: OrganisationType;
  address: string | null;
  suburb: string | null;
  town: string | null;
  city: string | null;
  district_id: string | null;
  district_name: string | null;
};

type LinkRow = { id: string; status: OrganisationLinkStatus; venue_id: string };

function messageText(message?: string) {
  if (message === "pending") return "School request sent. The school must approve it before the player becomes active in TeamR.";
  if (message === "already_connected") return "This player is already connected to that school.";
  return null;
}

function errorText(error?: string) {
  if (error === "connection_suspended") return "This school connection is suspended and must be reviewed by the school before rejoining.";
  if (error === "profile_access") return "You are not authorised to act for that Junior profile.";
  if (error === "ineligible_school") return "That organisation is not an eligible active school.";
  if (error) return "The school request could not be submitted.";
  return null;
}

export default async function JuniorSchoolsPage({
  params,
  searchParams
}: {
  params: { juniorId: string };
  searchParams?: { error?: string; message?: string; onboarding?: string; q?: string };
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/dashboard/juniors/${params.juniorId}/schools`)}`);

  const { data: parent } = await supabase.from("profiles").select("id").eq("user_id", user.id).eq("is_junior", false).maybeSingle();
  const { data: junior } = parent ? await supabase
    .from("profiles")
    .select("id,first_name,last_name,junior_stage")
    .eq("id", params.juniorId)
    .eq("parent_profile_id", parent.id)
    .eq("is_junior", true)
    .maybeSingle() : { data: null };
  if (!junior) redirect("/dashboard/juniors?error=profile_access");

  const queryText = searchParams?.q?.trim() ?? "";
  const [{ data: schoolsData, error: schoolsError }, { data: linksData, error: linksError }] = await Promise.all([
    supabase.rpc("teamr_discover_schools", { p_player_profile_id: junior.id, p_search: queryText || null }),
    supabase.from("organisation_player_links").select("id,venue_id,status").eq("player_profile_id", junior.id).in("status", ["pending", "active", "suspended"])
  ]);
  const schools = (schoolsData ?? []) as SchoolRow[];
  const links = (linksData ?? []) as LinkRow[];
  const linksByVenue = new Map(links.map((link) => [link.venue_id, link]));

  return (
    <PageShell eyebrow="Junior school connections" subtitle={`Connect ${junior.first_name}’s existing PlayR profile to an eligible school.`} title="Find a School">
      <StatusAlert className="mb-4" message={messageText(searchParams?.message)} tone="success" />
      <StatusAlert className="mb-4" message={errorText(searchParams?.error)} tone="error" />
      <section className="mb-5 rounded-lg border border-court-teal/30 bg-court-mist p-4 text-sm leading-6 text-court-navy">
        <p className="font-black">{searchParams?.onboarding ? `${junior.first_name} is ready — add a school now or skip for later` : "One player, one PlayR profile"}</p>
        <p className="mt-1">Joining creates a pending relationship to the selected school. It does not create another player, rating, or participation record.</p>
      </section>

      <form className="surface-card mb-5 flex flex-col gap-3 p-4 sm:flex-row" method="get">
        <label className="flex-1 text-sm font-bold text-court-navy">School name<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-semibold focus-ring" defaultValue={queryText} name="q" placeholder="Search schools" /></label>
        <div className="flex items-end gap-2"><button className="btn-primary px-4 py-2" type="submit">Search</button>{queryText ? <Link className="btn-secondary px-4 py-2" href={`/dashboard/juniors/${junior.id}/schools`}>Clear</Link> : null}</div>
      </form>

      {schoolsError || linksError ? <div className="ui-empty-card">School connections could not be loaded right now.</div> : null}
      {!schoolsError && schools.length === 0 ? <div className="empty-state"><SchoolIcon className="mx-auto text-court-teal" size={28} /><h2 className="section-title mt-3">No schools found</h2><p className="mt-2 text-sm text-slate-600">Try a shorter school name. Clubs and academies are intentionally excluded.</p></div> : null}
      <section className="grid gap-3 lg:grid-cols-2" aria-label="Eligible schools">
        {schools.map((school) => {
          const link = linksByVenue.get(school.id);
          const location = [school.suburb, school.town, school.city].filter(Boolean).join(", ") || school.address;
          return (
            <article className="surface-card flex flex-col p-4" key={school.id}>
              <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded bg-court-mist text-court-teal"><SchoolIcon size={20} /></span><div><p className="font-black text-court-navy">{school.name}</p><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{school.organisation_type === "school_district" ? "School & District" : "School"}</p></div></div>
              {location ? <p className="mt-3 text-sm text-slate-600">{location}</p> : null}
              {school.district_name ? <p className="mt-2 text-sm font-bold text-slate-700">District: {school.district_name}</p> : null}
              <div className="mt-auto pt-4">
                {link ? <span className={`ui-chip ${link.status === "active" ? "ui-chip-success" : "ui-chip-muted"}`}>{link.status === "active" ? "Connected" : link.status === "pending" ? "Approval pending" : formatLabel(link.status)}</span> : (
                  <form action={requestJuniorSchoolConnection}>
                    <input name="juniorProfileId" type="hidden" value={junior.id} />
                    <input name="venueId" type="hidden" value={school.id} />
                    <SubmitButton className="btn-primary w-full" pendingText="Sending request...">Join School</SubmitButton>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </section>
      <Link className="btn-secondary mt-5" href="/dashboard/juniors">{searchParams?.onboarding ? "Not now — finish Junior setup" : "Back to Juniors"}</Link>
    </PageShell>
  );
}
