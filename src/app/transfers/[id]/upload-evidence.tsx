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
  const [messageType, setMessageType] = useState<
    "success" | "error" | ""
  >("");

  async function handleUpload() {
    if (!file) {
      setMessage("Please select a payment proof image first.");
      setMessageType("error");
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("");

    try {
      // --------------------------------------------------------
      // Check authentication
      // --------------------------------------------------------

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("You must be logged in.");
      }

      // --------------------------------------------------------
      // Validate file type
      // --------------------------------------------------------

      const allowedTypes = [
        "image/jpeg",
        "image/png",
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error(
          "Only JPG and PNG images are allowed."
        );
      }

      // --------------------------------------------------------
      // Validate file size
      // --------------------------------------------------------

      const maxFileSize = 10 * 1024 * 1024; // 10 MB

      if (file.size > maxFileSize) {
        throw new Error(
          "The image is too large. Maximum size is 10 MB."
        );
      }

      // --------------------------------------------------------
      // Get safe file extension
      // --------------------------------------------------------

      const fileExtension =
        file.name.split(".").pop()?.toLowerCase() || "jpg";

      const safeFileExtension =
        fileExtension === "jpeg" ||
        fileExtension === "jpg" ||
        fileExtension === "png"
          ? fileExtension
          : "jpg";

      // --------------------------------------------------------
      // Create private storage path
      // --------------------------------------------------------

      const storagePath =
        `transactions/${transferId}/agent/${crypto.randomUUID()}.${safeFileExtension}`;

      // --------------------------------------------------------
      // Upload evidence to private bucket
      // --------------------------------------------------------

      const { error: uploadError } = await supabase.storage
        .from("transaction-evidence")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        console.error(
          "Agent evidence upload error:",
          uploadError
        );

        throw new Error(
          `Upload failed: ${uploadError.message}`
        );
      }

      // --------------------------------------------------------
      // Register evidence in database
      // --------------------------------------------------------

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
        console.error(
          "Agent evidence registration error:",
          registerError
        );

        // Database registration failed, so remove the
        // orphaned storage file.
        const { error: removeError } =
          await supabase.storage
            .from("transaction-evidence")
            .remove([storagePath]);

        if (removeError) {
          console.error(
            "Failed to remove orphaned evidence file:",
            removeError
          );
        }

        throw new Error(
          `Evidence registration failed: ${registerError.message}`
        );
      }

      // --------------------------------------------------------
      // Success
      // --------------------------------------------------------

      setFile(null);
      setMessage(
        "Client payment proof uploaded successfully."
      );
      setMessageType("success");

      // Refresh the Server Component so the latest
      // transaction/evidence state is displayed.
      router.refresh();
    } catch (error) {
      console.error(
        "Payment evidence upload failed:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while uploading the payment proof."
      );

      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5">
      <h3 className="font-semibold text-gray-900">
        Client Payment Evidence
      </h3>

      <p className="mt-1 text-sm text-gray-500">
        Upload the screenshot or image confirming that the
        client has sent the required funds.
      </p>

      <div className="mt-4">
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(event) => {
            const selectedFile =
              event.target.files?.[0] || null;

            setFile(selectedFile);
            setMessage("");
            setMessageType("");
          }}
          disabled={loading}
          className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800 disabled:opacity-50"
        />
      </div>

      {file && (
        <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
          <p className="text-sm font-medium text-gray-800">
            Selected file
          </p>

          <p className="mt-1 break-all text-xs text-gray-500">
            {file.name}
          </p>

          <p className="mt-1 text-xs text-gray-400">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || loading}
        className="mt-4 rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {loading
          ? "Uploading..."
          : "Upload Payment Proof"}
      </button>

      {message && (
        <div
          className={`mt-4 rounded-md border p-3 text-sm ${
            messageType === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}

