import { EventIcon } from "@/components/playr-icons";
import { TeamRPageFrame, getProtectedTeamRPage } from "../teamr-shared";

export const dynamic = "force-dynamic";

export default async function TeamRCompetitionsPage() {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;
  return <TeamRPageFrame context={context} subtitle="The foundation for future leagues, fixtures and event operations." title="Competitions" venue={venue}><section className="empty-state"><EventIcon className="mx-auto text-court-teal" size={30} /><h2 className="section-title mt-3">Competition operations are coming next</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">Leagues, fixtures, festival formats, scoring and results remain intentionally outside Phase 1. This authorised route is ready for those workflows.</p></section></TeamRPageFrame>;
}
