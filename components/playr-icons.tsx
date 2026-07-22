import type { ReactNode } from "react";
import { playrAccents, playrStageKey, type PlayRAccentKey } from "@/lib/playr-ui";
import type { JuniorStage } from "@/types/courtside";

type PlayRIconProps = {
  className?: string;
  size?: number;
  title?: string;
};

type RatingStage = JuniorStage | "red" | "orange" | "green" | "yellow" | "member" | "adult" | "open" | null | undefined;

type RatingIconProps = PlayRIconProps & {
  maxRating?: number | null;
  rating?: number | null;
  stage?: RatingStage;
};

type IconShellProps = PlayRIconProps & {
  children: ReactNode;
};

const RATING_RING_RADIUS = 10;
const RATING_RING_CIRCUMFERENCE = 2 * Math.PI * RATING_RING_RADIUS;

function clampProgress(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function ratingAccentKey(stage: RatingStage): PlayRAccentKey {
  if (!stage || stage === "member" || stage === "adult" || stage === "open") {
    return "member";
  }

  return playrStageKey(stage);
}

function ratingScaleMax(stage: RatingStage, maxRating?: number | null) {
  if (typeof maxRating === "number" && maxRating > 0) {
    return maxRating;
  }

  const accentKey = ratingAccentKey(stage);
  return accentKey === "red" || accentKey === "orange" || accentKey === "green" ? 5 : 10;
}

function IconShell({ children, className = "", size = 16, title }: IconShellProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={`inline-block shrink-0 ${className}`}
      fill="none"
      height={size}
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function RatingIcon({ maxRating, rating, stage, ...props }: RatingIconProps) {
  const hasRating = typeof rating === "number" && Number.isFinite(rating);
  const progress = hasRating ? clampProgress(rating / ratingScaleMax(stage, maxRating)) : 0;
  const progressOffset = RATING_RING_CIRCUMFERENCE * (1 - progress);
  const progressClass = hasRating ? playrAccents[ratingAccentKey(stage)].icon : "text-slate-300";

  return (
    <IconShell {...props}>
      <circle className="text-slate-200" cx="12" cy="12" r={RATING_RING_RADIUS} stroke="currentColor" />
      {hasRating ? (
        <circle
          className={progressClass}
          cx="12"
          cy="12"
          r={RATING_RING_RADIUS}
          stroke="currentColor"
          strokeDasharray={RATING_RING_CIRCUMFERENCE}
          strokeDashoffset={progressOffset}
          strokeWidth="2.4"
          transform="rotate(-90 12 12)"
        />
      ) : null}
      <circle cx="12" cy="12" r="5.8" />
      <path d="M8.7 7.8c1.7 2 1.7 6.4 0 8.4" />
      <path d="M15.3 7.8c-1.7 2-1.7 6.4 0 8.4" />
    </IconShell>
  );
}

export function ParticipationIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="m12 3.5 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8L12 3.5Z" />
      <path d="M19.5 3.5v3" />
      <path d="M21 5h-3" />
    </IconShell>
  );
}

export function ConfidenceIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M12 3 5 6v5c0 4.5 2.8 8.5 7 10 4.2-1.5 7-5.5 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.7-4" />
    </IconShell>
  );
}

export function InviteIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 12 20 4l-4 16-4-6-8-2Z" />
      <path d="m12 14 4-10" />
      <path d="M5 19h5" />
    </IconShell>
  );
}

export function EventIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M6 3v4" />
      <path d="M18 3v4" />
      <path d="M4 8h16" />
      <rect height="17" rx="2" width="16" x="4" y="5" />
      <path d="M9 12h6" />
      <path d="M10 12v2a2 2 0 0 0 4 0v-2" />
      <path d="M9 12v-1h6v1" />
      <path d="M12 16v2" />
      <path d="M10.5 18h3" />
    </IconShell>
  );
}

export function BookingIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <rect height="16" rx="2" width="18" x="3" y="5" />
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <path d="M3 9h18" />
      <rect height="7" rx="1" width="10" x="7" y="12" />
      <path d="M12 12v7" />
      <path d="M7 15.5h10" />
      <circle cx="17" cy="17" r="2.2" />
      <path d="M17 15.8v1.3l.9.6" />
    </IconShell>
  );
}

export function SchoolIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 21V9l8-5 8 5v12" />
      <path d="M8 21v-6h8v6" />
      <path d="M8 11h.01" />
      <path d="M12 11h.01" />
      <path d="M16 11h.01" />
      <path d="M3 21h18" />
    </IconShell>
  );
}

export function ClubIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M3 20h18" />
      <path d="M8 20v-6h8v6" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
      <path d="M17 6.8V4h3" />
    </IconShell>
  );
}

export function LeaderboardIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 21v-6h5v6" />
      <path d="M9.5 21V9h5v12" />
      <path d="M15 21v-8h5v8" />
      <circle cx="12" cy="5" r="2" />
      <path d="M10 7.5h4" />
    </IconShell>
  );
}

export function BadgeIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="8" r="5" />
      <path d="m8.5 12.5-2 7 5.5-3 5.5 3-2-7" />
      <path d="m10 8 1.4 1.4L14 6.8" />
    </IconShell>
  );
}

export function MembershipIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <circle cx="9" cy="12" r="2" />
      <path d="M14 10h4" />
      <path d="M14 14h3" />
      <path d="M6.5 16c1.3-1.3 3.7-1.3 5 0" />
    </IconShell>
  );
}

export function PrivateIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <rect height="10" rx="2" width="16" x="4" y="11" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <path d="M12 15v2" />
    </IconShell>
  );
}

export function ShopIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M6 8h12l-1 13H7L6 8Z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </IconShell>
  );
}

export function LocationIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M12 21s7-5.3 7-12a7 7 0 1 0-14 0c0 6.7 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </IconShell>
  );
}

export function TimeIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconShell>
  );
}

export function StatusIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.2 2.2 4.8-5.2" />
    </IconShell>
  );
}

export function CostIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <rect height="13" rx="2" width="18" x="3" y="6" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
      <path d="M15 15h2" />
    </IconShell>
  );
}

export function EntriesIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M23 11h-6" />
    </IconShell>
  );
}

export function TicketIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V7Z" />
      <path d="M10 9v6" />
      <path d="M14 9v6" />
    </IconShell>
  );
}

export function TagIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M20 13 11 22l-9-9V4h9l9 9Z" />
      <circle cx="7.5" cy="9.5" r="1.5" />
    </IconShell>
  );
}

export function InfoIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </IconShell>
  );
}

export function RulesIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </IconShell>
  );
}

export function FormatIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
      <path d="M8 4v16" />
      <path d="M16 4v16" />
    </IconShell>
  );
}

export function StageIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="7" cy="14" r="3" />
      <circle cx="14" cy="9" r="4" />
      <path d="M4 20h16" />
      <path d="M17 16h3" />
    </IconShell>
  );
}

export function ResultIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 17 10 11l4 4 6-8" />
      <path d="M15 7h5v5" />
    </IconShell>
  );
}

export function CloseMatchIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="9" cy="12" r="4" />
      <circle cx="15" cy="12" r="4" />
    </IconShell>
  );
}

export function ChallengeIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M5 19 19 5" />
      <path d="M14 5h5v5" />
      <path d="M5 5l5 5" />
      <path d="M14 14l5 5" />
    </IconShell>
  );
}

export function MatchIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <ellipse cx="8" cy="7.5" rx="2.6" ry="3.5" transform="rotate(-35 8 7.5)" />
      <ellipse cx="16" cy="7.5" rx="2.6" ry="3.5" transform="rotate(35 16 7.5)" />
      <path d="m9.8 10.2 7.5 9" />
      <path d="m14.2 10.2-7.5 9" />
      <path d="M6 20h3" />
      <path d="M15 20h3" />
    </IconShell>
  );
}

export function BellIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M10 21h4" />
    </IconShell>
  );
}

export function NotificationIcon(props: PlayRIconProps) {
  return <BellIcon {...props} />;
}

export function MessagesIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 5h16v11H9l-5 4V5Z" />
      <path d="M8 9h8" />
      <path d="M8 12h5" />
    </IconShell>
  );
}

export function SettingsIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </IconShell>
  );
}

export function AppSwitcherIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <rect height="6" rx="1" width="6" x="3" y="3" />
      <rect height="6" rx="1" width="6" x="15" y="3" />
      <rect height="6" rx="1" width="6" x="3" y="15" />
      <rect height="6" rx="1" width="6" x="15" y="15" />
    </IconShell>
  );
}

export function SignOutIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M10 5H5v14h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M8 12h10" />
    </IconShell>
  );
}

export function DistrictIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M5 19V7l5-3 4 3 5-3v12l-5 3-4-3-5 3Z" />
      <path d="M10 4v12" />
      <path d="M14 7v12" />
      <circle cx="12" cy="11" r="2" />
    </IconShell>
  );
}

export function ArrowRightIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </IconShell>
  );
}

export function ChevronDownIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconShell>
  );
}
