import type { ReactNode } from "react";

type PlayRIconProps = {
  className?: string;
  size?: number;
  title?: string;
};

type IconShellProps = PlayRIconProps & {
  children: ReactNode;
};

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

export function RatingIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
      <path d="M4 12h3" />
      <path d="M17 12h3" />
    </IconShell>
  );
}

export function ParticipationIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z" />
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
      <path d="M4 5h16v12H4z" />
      <path d="m4 7 8 6 8-6" />
      <path d="M17 19h4" />
      <path d="M19 17v4" />
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
      <path d="M9 13h.01" />
      <path d="M15 13h.01" />
      <path d="M12 17h.01" />
    </IconShell>
  );
}

export function BookingIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <path d="M7 9h10" />
      <path d="M7 13h4" />
      <path d="M15 13h2" />
      <path d="M8 19v2" />
      <path d="M16 19v2" />
    </IconShell>
  );
}

export function SchoolIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="m3 9 9-5 9 5-9 5-9-5Z" />
      <path d="M7 12v4c3 2 7 2 10 0v-4" />
      <path d="M21 9v6" />
    </IconShell>
  );
}

export function ClubIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <circle cx="7" cy="17" r="2" />
      <path d="M9 15 19 5" />
      <path d="m16 5 3 3" />
      <path d="m14 7 3 3" />
      <path d="M5 19h6" />
    </IconShell>
  );
}

export function LeaderboardIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M5 21v-7h4v7" />
      <path d="M10 21V9h4v12" />
      <path d="M15 21v-5h4v5" />
      <path d="M8 10V7" />
      <path d="m6.5 8.5 1.5-3 1.5 3" />
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
      <rect height="12" rx="2" width="18" x="3" y="6" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10v4" />
      <path d="M18 10v4" />
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
      <path d="M4 19h16" />
      <path d="M6 19v-4h4v4" />
      <path d="M10 19v-8h4v8" />
      <path d="M14 19V7h4v12" />
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

export function BellIcon(props: PlayRIconProps) {
  return (
    <IconShell {...props}>
      <path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M10 21h4" />
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
