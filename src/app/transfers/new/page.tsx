"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Agent = {
  id: string;
  full_name: string;
};

export default function NewTransferPage() {
  const supabase = createClient();
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CAD");
  const [destinationCountry, setDestinationCountry] = useState("DRC");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");

  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadAgents() {
      const { data, error } = await supabase.rpc(
        "get_available_agents"
      );

      if (error) {
        console.error(error);
        setMessage("Failed to load available agents.");
      } else {
        setAgents(data || []);
      }

      setLoadingAgents(false);
    }

    loadAgents();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in to create a transfer.");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("transfer_requests")
      .insert({
        client_id: user.id,
        agent_id: agentId,
        amount: Number(amount),
        currency,
        destination_country: destinationCountry,
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
      });

    if (error) {
      console.error(error);
      setMessage("Failed to create transfer.");
      setLoading(false);
      return;
    }

    router.push("/transfers");
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-2xl rounded-lg bg-white p-8 shadow">
        <h1 className="text-3xl font-bold">New Transfer</h1>

        <p className="mt-2 text-gray-600">
          Enter the details of the transfer you want to send.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block font-medium">
              Choose Agent
            </label>

            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
              disabled={loadingAgents}
              className="w-full rounded border p-3"
            >
              <option value="">
                {loadingAgents
                  ? "Loading agents..."
                  : "Select an agent"}
              </option>

              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block font-medium">
              Amount
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="Enter amount"
              className="w-full rounded border p-3"
            />
          </div>

          <div>
            <label className="mb-2 block font-medium">
              Currency
            </label>

            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded border p-3"
            >
              <option value="CAD">CAD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block font-medium">
              Destination Country
            </label>

            <select
              value={destinationCountry}
              onChange={(e) =>
                setDestinationCountry(e.target.value)
              }
              className="w-full rounded border p-3"
            >
              <option value="DRC">DRC</option>
              <option value="Rwanda">Rwanda</option>
              <option value="Burundi">Burundi</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block font-medium">
              Recipient Name
            </label>

            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              required
              placeholder="Full name of recipient"
              className="w-full rounded border p-3"
            />
          </div>

          <div>
            <label className="mb-2 block font-medium">
              Recipient Phone
            </label>

            <input
              type="tel"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full rounded border p-3"
            />
          </div>

          {message && (
            <p className="text-sm text-red-600">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || loadingAgents}
            className="w-full rounded bg-black p-3 font-medium text-white disabled:opacity-50"
          >
            {loading
              ? "Submitting..."
              : "Submit Transfer Request"}
          </button>
        </form>
      </div>
    </main>
  );
}

