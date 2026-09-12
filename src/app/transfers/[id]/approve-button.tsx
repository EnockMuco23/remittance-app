"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function ApproveTransferButton({
  transferId,
}: {
  transferId: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function approveTransfer() {
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc(
      "approve_transfer",
      {
        transfer_id: transferId,
      }
    );

    if (rpcError) {
      console.error(rpcError);
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="rounded-lg border border-gray-200 p-5">
      <h3 className="font-semibold">
        Approve Transfer
      </h3>

      <p className="mt-1 text-sm text-gray-500">
        Approve this transfer so the client payment can
        be confirmed.
      </p>

      <button
        type="button"
        onClick={approveTransfer}
        disabled={loading}
        className="mt-4 rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {loading ? "Approving..." : "Approve Transfer"}
      </button>

      {error && (
        <p className="mt-3 max-w-lg text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}