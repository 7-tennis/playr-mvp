export function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg"
  }).format(new Date(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg"
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Johannesburg"
  }).format(new Date(value));
}

export function formatLabel(value: string | null) {
  if (!value) {
    return "Open";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatJuniorStage(value: string | null | undefined) {
  switch (value) {
    case "red_ball":
    case "red":
      return "Red";
    case "orange_ball":
    case "orange":
      return "Orange";
    case "green_ball":
    case "green":
      return "Green";
    case "yellow_ball":
    case "yellow":
      return "Yellow";
    default:
      return "Red";
  }
}

export function formatJuniorRating(stage: string | null | undefined, rating: number | null | undefined) {
  return `${formatJuniorStage(stage)} ${(rating ?? 2.5).toFixed(1)}`;
}
