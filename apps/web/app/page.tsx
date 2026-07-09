"use client";

import { WorkspaceApp } from "../components/app/workspace-app";
import { AuthGate } from "../components/auth/auth-gate";

export default function HomePage() {
  return (
    <AuthGate>
      <WorkspaceApp />
    </AuthGate>
  );
}
