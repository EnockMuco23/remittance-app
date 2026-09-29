import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

type WorkforceMember = {
  id: string;
  full_name: string | null;
  role: "agent" | "paybot" | string;
  created_at: string;
};

export default async function WorkforcePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "management") {
    redirect("/dashboard");
  }

  const { data: workforce, error: workforceError } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .in("role", ["agent", "paybot"])
    .order("role", { ascending: true })
    .order("full_name", { ascending: true });

  if (workforceError) {
    throw new Error(workforceError.message);
  }

  const members = (workforce ?? []) as WorkforceMember[];

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-6 py-8 text-[#1d1d1f] md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link
            href="/management"
            className="text-sm font-medium text-[#007aff] transition-opacity hover:opacity-70"
          >
            Management
          </Link>

          <div className="mt-6">
            <h1 className="text-3xl font-semibold tracking-tight">
              Workforce
            </h1>
            <p className="mt-2 text-[#86868b]">
              Agents and paybots registered in the system.
            </p>
          </div>
        </div>

        <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
          {members.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-base font-medium">No workforce members</p>
              <p className="mt-2 text-sm text-[#86868b]">
                No agents or paybots are currently registered.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <div className="grid grid-cols-[1.5fr_1.8fr_1fr_1fr] gap-6 px-7 py-4 text-xs font-medium uppercase tracking-wide text-[#86868b]">
                  <div>Name</div>
                  <div>ID</div>
                  <div>Role</div>
                  <div>Created</div>
                </div>

                <div className="divide-y divide-[#f5f5f7]">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="grid grid-cols-[1.5fr_1.8fr_1fr_1fr] gap-6 px-7 py-5"
                    >
                      <div className="font-medium">
                        {member.full_name || "Unnamed"}
                      </div>

                      <div className="truncate text-sm text-[#86868b]">
                        {member.id}
                      </div>

                      <div className="text-sm capitalize">
                        {member.role}
                      </div>

                      <div className="text-sm text-[#86868b]">
                        {new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                        }).format(new Date(member.created_at))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-[#f5f5f7] md:hidden">
                {members.map((member) => (
                  <div key={member.id} className="px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {member.full_name || "Unnamed"}
                        </p>

                        <p className="mt-1 truncate text-xs text-[#86868b]">
                          {member.id}
                        </p>
                      </div>

                      <span className="shrink-0 text-sm capitalize text-[#86868b]">
                        {member.role}
                      </span>
                    </div>

                    <p className="mt-4 text-sm text-[#86868b]">
                      {new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium",
                      }).format(new Date(member.created_at))}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
