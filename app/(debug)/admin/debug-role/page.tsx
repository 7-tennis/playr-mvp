import Link from "next/link";
import { getPostLoginPathForUser } from "@/lib/auth-routing";
import { canAccessClubAdmin, loadActiveRoleRow, normalizeStoredRole } from "@/lib/permissions";
import { getSupabaseUrl, hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type AdminUserDiagnosticRow = {
  id: string;
  user_id: string;
  role: string;
  venue_id: string | null;
  deactivated_at: string | null;
  created_at: string | null;
};

type DiagnosticItem = {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
};

function projectHost() {
  const url = getSupabaseUrl();

  if (!url) {
    return "Supabase URL not configured";
  }

  try {
    return new URL(url).host;
  } catch {
    return "Supabase URL host could not be parsed";
  }
}

function boolLabel(value: boolean) {
  return value ? "Yes" : "No";
}

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "None";
  }

  if (typeof value === "boolean") {
    return boolLabel(value);
  }

  return String(value);
}

function errorText(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return "None";
  }

  return [error.code, error.message].filter(Boolean).join(" / ");
}

function rowTone(item: DiagnosticItem) {
  switch (item.tone) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "warn":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-slate-200 bg-white text-slate-700";
  }
}

export default async function DebugRolePage() {
  if (!hasSupabaseConfig()) {
    return (
      <main className="mx-auto min-h-[70vh] max-w-4xl px-4 py-10">
        <p className="text-sm font-black uppercase tracking-wide text-court-teal">Role Debug</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-court-navy">Supabase is not configured.</h1>
      </main>
    );
  }

  const supabase = await createServerSupabaseClient();
  const userResult = await supabase.auth.getUser();
  const authUser = userResult.data.user;
  const authError = userResult.error;
  const authSucceeded = Boolean(authUser && !authError);

  if (!authUser) {
    const unauthenticatedDiagnostics = {
      authGetUserSucceeded: authSucceeded,
      authGetUserError: errorText(authError),
      projectHost: projectHost()
    };

    console.warn("[playr-debug-role]", unauthenticatedDiagnostics);

    return (
      <main className="mx-auto min-h-[70vh] max-w-4xl px-4 py-10">
        <p className="text-sm font-black uppercase tracking-wide text-court-teal">Role Debug</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-court-navy">No authenticated user found.</h1>
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          Sign in first, then open this page again.
        </div>
        <Link className="mt-5 inline-flex rounded bg-court-blue px-4 py-3 font-bold text-white" href="/login">
          Go to login
        </Link>
      </main>
    );
  }

  const [activeRoleRow, activeRowsResult, fallbackRowsResult] = await Promise.all([
    loadActiveRoleRow(supabase, authUser.id),
    supabase
      .from("admin_users")
      .select("id,user_id,role,venue_id,deactivated_at,created_at")
      .eq("user_id", authUser.id)
      .is("deactivated_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("admin_users").select("id,user_id,role,venue_id,created_at").eq("user_id", authUser.id).order("created_at", { ascending: false })
  ]);
  const loginRedirectPath = await getPostLoginPathForUser(supabase, authUser.id);
  const resolvedRole = normalizeStoredRole(activeRoleRow?.role ?? null);
  const platformAdminRecognised = resolvedRole === "platform_admin";
  const adminPageWouldAllowAccess = canAccessClubAdmin(resolvedRole);
  const organisationsPageWouldAllowAccess = platformAdminRecognised;
  const activeRows = ((activeRowsResult.data ?? []) as AdminUserDiagnosticRow[]) ?? [];
  const fallbackRows = ((fallbackRowsResult.data ?? []) as Omit<AdminUserDiagnosticRow, "deactivated_at">[]) ?? [];
  const activeAdminRowFound = Boolean(activeRoleRow || activeRows.length > 0);
  const activeRowsQueryError = activeRowsResult.error;
  const fallbackRowsQueryError = fallbackRowsResult.error;
  const diagnosticPayload = {
    authenticatedUserId: authUser.id,
    authenticatedEmail: authUser.email ?? null,
    authGetUserSucceeded: authSucceeded,
    authGetUserError: errorText(authError),
    supabaseProjectHost: projectHost(),
    loadActiveRoleRowResult: activeRoleRow
      ? {
          id: activeRoleRow.id,
          role: activeRoleRow.role,
          venue_id: activeRoleRow.venue_id ?? null,
          deactivated_at: activeRoleRow.deactivated_at ?? null
        }
      : null,
    activeAdminUsersRowFound: activeAdminRowFound,
    activeAdminUsersRowCount: activeRows.length,
    activeAdminUsersQueryError: errorText(activeRowsQueryError),
    fallbackAdminUsersRowCount: fallbackRows.length,
    fallbackAdminUsersQueryError: errorText(fallbackRowsQueryError),
    resolvedRole,
    venueId: activeRoleRow?.venue_id ?? null,
    deactivatedAt: activeRoleRow?.deactivated_at ?? null,
    platformAdminRecognised,
    permissionHelperUsed: "loadActiveRoleRow() + normalizeStoredRole() + canAccessClubAdmin()",
    adminPageWouldAllowAccess,
    organisationsPageWouldAllowAccess,
    loginRedirectPath,
    loginRedirectRecognisesPlatformAdmin: loginRedirectPath === "/admin/organisations"
  };

  console.info("[playr-debug-role]", diagnosticPayload);

  const diagnostics: DiagnosticItem[] = [
    { label: "Authenticated user id", value: authUser.id, tone: "ok" },
    { label: "Authenticated email", value: authUser.email ?? "No email on auth user", tone: authUser.email ? "ok" : "warn" },
    { label: "auth.getUser() success", value: boolLabel(authSucceeded), tone: authSucceeded ? "ok" : "warn" },
    { label: "auth.getUser() error", value: errorText(authError), tone: authError ? "warn" : "muted" },
    { label: "Supabase project URL host", value: projectHost(), tone: "muted" },
    { label: "loadActiveRoleRow() role", value: valueLabel(activeRoleRow?.role), tone: activeRoleRow ? "ok" : "warn" },
    { label: "loadActiveRoleRow() row id", value: valueLabel(activeRoleRow?.id), tone: activeRoleRow ? "ok" : "warn" },
    { label: "Active admin_users row found", value: boolLabel(activeAdminRowFound), tone: activeAdminRowFound ? "ok" : "warn" },
    { label: "Active admin_users row count", value: String(activeRows.length), tone: activeRows.length > 0 ? "ok" : "warn" },
    { label: "Active admin_users query error", value: errorText(activeRowsQueryError), tone: activeRowsQueryError ? "warn" : "muted" },
    { label: "Legacy admin_users row count", value: String(fallbackRows.length), tone: fallbackRows.length > 0 ? "ok" : "muted" },
    { label: "Legacy admin_users query error", value: errorText(fallbackRowsQueryError), tone: fallbackRowsQueryError ? "warn" : "muted" },
    { label: "Resolved role", value: resolvedRole, tone: platformAdminRecognised ? "ok" : "warn" },
    { label: "venue_id", value: valueLabel(activeRoleRow?.venue_id), tone: activeRoleRow?.venue_id ? "ok" : "muted" },
    { label: "deactivated_at", value: valueLabel(activeRoleRow?.deactivated_at), tone: activeRoleRow?.deactivated_at ? "warn" : "ok" },
    { label: "platform_admin recognised", value: boolLabel(platformAdminRecognised), tone: platformAdminRecognised ? "ok" : "warn" },
    { label: "Permission helper being used", value: "loadActiveRoleRow() + normalizeStoredRole() + canAccessClubAdmin()", tone: "muted" },
    { label: "/admin would allow access", value: boolLabel(adminPageWouldAllowAccess), tone: adminPageWouldAllowAccess ? "ok" : "warn" },
    { label: "/admin/organisations would allow access", value: boolLabel(organisationsPageWouldAllowAccess), tone: organisationsPageWouldAllowAccess ? "ok" : "warn" },
    { label: "Login redirect path", value: loginRedirectPath, tone: loginRedirectPath === "/admin/organisations" ? "ok" : "warn" },
    {
      label: "Login redirect recognises platform_admin",
      value: boolLabel(loginRedirectPath === "/admin/organisations"),
      tone: loginRedirectPath === "/admin/organisations" ? "ok" : "warn"
    }
  ];

  return (
    <main className="mx-auto min-h-[70vh] max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-court-teal">Temporary Diagnostic</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-court-navy md:text-5xl">SupeR UseR Role Debug</h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold text-slate-600">
            This page uses the current authenticated session only. It does not expose service-role keys or private project secrets.
          </p>
        </div>
        <Link className="btn-secondary" href="/admin/organisations">
          Open Organisations
        </Link>
      </div>

      <section className="mt-6 grid gap-3">
        {diagnostics.map((item) => (
          <article className={`rounded-lg border p-4 ${rowTone(item)}`} key={item.label}>
            <p className="text-xs font-black uppercase tracking-wide opacity-70">{item.label}</p>
            <p className="mt-2 break-words text-sm font-black sm:text-base">{item.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-black text-court-navy">Active admin_users rows returned to this session</p>
        <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(activeRows, null, 2)}</pre>
      </section>
    </main>
  );
}
