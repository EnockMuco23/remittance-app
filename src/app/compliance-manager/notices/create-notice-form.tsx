"use client";

import {
  FormEvent,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase";

const RECIPIENT_ROLES = [
  {
    value: "agent",
    label: "Agents",
  },
  {
    value: "paybot",
    label: "Paybots",
  },
  {
    value: "auditor",
    label: "Auditors",
  },
  {
    value: "management",
    label: "Management",
  },
  {
    value: "analyst",
    label: "Analysts",
  },
];

export default function CreateNoticeForm() {
  const router = useRouter();

  const [noticeType, setNoticeType] =
    useState("meeting");

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [priority, setPriority] =
    useState("normal");

  const [startsAt, setStartsAt] =
    useState("");

  const [endsAt, setEndsAt] =
    useState("");

  const [location, setLocation] =
    useState("");

  const [meetingLink, setMeetingLink] =
    useState("");

  const [roles, setRoles] =
    useState<string[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  function toggleRole(role: string) {
    setRoles((current) =>
      current.includes(role)
        ? current.filter(
            (item) => item !== role
          )
        : [...current, role]
    );
  }

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setSuccess("");

    if (roles.length === 0) {
      setError(
        "Select at least one recipient group."
      );
      setLoading(false);
      return;
    }

    if (
      noticeType === "meeting" &&
      !location &&
      !meetingLink
    ) {
      setError(
        "For a meeting, provide either a physical location or a meeting link."
      );
      setLoading(false);
      return;
    }

    if (
      meetingLink &&
      !/^https?:\/\//i.test(
        meetingLink
      )
    ) {
      setError(
        "Meeting links must begin with http:// or https://."
      );
      setLoading(false);
      return;
    }

    if (
      startsAt &&
      endsAt &&
      new Date(endsAt) <=
        new Date(startsAt)
    ) {
      setError(
        "The end time must be after the start time."
      );
      setLoading(false);
      return;
    }

    const supabase =
      createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError(
        "Your session has expired. Please log in again."
      );
      setLoading(false);
      return;
    }

    const { error: createError } =
      await supabase.rpc(
        "create_compliance_notice",
        {
          p_notice_type: noticeType,
          p_title: title,
          p_description:
            description || null,
          p_priority: priority,
          p_starts_at:
            startsAt
              ? new Date(
                  startsAt
                ).toISOString()
              : null,
          p_ends_at:
            endsAt
              ? new Date(
                  endsAt
                ).toISOString()
              : null,
          p_location:
            location || null,
          p_meeting_link:
            meetingLink || null,
          p_recipient_roles:
            roles,
          p_recipient_ids: [],
        }
      );

    if (createError) {
      setError(
        createError.message
      );
      setLoading(false);
      return;
    }

    setSuccess(
      "The notice was issued successfully."
    );

    setTitle("");
    setDescription("");
    setStartsAt("");
    setEndsAt("");
    setLocation("");
    setMeetingLink("");
    setRoles([]);

    setLoading(false);

    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
    >

      {/* Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Notice Type
        </label>

        <select
          value={noticeType}
          onChange={(event) =>
            setNoticeType(
              event.target.value
            )
          }
          disabled={loading}
          className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
        >
          <option value="meeting">
            Meeting
          </option>

          <option value="announcement">
            Announcement
          </option>

          <option value="reminder">
            Reminder
          </option>

          <option value="compliance_request">
            Compliance Request
          </option>
        </select>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Title
        </label>

        <input
          type="text"
          value={title}
          onChange={(event) =>
            setTitle(
              event.target.value
            )
          }
          required
          disabled={loading}
          maxLength={200}
          placeholder="Monthly Compliance Meeting"
          className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description / Agenda
        </label>

        <textarea
          value={description}
          onChange={(event) =>
            setDescription(
              event.target.value
            )
          }
          disabled={loading}
          rows={5}
          placeholder="Explain the purpose, agenda or instructions..."
          className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
        />
      </div>

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Priority
        </label>

        <select
          value={priority}
          onChange={(event) =>
            setPriority(
              event.target.value
            )
          }
          disabled={loading}
          className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
        >
          <option value="normal">
            Normal
          </option>

          <option value="important">
            Important
          </option>

          <option value="urgent">
            Urgent
          </option>
        </select>
      </div>

      {/* Date */}
      <div className="grid gap-5 md:grid-cols-2">

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Start
          </label>

          <input
            type="datetime-local"
            value={startsAt}
            onChange={(event) =>
              setStartsAt(
                event.target.value
              )
            }
            disabled={loading}
            className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            End
          </label>

          <input
            type="datetime-local"
            value={endsAt}
            onChange={(event) =>
              setEndsAt(
                event.target.value
              )
            }
            disabled={loading}
            className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
        </div>

      </div>

      {/* Meeting Details */}
      {noticeType === "meeting" && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">

          <h3 className="font-bold">
            Meeting Details
          </h3>

          <p className="mt-1 text-sm text-gray-500">
            The meeting can happen at the office
            or online.
          </p>

          <div className="mt-5 space-y-5">

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Office / Physical Location
              </label>

              <input
                type="text"
                value={location}
                onChange={(event) =>
                  setLocation(
                    event.target.value
                  )
                }
                disabled={loading}
                placeholder="Main Office — Conference Room"
                className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Google Meet / Zoom Link
              </label>

              <input
                type="url"
                value={meetingLink}
                onChange={(event) =>
                  setMeetingLink(
                    event.target.value
                  )
                }
                disabled={loading}
                placeholder="https://meet.google.com/..."
                className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
              />
            </div>

            <p className="text-xs text-gray-500">
              Provide either a physical location,
              an online meeting link, or both.
            </p>

          </div>
        </div>
      )}

      {/* Recipients */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Recipients
        </label>

        <p className="mt-1 text-sm text-gray-500">
          Select the workforce groups that should
          receive this notice.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">

          {RECIPIENT_ROLES.map(
            (role) => (
              <label
                key={role.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition ${
                  roles.includes(
                    role.value
                  )
                    ? "border-black bg-gray-50"
                    : "border-gray-200 bg-white"
                }`}
              >

                <input
                  type="checkbox"
                  checked={roles.includes(
                    role.value
                  )}
                  onChange={() =>
                    toggleRole(
                      role.value
                    )
                  }
                  disabled={loading}
                  className="h-4 w-4"
                />

                <span className="text-sm font-medium">
                  {role.label}
                </span>

              </label>
            )
          )}

        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            {error}
          </p>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-700">
            {success}
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {loading
          ? "Issuing..."
          : "Issue Notice"}
      </button>

    </form>
  );
}