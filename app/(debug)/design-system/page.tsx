import { notFound } from "next/navigation";
import { ClubIcon, DistrictIcon, ParticipationIcon, RatingIcon, SchoolIcon, StageIcon } from "@/components/playr-icons";
import {
  CardSkeleton,
  Checkbox,
  EmptyState,
  FormField,
  IconContainer,
  Input,
  MetricCard,
  PlayRBadge,
  PlayRButton,
  PlayRCard,
  SectionError,
  SectionHeader,
  Select,
  Switch,
  Textarea
} from "@/components/playr-ui";
import { PageShell } from "@/components/page-shell";

export default function DesignSystemPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <PageShell eyebrow="Development preview" subtitle="Shared PlayR primitives and their supported states." title="PlayR Design System">
      <section>
        <SectionHeader description="Primary actions stay selective; lower-priority actions use calmer treatments." title="Buttons" />
        <div className="mt-4 flex flex-wrap gap-3">
          <PlayRButton>Primary</PlayRButton><PlayRButton variant="secondary">Secondary</PlayRButton><PlayRButton variant="outline">Outline</PlayRButton><PlayRButton variant="ghost">Ghost</PlayRButton><PlayRButton variant="destructive">Destructive</PlayRButton><PlayRButton disabled>Disabled</PlayRButton><PlayRButton loading loadingLabel="Saving">Save</PlayRButton>
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader description="Every badge includes a readable label; colour is supplementary." title="Badges" />
        <div className="mt-4 flex flex-wrap gap-2">
          <PlayRBadge icon={<ClubIcon size={13} />} variant="club">Club</PlayRBadge><PlayRBadge icon={<StageIcon size={13} />} variant="academy">Academy</PlayRBadge><PlayRBadge icon={<SchoolIcon size={13} />} variant="school">School</PlayRBadge><PlayRBadge icon={<DistrictIcon size={13} />} variant="district">District</PlayRBadge><PlayRBadge dot variant="success">Success</PlayRBadge><PlayRBadge dot variant="warning">Pending</PlayRBadge><PlayRBadge dot variant="error">Error</PlayRBadge><PlayRBadge dot variant="inactive">Inactive</PlayRBadge><PlayRBadge variant="private">Private</PlayRBadge>
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader description="Shared boundaries, radius and elevation with restrained variants." title="Cards and metrics" />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <PlayRCard className="p-5"><p className="section-kicker">Default</p><h3 className="mt-2 text-lg font-black text-court-navy">Standard card</h3><p className="mt-2 text-sm text-playr-text-secondary">A calm bordered surface.</p></PlayRCard>
          <PlayRCard className="p-5" selected variant="interactive"><p className="section-kicker">Interactive · selected</p><h3 className="mt-2 text-lg font-black text-court-navy">Interactive card</h3><p className="mt-2 text-sm text-playr-text-secondary">Consistent hover, selected and pressed feedback.</p></PlayRCard>
          <PlayRCard className="p-5" variant="dark"><p className="text-xs font-black uppercase tracking-wide text-court-lime">Brand</p><h3 className="mt-2 text-lg font-black">Dark premium card</h3><p className="mt-2 text-sm text-white/80">Light text remains readable.</p></PlayRCard>
          <MetricCard icon={<RatingIcon rating={7.4} size={20} stage="member" />} label="Rating" value="7.4" />
          <MetricCard icon={<ParticipationIcon size={20} />} label="Participation" value="420 pts" />
          <CardSkeleton />
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <EmptyState description="Helpful next steps can appear here when a valid action exists." icon={<IconContainer><ClubIcon size={20} /></IconContainer>} title="Nothing here yet" />
        <SectionError description="Try this section again later. No internal error details are exposed." />
      </section>

      <section className="mt-8">
        <SectionHeader description="Labels stay visible and controls retain 44px touch targets." title="Form controls" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FormField help="Supporting text is linked at the usage site." id="preview-name" label="Player name"><Input aria-describedby="preview-name-help" id="preview-name" placeholder="Player name" /></FormField>
          <FormField id="preview-type" label="Profile type"><Select defaultValue="adult" id="preview-type"><option value="adult">Adult player</option><option value="junior">Junior player</option></Select></FormField>
          <FormField error="Enter a valid value." id="preview-error" label="Error state"><Input aria-describedby="preview-error-error" id="preview-error" invalid /></FormField>
          <FormField id="preview-disabled" label="Disabled state"><Input disabled id="preview-disabled" value="Unavailable" readOnly /></FormField>
          <div className="md:col-span-2"><FormField id="preview-notes" label="Notes" optional><Textarea id="preview-notes" placeholder="Optional notes" /></FormField></div>
          <label className="inline-flex min-h-11 items-center gap-3 text-sm font-bold text-playr-text-primary"><Checkbox defaultChecked />Receive booking updates</label>
          <Switch defaultChecked label="Profile visible" />
        </div>
      </section>
    </PageShell>
  );
}
