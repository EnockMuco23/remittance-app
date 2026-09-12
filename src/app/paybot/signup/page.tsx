"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const countries = [
  "Democratic Republic of the Congo",
  "Rwanda",
  "Burundi",
  "Uganda",
  "Kenya",
  "Tanzania",
];

export default function PaybotSignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleCountry(country: string) {
    setSelectedCountries((current) =>
      current.includes(country)
        ? current.filter((item) => item !== country)
        : [...current, country]
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();

    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (signupError || !data.user) {
      setError(signupError?.message || "Unable to create account.");
      setLoading(false);
      return;
    }

    const { error: registrationError } = await supabase
      .from("paybot_registrations")
      .insert({
        user_id: data.user.id,
        full_name: fullName,
        email,
        requested_countries: selectedCountries,
      });

    if (registrationError) {
      setError(registrationError.message);
      setLoading(false);
      return;
    }

    router.push("/paybot/signup/success");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-lg rounded-lg bg-white p-8 shadow">
        <h1 className="text-3xl font-bold">Paybot Registration</h1>

        <p className="mt-2 text-gray-600">
          Register to become a Paybot. Your application must be approved by
          management.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="block text-sm font-medium">
              Full Name
            </label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded border p-3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">
              Email
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border p-3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">
              Password
            </label>
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border p-3"
            />
          </div>

          <div>
            <p className="text-sm font-medium">
              Countries of Operation
            </p>

            <div className="mt-2 space-y-2">
              {countries.map((country) => (
                <label key={country} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedCountries.includes(country)}
                    onChange={() => toggleCountry(country)}
                  />
                  {country}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded bg-red-50 p-3 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || selectedCountries.length === 0}
            className="w-full rounded bg-black px-4 py-3 text-white disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? "Submitting..." : "Submit Registration"}
          </button>
        </form>
      </div>
    </main>
  );
}