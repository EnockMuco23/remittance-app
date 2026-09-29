"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function ApprovePaybotButton({
  registrationId,
}: {
  registrationId: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function approvePaybot() {
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { error: approvalError } = await supabase.rpc(
      "approve_paybot_registration",
      {
        p_registration_id: registrationId,
      }
    );

    if (approvalError) {
      setError(approvalError.message);
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <button
        onClick={approvePaybot}
        disabled={loading}
        className="rounded-xl bg-[#007aff] px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? "Approving..." : "Approve"}
      </button>

      {error && (
        <p className="mt-2 max-w-[220px] text-xs text-[#ff3b30]">
          {error}
        </p>
      )}
    </div>
  );
}