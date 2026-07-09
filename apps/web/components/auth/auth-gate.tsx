"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";

import { apiClient } from "../../lib/api-client";
import { useAuthSession } from "../../lib/auth-store";

/** Run the silent-refresh bootstrap exactly once per mount. */
function useBootstrapOnce(): void {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void apiClient.bootstrap();
  }, []);
}

function FullScreenSpinner() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div
        aria-label="Loading"
        className="size-5 animate-spin rounded-full border-2 border-line border-t-fg-muted"
      />
    </div>
  );
}

/** Gates the app: unauthenticated visitors are sent to /login. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuthSession();
  const router = useRouter();
  useBootstrapOnce();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return <FullScreenSpinner />;
  return <>{children}</>;
}

/** For the login/signup pages: an already-authenticated visitor goes to the app. */
export function useRedirectIfAuthenticated(): void {
  const { status } = useAuthSession();
  const router = useRouter();
  useBootstrapOnce();
  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);
}
