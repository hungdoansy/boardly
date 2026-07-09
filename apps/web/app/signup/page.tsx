"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthForm } from "../../components/auth/auth-form";
import { useRedirectIfAuthenticated } from "../../components/auth/auth-gate";
import { apiClient } from "../../lib/api-client";

export default function SignupPage() {
  const router = useRouter();
  useRedirectIfAuthenticated();

  return (
    <AuthForm
      title="Create your Boardly account"
      submitLabel="Create account"
      onSubmit={async ({ email, password }) => {
        const created = await apiClient.signup(email, password);
        if (!created.ok) return created.error ?? "Something went wrong";
        // Uniform signup response means we can't tell if the email already
        // existed; attempt login to establish the session either way.
        const loggedIn = await apiClient.login(email, password);
        if (!loggedIn.ok) return loggedIn.error ?? "Something went wrong";
        router.replace("/");
        return null;
      }}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-fg underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    />
  );
}
