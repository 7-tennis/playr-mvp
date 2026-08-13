import { MatchIcon } from "@/components/playr-icons";
import { TeamRPageFrame, getProtectedTeamRPage } from "../teamr-shared";

export const dynamic = "force-dynamic";

export default async function TeamRTeamsPage() {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;
  return <TeamRPageFrame context={context} subtitle="The future home for school and district team structures." title="Teams" venue={venue}><section className="empty-state"><MatchIcon className="mx-auto text-court-teal" size={30} /><h2 className="section-title mt-3">Teams are not configured yet</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">A later TeamR phase will add team creation, divisions and rosters. No speculative team records or duplicate player data have been created in this foundation phase.</p></section></TeamRPageFrame>;
}
