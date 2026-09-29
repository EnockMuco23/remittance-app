"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

function ShineMark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#1d1d1f]">
      <div className="h-3 w-3 rounded-full bg-white" />
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
    >
      <path d="M5 12h14" strokeLinecap="round" />
      <path
        d="m13 6 6 6-6 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-5 py-10 text-[#1d1d1f]">
      <div className="w-full max-w-[400px]">
        {/* Brand */}
        <header className="mb-8 flex justify-center">
          <div className="flex flex-col items-center gap-3">
            <ShineMark />

            <span className="text-[16px] font-semibold tracking-[-0.02em]">
              Shine Transfers
            </span>
          </div>
        </header>

        {/* Login */}
        <section className="rounded-[22px] bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.04)] sm:p-9">
          <div className="mb-8 text-center">
            <h1 className="text-[30px] font-semibold tracking-[-0.035em]">
              Sign in
            </h1>

            <p className="mt-2 text-[15px] text-[#86868b]">
              Welcome back.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-[13px] font-medium text-[#1d1d1f]"
              >
                Email
              </label>

              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 w-full rounded-[12px] bg-[#f0f0f2] px-4 text-[15px] outline-none transition-all placeholder:text-[#86868b] focus:bg-white focus:ring-2 focus:ring-[#007aff]/25"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-[13px] font-medium text-[#1d1d1f]"
              >
                Password
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 w-full rounded-[12px] bg-[#f0f0f2] px-4 text-[15px] outline-none transition-all placeholder:text-[#86868b] focus:bg-white focus:ring-2 focus:ring-[#007aff]/25"
              />
            </div>

            {message && (
              <div
                role="alert"
                className="rounded-[12px] bg-red-50 px-4 py-3 text-center text-[13px] text-red-700"
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#007aff] px-4 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  />
                  Signing in
                </>
              ) : (
                <>
                  Sign in
                  <ArrowIcon />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-[13px] text-[#86868b]">
            New here?{" "}
            <a
              href="/signup"
              className="font-medium text-[#007aff] hover:underline"
            >
              Sign up
            </a>
          </div>
        </section>

        <footer className="mt-6 text-center text-[12px] text-[#86868b]/70">
          © {new Date().getFullYear()} Shine Transfers
        </footer>
      </div>
    </main>
  );
}