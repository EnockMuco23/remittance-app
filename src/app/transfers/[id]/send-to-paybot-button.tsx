"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type SendToPaybotButtonProps = {
  transferId: string;
  disabled?: boolean;
};

export default function SendToPaybotButton({
  transferId,
  disabled = false,
}: SendToPaybotButtonProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendToPaybot() {
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc(
      "send_to_paybot",
      {
        p_transfer_id: transferId,
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
    <div>
      <button
        type="button"
        onClick={sendToPaybot}
        disabled={disabled || loading}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {loading
          ? "Sending..."
          : "Send to Paybot"}
      </button>

      {error && (
        <p className="mt-3 max-w-lg text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}