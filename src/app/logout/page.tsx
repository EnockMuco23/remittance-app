"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LogoutPage() {
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function logout() {
      await supabase.auth.signOut();
      router.push("/login");
    }

    logout();
  }, [router, supabase]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p>Logging out...</p>
    </main>
  );
}