import { NextResponse } from "next/server";

export function GET(request: Request) {
  const destination = new URL("/login", request.url);
  destination.searchParams.set("message", "Use a Sign out button to end your session safely.");
  return NextResponse.redirect(destination, 303);
}
