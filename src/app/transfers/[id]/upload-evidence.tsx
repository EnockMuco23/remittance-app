"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type UploadEvidenceProps = {
  transferId: string;
};

export default function UploadEvidence({
  transferId,
}: UploadEvidenceProps) {
  const supabase = createClient();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleUpload() {
    if (!file) {
      setMessage("Please select an image first.");
      return;
    }

    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in.");
      setLoading(false);
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      setMessage(
        "Only JPG and PNG images are allowed."
      );
      setLoading(false);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage(
        "The image must be smaller than 10 MB."
      );
      setLoading(false);
      return;
    }

    const fileExtension = file.name
      .split(".")
      .pop()
      ?.toLowerCase();

    if (!fileExtension) {
      setMessage("Could not determine the file type.");
      setLoading(false);
      return;
    }

    const storagePath =
      `transactions/${transferId}/agent/${crypto.randomUUID()}.${fileExtension}`;

    const { error: uploadError } =
      await supabase.storage
        .from("transaction-evidence")
        .upload(storagePath, file);

    if (uploadError) {
      console.error(uploadError);
      setMessage(uploadError.message);
      setLoading(false);
      return;
    }

    const { error: registerError } =
      await supabase.rpc(
        "register_agent_evidence",
        {
          p_transfer_id: transferId,
          p_file_name: file.name,
          p_file_type: file.type,
          p_storage_path: storagePath,
        }
      );

    if (registerError) {
      console.error(registerError);

      await supabase.storage
        .from("transaction-evidence")
        .remove([storagePath]);

      setMessage(registerError.message);
      setLoading(false);
      return;
    }

    setFile(null);
    setMessage(
      "Payment proof uploaded successfully."
    );
    setLoading(false);

    router.refresh();
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200 p-5">
      <h3 className="font-semibold">
        Payment Proof
      </h3>

      <p className="mt-1 text-sm text-gray-500">
        Upload the screenshot confirming the Interac
        payment.
      </p>

      <div className="mt-4">
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(event) => {
            setFile(
              event.target.files?.[0] ?? null
            );
            setMessage("");
          }}
          disabled={loading}
        />
      </div>

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || loading}
        className="mt-4 rounded bg-black px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? "Uploading..."
          : "Upload Payment Proof"}
      </button>

      {message && (
        <p className="mt-3 text-sm text-gray-600">
          {message}
        </p>
      )}
    </div>
  );
}