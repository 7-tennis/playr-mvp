import { redirect } from "next/navigation";

export default function EventRouteRedirect({ params }: { params: { id: string } }) {
  redirect(`/admin/events/${params.id}/edit`);
}
