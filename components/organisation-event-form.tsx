import { eventLocalParts, eventVisibilityDescription, organisationEventStages, type OrganisationEvent } from "@/lib/organisation-events";

const fieldClass = "mt-2 w-full rounded border border-slate-300 px-3 py-2.5 font-semibold focus-ring";

export function OrganisationEventForm({ action, event, submitLabel }: {
  action: (formData: FormData) => void | Promise<void>;
  event?: OrganisationEvent;
  submitLabel: string;
}) {
  const start = eventLocalParts(event?.starts_at ?? event?.start_datetime);
  const end = eventLocalParts(event?.ends_at ?? event?.end_datetime);
  return (
    <form action={action} className="surface-card grid gap-4 p-4 sm:p-5 md:grid-cols-2">
      {event ? <input name="eventId" type="hidden" value={event.id} /> : null}
      <label className="text-sm font-bold text-court-navy md:col-span-2">Event name<input className={fieldClass} maxLength={120} name="title" required type="text" defaultValue={event?.title ?? ""} /></label>
      <fieldset className="grid gap-3 md:col-span-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold text-court-navy">Who is this event for?</legend>
        {(["closed", "open"] as const).map((visibility) => <label className="rounded-lg border border-slate-200 p-3 text-sm" key={visibility}><span className="flex items-center gap-2 font-black capitalize text-court-navy"><input defaultChecked={(event?.visibility ?? "closed") === visibility} name="visibility" type="radio" value={visibility} />{visibility}</span><span className="mt-1 block leading-5 text-slate-600">{eventVisibilityDescription(visibility)}</span></label>)}
      </fieldset>
      <label className="text-sm font-bold text-court-navy">Date<input className={fieldClass} defaultValue={start.date} name="date" required type="date" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold text-court-navy">Starts<input className={fieldClass} defaultValue={start.time} name="startTime" required type="time" /></label><label className="text-sm font-bold text-court-navy">Ends<input className={fieldClass} defaultValue={end.time} name="endTime" required type="time" /></label></div>
      <p className="-mt-2 text-xs font-semibold text-slate-500 md:col-span-2">Times are captured in South Africa Standard Time (UTC+2).</p>
      <label className="text-sm font-bold text-court-navy md:col-span-2">Location<input className={fieldClass} defaultValue={event?.location ?? ""} maxLength={200} name="location" placeholder="School courts, host club or public venue" required type="text" /></label>
      <label className="text-sm font-bold text-court-navy">Stage/category<select className={fieldClass} defaultValue={event?.junior_stage ?? ""} name="juniorStage"><option value="">Mixed / General</option>{organisationEventStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></label>
      <label className="text-sm font-bold text-court-navy">Capacity <span className="font-normal text-slate-500">(optional)</span><input className={fieldClass} defaultValue={event?.capacity ?? ""} min={1} name="capacity" placeholder="Unlimited" step={1} type="number" /></label>
      <label className="text-sm font-bold text-court-navy md:col-span-2">Short description <span className="font-normal text-slate-500">(optional)</span><textarea className={`${fieldClass} min-h-28`} defaultValue={event?.description ?? ""} maxLength={1000} name="description" /></label>
      {!event ? <label className="text-sm font-bold text-court-navy">Save as<select className={fieldClass} defaultValue="draft" name="status"><option value="draft">Draft</option><option value="published">Published</option></select></label> : null}
      <div className="flex items-end md:col-span-2"><button className="btn-primary w-full sm:w-auto" type="submit">{submitLabel}</button></div>
    </form>
  );
}
