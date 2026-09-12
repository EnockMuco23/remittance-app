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
        className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:bg-gray-400"
      >
        {loading ? "Approving..." : "Approve"}
      </button>

      {error && (
        <p className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}