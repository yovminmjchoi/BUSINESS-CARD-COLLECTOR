"use client";

import { useEffect, useState, type FormEvent } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [linkError, setLinkError] = useState("");

  // 콜백에서 넘어온 로그인 링크 오류 표시
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) {
      setLinkError(
        err === "auth"
          ? "로그인 링크가 만료되었거나 유효하지 않습니다. 다시 요청하세요."
          : `로그인 실패: ${err}`,
      );
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "오류가 발생했습니다.");
        return;
      }
      setStatus("sent");
      setMessage(data.message);
    } catch {
      setStatus("error");
      setMessage("네트워크 오류. 잠시 후 다시 시도하세요.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">명함 정리</h1>
        <p className="mt-1 text-sm text-gray-500">
          등록된 이메일로 로그인 링크를 보냅니다.
        </p>
      </div>

      {linkError && (
        <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700">
          {linkError}
        </div>
      )}

      {status === "sent" ? (
        <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-800">
          {message}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="이메일 주소"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-gray-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {status === "sending" ? "보내는 중…" : "로그인 링크 받기"}
          </button>
          {status === "error" && (
            <p className="text-center text-sm text-red-600">{message}</p>
          )}
        </form>
      )}
    </main>
  );
}
