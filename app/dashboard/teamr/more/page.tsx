import Link from "next/link";
import { InfoIcon, RulesIcon, SettingsIcon, StatusIcon } from "@/components/playr-icons";
import { TeamRPageFrame, getProtectedTeamRPage } from "../teamr-shared";

export const dynamic = "force-dynamic";

export default async function TeamRMorePage() {
  const { content, context, venue } = await getProtectedTeamRPage();
  if (content) return content;
  if (!context) return null;
  const items = [
    { title: "Organisation information", text: "The selected organisation context is shown above.", icon: InfoIcon },
    { title: "People & Access", text: "Invite staff and manage shared organisation roles for TeamR operations.", icon: StatusIcon, href: "/dashboard/teamr/people" },
    { title: "Reports", text: "Operational reports will be introduced in a later phase.", icon: RulesIcon }
  ];
  return <TeamRPageFrame context={context} subtitle="Organisation context and future TeamR administration." title="More" venue={venue}><section className="grid gap-3 sm:grid-cols-2">{items.map(({ icon: Icon, text, title, ...item }) => item.href ? <Link className="surface-card block p-4 transition hover:shadow-court" href={item.href} key={title}><Icon className="text-court-teal" size={20} /><h2 className="mt-3 font-black text-court-navy">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></Link> : <article className="surface-card p-4" key={title}><Icon className="text-court-teal" size={20} /><h2 className="mt-3 font-black text-court-navy">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></article>)}<Link className="surface-card block p-4 transition hover:shadow-court" href="/dashboard/settings"><SettingsIcon className="text-court-teal" size={20} /><h2 className="mt-3 font-black text-court-navy">Account settings</h2><p className="mt-1 text-sm leading-6 text-slate-600">Open the shared PlayR account settings.</p></Link></section></TeamRPageFrame>;
}
