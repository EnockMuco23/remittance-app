import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../dashboard/logout-button";

export default async function ComplianceManagerDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    profile.role !== "compliance_manager"
  ) {
    redirect("/dashboard");
  }

  const { data: overview } =
    await supabase.rpc(
      "get_compliance_overview"
    );

  const {
    data: alerts,
    error: alertsError,
  } = await supabase
    .from("compliance_alerts")
    .select(
      `
        id,
        transfer_id,
        alert_type,
        severity,
        status,
        reason,
        created_at,
        reviewed_at,
        review_note
      `
    )
    .eq("status", "open")
    .order("created_at", {
      ascending: false,
    })
    .limit(10);

  if (alertsError) {
    console.error(
      "Compliance alerts error:",
      alertsError
    );
  }

  const {
    data: notices,
    error: noticesError,
  } = await supabase
    .from("compliance_notices")
    .select(
      `
        id,
        notice_type,
        title,
        description,
        priority,
        starts_at,
        ends_at,
        location,
        meeting_link,
        created_at
      `
    )
    .order("starts_at", {
      ascending: true,
      nullsFirst: false,
    })
    .limit(10);

  if (noticesError) {
    console.error(
      "Compliance notices error:",
      noticesError
    );
  }

  const stats =
    overview?.[0];

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

          <div>
            <p className="text-sm font-medium text-gray-500">
              Compliance & Oversight
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Compliance Manager
            </h1>

            <p className="mt-2 text-gray-600">
              Welcome, {profile.full_name}.
              Monitor Paybot activity, compliance
              alerts, disputes and internal notices.
            </p>
          </div>

          <LogoutButton />

        </div>

        {/* Overview */}
        <section className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">

          <StatCard
            label="Open Alerts"
            value={
              stats?.open_alert_count ?? 0
            }
          />

          <StatCard
            label="High Severity"
            value={
              stats?.high_severity_open_count ??
              0
            }
          />

          <StatCard
            label="High-Value Reviews"
            value={
              stats?.high_value_alert_count ??
              0
            }
          />

          <StatCard
            label="Possible Duplicates"
            value={
              stats?.duplicate_alert_count ??
              0
            }
          />

        </section>

        {/* Operational Overview */}
        <section className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">

          <StatCard
            label="Paybots"
            value={
              stats?.paybot_count ?? 0
            }
          />

          <StatCard
            label="Active Paybots"
            value={
              stats?.active_paybot_count ??
              0
            }
          />

          <StatCard
            label="Transfers Today"
            value={
              stats?.transfer_count_today ??
              0
            }
          />

          <StatCard
            label="Completed Today"
            value={
              stats?.completed_transfer_count_today ??
              0
            }
          />

        </section>

        {/* Main Sections */}
        <section className="mt-6 grid gap-6 lg:grid-cols-2">

          {/* Alerts */}
          <div className="rounded-xl bg-white p-6 shadow-sm">

            <div className="flex items-start justify-between">

              <div>
                <h2 className="text-xl font-bold">
                  Compliance Alerts
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Items requiring human review.
                </p>
              </div>

              <Link
                href="/compliance-manager/alerts"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                View All
              </Link>

            </div>

            <div className="mt-6 space-y-3">

              {!alerts ||
              alerts.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
                  <p className="text-sm text-gray-500">
                    No open compliance alerts.
                  </p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-lg border border-gray-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">

                      <div>
                        <p className="font-semibold capitalize">
                          {formatLabel(
                            alert.alert_type
                          )}
                        </p>

                        <p className="mt-1 text-sm text-gray-600">
                          {alert.reason}
                        </p>
                      </div>

                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize">
                        {alert.severity}
                      </span>

                    </div>

                    <div className="mt-3 text-xs text-gray-400">
                      {new Date(
                        alert.created_at
                      ).toLocaleString()}
                    </div>
                  </div>
                ))
              )}

            </div>

          </div>

          {/* Notices */}
          <div className="rounded-xl bg-white p-6 shadow-sm">

            <div className="flex items-start justify-between">

              <div>
                <h2 className="text-xl font-bold">
                  Notices & Meetings
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Internal compliance communications.
                </p>
              </div>

              <Link
                href="/compliance-manager/notices"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Manage
              </Link>

            </div>

            <div className="mt-6 space-y-3">

              {!notices ||
              notices.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
                  <p className="text-sm text-gray-500">
                    No notices or meetings yet.
                  </p>
                </div>
              ) : (
                notices.map((notice) => (
                  <div
                    key={notice.id}
                    className="rounded-lg border border-gray-200 p-4"
                  >

                    <div className="flex items-start justify-between gap-4">

                      <div>
                        <p className="font-semibold">
                          {notice.title}
                        </p>

                        <p className="mt-1 text-xs capitalize text-gray-500">
                          {notice.notice_type}
                        </p>
                      </div>

                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs capitalize">
                        {notice.priority}
                      </span>

                    </div>

                    {notice.starts_at && (
                      <p className="mt-3 text-sm text-gray-600">
                        {new Date(
                          notice.starts_at
                        ).toLocaleString()}
                      </p>
                    )}

                    {notice.location && (
                      <p className="mt-1 text-sm text-gray-500">
                        Location:{" "}
                        {notice.location}
                      </p>
                    )}

                    {notice.meeting_link && (
                      <a
                        href={notice.meeting_link}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
                      >
                        Open meeting link →
                      </a>
                    )}

                  </div>
                ))
              )}

            </div>

          </div>

        </section>

        {/* Compliance Functions */}
        <section className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">

          <Link
            href="/compliance-manager/alerts"
            className="rounded-xl bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <h3 className="font-bold">
              Alerts
            </h3>

            <p className="mt-2 text-sm text-gray-500">
              Review high-value and possible
              duplicate transactions.
            </p>
          </Link>

          <Link
            href="/compliance-manager/notices"
            className="rounded-xl bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <h3 className="font-bold">
              Meetings & Notices
            </h3>

            <p className="mt-2 text-sm text-gray-500">
              Issue meetings, announcements,
              reminders and compliance requests.
            </p>
          </Link>

          <Link
            href="/compliance-manager/paybots"
            className="rounded-xl bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <h3 className="font-bold">
              Paybot Monitoring
            </h3>

            <p className="mt-2 text-sm text-gray-500">
              Monitor Paybot activity and
              operational performance.
            </p>
          </Link>

          <Link
            href="/compliance-manager/disputes"
            className="rounded-xl bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <h3 className="font-bold">
              Disputes & Complaints
            </h3>

            <p className="mt-2 text-sm text-gray-500">
              Manage customer and operational
              complaints.
            </p>
          </Link>

        </section>

      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-bold">
        {value}
      </p>
    </div>
  );
}

function formatLabel(
  value: string
) {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}