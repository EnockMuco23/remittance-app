"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function ClaimTransferButton({
  transferId,
}: {
  transferId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function claimTransfer() {
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { error: claimError } = await supabase.rpc(
      "paybot_accept_transfer",
      {
        p_transfer_id: transferId,
      }
    );

    if (claimError) {
      setError(claimError.message);
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <button
        onClick={claimTransfer}
        disabled={loading}
        className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:bg-gray-400"
      >
        {loading ? "Claiming..." : "Claim Transfer"}
      </button>

      {error && (
        <p className="mt-2 max-w-xs text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}