import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "../../dashboard/logout-button";
import CreateNoticeForm from "./create-notice-form";

export default async function ComplianceNoticesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } =
    await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

  if (
    !profile ||
    profile.role !== "compliance_manager"
  ) {
    redirect("/dashboard");
  }

  const { data: notices } =
    await supabase
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
      .order("created_at", {
        ascending: false,
      });

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-7xl">

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

          <div>
            <Link
              href="/compliance-manager"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              ← Back to Compliance
            </Link>

            <h1 className="mt-3 text-3xl font-bold">
              Meetings & Notices
            </h1>

            <p className="mt-2 text-gray-600">
              Issue meetings, announcements,
              reminders and compliance requests.
            </p>
          </div>

          <LogoutButton />

        </div>

        {/* Create */}
        <section className="mt-8 rounded-xl bg-white p-8 shadow-sm">

          <h2 className="text-2xl font-bold">
            Create Notice
          </h2>

          <p className="mt-1 text-gray-600">
            Send a notice to one or more workforce
            groups.
          </p>

          <div className="mt-6">
            <CreateNoticeForm />
          </div>

        </section>

        {/* History */}
        <section className="mt-8 rounded-xl bg-white p-8 shadow-sm">

          <h2 className="text-2xl font-bold">
            Issued Notices
          </h2>

          <p className="mt-1 text-gray-600">
            Previously issued compliance notices
            and meetings.
          </p>

          <div className="mt-6 space-y-4">

            {!notices ||
            notices.length === 0 ? (
              <div className="rounded-lg border bg-gray-50 p-6">
                <p className="text-sm text-gray-500">
                  No notices have been issued.
                </p>
              </div>
            ) : (
              notices.map((notice) => (
                <div
                  key={notice.id}
                  className="rounded-lg border p-5"
                >

                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">

                    <div>
                      <h3 className="font-bold">
                        {notice.title}
                      </h3>

                      <p className="mt-1 text-xs capitalize text-gray-500">
                        {notice.notice_type}
                      </p>
                    </div>

                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs capitalize">
                      {notice.priority}
                    </span>

                  </div>

                  {notice.description && (
                    <p className="mt-4 text-sm text-gray-600">
                      {notice.description}
                    </p>
                  )}

                  {notice.starts_at && (
                    <p className="mt-4 text-sm">
                      <span className="font-medium">
                        Date:
                      </span>{" "}
                      {new Date(
                        notice.starts_at
                      ).toLocaleString()}
                    </p>
                  )}

                  {notice.location && (
                    <p className="mt-1 text-sm text-gray-600">
                      <span className="font-medium">
                        Location:
                      </span>{" "}
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

        </section>

      </div>
    </main>
  );
}