import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { featuredEvents } from "@/lib/mock-data";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

const pillars = [
  { title: "Book courts", text: "Reserve court time for yourself or linked junior players." },
  { title: "Build your rating", text: "Track verified match results and rating movement over time." },
  { title: "Join club events", text: "Enter events and keep manual payment status visible." },
  { title: "CoachR ready", text: "Coach feedback is planned as a future PlayR ecosystem module." }
];

async function getHomeSession() {
  if (!hasSupabaseConfig()) {
    return false;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const isLoggedIn = await getHomeSession();

  return (
    <main>
      <section className="bg-court-navy text-white">
        <div className="mx-auto grid min-h-[520px] max-w-6xl content-center gap-10 px-4 py-16 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-court-lime">PlayR Technologies</p>
            <h1 className="mt-4 text-5xl font-black tracking-tight md:text-7xl">PlayR</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-blue-50">
              PlayR is a connected tennis platform for player ratings, club events, court bookings, and coach feedback.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {isLoggedIn ? (
                <Link className="rounded bg-court-teal px-5 py-3 font-bold text-white transition hover:bg-teal-500" href="/dashboard">
                  Go to My PlayR
                </Link>
              ) : (
                <>
                  <Link className="rounded bg-court-teal px-5 py-3 font-bold text-white transition hover:bg-teal-500" href="/login">
                    Log in
                  </Link>
                  <Link className="rounded border border-white/30 px-5 py-3 font-bold text-white transition hover:bg-white/10" href="/signup">
                    Sign up
                  </Link>
                </>
              )}
              <Link className="rounded border border-white/30 px-5 py-3 font-bold text-white transition hover:bg-white/10" href="/events">
                Browse events
              </Link>
            </div>
          </div>
          <div className="grid gap-3">
            {featuredEvents.slice(0, 2).map((event) => (
              <div className="rounded bg-white p-4 text-court-ink" key={event.id}>
                <p className="text-xs font-black uppercase tracking-wide text-court-teal">{event.sport}</p>
                <h2 className="mt-1 text-lg font-black">{event.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{event.location}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-4 md:grid-cols-4">
          {pillars.map((pillar) => (
            <article className="rounded-lg border border-slate-200 bg-white p-5" key={pillar.title}>
              <h2 className="text-xl font-black text-court-navy">{pillar.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{pillar.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-court-teal">Upcoming</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-court-navy">Upcoming events</h2>
            </div>
            <Link className="btn-secondary mt-2" href="/events">
              View all events
            </Link>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {featuredEvents.map((event) => (
              <EventCard event={event} key={event.id} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-court-teal">How it works</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-court-navy">Create a profile, book courts, join events, and progress.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {["Create profile", "Add juniors", "Book or play", "Track progress"].map((step, index) => (
              <div className="rounded-lg bg-court-mist p-5" key={step}>
                <span className="text-sm font-black text-court-teal">0{index + 1}</span>
                <p className="mt-3 font-black text-court-navy">{step}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-8 rounded-lg border border-court-teal/30 bg-white p-4 text-sm text-slate-700">
          Profiles are required for all players. Profiles do not automatically mean club membership; member status is managed in ClubR Admin.
        </p>
      </section>
    </main>
  );
}
