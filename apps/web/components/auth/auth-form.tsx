"use client";

import { Button } from "@boardly/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { LayoutGrid } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

export type AuthFormValues = z.infer<typeof schema>;

export interface AuthFormProps {
  title: string;
  submitLabel: string;
  /** Return a user-safe error string to display, or null on success. */
  onSubmit: (values: AuthFormValues) => Promise<string | null>;
  footer: React.ReactNode;
}

export function AuthForm({ title, submitLabel, onSubmit, footer }: AuthFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async (values) => {
    const error = await onSubmit(values);
    if (error) setError("root", { message: error });
  });

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-primary text-primary-foreground">
            <LayoutGrid className="size-4.5" />
          </div>
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-fg">{title}</h1>
        </div>

        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <Field label="Email" error={errors.email?.message}>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              aria-label="Email"
              className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-elevated px-2.5 text-base text-fg outline-none transition-[box-shadow,border-color] placeholder:text-fg-faint focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              placeholder="you@example.com"
              {...register("email")}
            />
          </Field>

          <Field label="Password" error={errors.password?.message}>
            <input
              type="password"
              autoComplete="current-password"
              aria-label="Password"
              className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-elevated px-2.5 text-base text-fg outline-none transition-[box-shadow,border-color] placeholder:text-fg-faint focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              placeholder="••••••••"
              {...register("password")}
            />
          </Field>

          {errors.root?.message ? (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {errors.root.message}
            </p>
          ) : null}

          <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
            {isSubmitting ? "Please wait…" : submitLabel}
          </Button>
        </form>

        <p className="text-center text-sm text-fg-muted">{footer}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-fg-muted">{label}</span>
      {children}
      {error ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
    </label>
  );
}
