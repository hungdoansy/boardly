"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthForm } from "../../components/auth/auth-form";
import { useRedirectIfAuthenticated } from "../../components/auth/auth-gate";
import { apiClient } from "../../lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  useRedirectIfAuthenticated();

  return (
    <AuthForm
      title="Sign in to Boardly"
      submitLabel="Sign in"
      onSubmit={async ({ email, password }) => {
        const result = await apiClient.login(email, password);
        if (!result.ok) return result.error ?? "Something went wrong";
        router.replace("/");
        return null;
      }}
      footer={
        <>
          New to Boardly?{" "}
          <Link href="/signup" className="text-fg underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    />
  );
}
