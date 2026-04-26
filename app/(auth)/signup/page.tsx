"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { signUpEmail, signInGoogle } from "@/lib/auth/actions";
import { authErrorToMessage } from "@/lib/auth/errors";

const Schema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string().min(8),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });
type FormValues = z.infer<typeof Schema>;

export default function SignupPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { email: "", password: "", confirm: "" },
  });

  async function onSubmit(values: FormValues) {
    setBusy(true);
    try {
      await signUpEmail(values.email, values.password);
      toast.success("Account created.");
      router.push("/dashboard");
    } catch (err) {
      toast.error(authErrorToMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    try {
      await signInGoogle();
      toast.success("Signed in.");
      router.push("/dashboard");
    } catch (err) {
      toast.error(authErrorToMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card stack animate-fade-in-up">
      <header className="stack-sm animate-fade-in-up delay-100">
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700 }}>
          Create your Nexus account
        </h1>
        <p className="muted-text" style={{ lineHeight: 1.6 }}>
          Only NGOs and organizations can register. You&apos;ll verify government docs next.
        </p>
      </header>

      <div className="animate-fade-in-up delay-200">
        <GoogleButton onClick={onGoogle} disabled={busy} label="Sign up with Google" />
      </div>
      <div className="divider-with-text animate-fade-in-up delay-200">or</div>

      <form onSubmit={handleSubmit(onSubmit)} className="stack animate-fade-in-up delay-300">
        <div className="form-row">
          <label htmlFor="email" className="label">Work email</label>
          <input id="email" type="email" autoComplete="email" className="input"
                 {...register("email")} />
          {formState.errors.email && (
            <span className="error-text">{formState.errors.email.message}</span>
          )}
        </div>

        <div className="form-row">
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" autoComplete="new-password" className="input"
                 {...register("password")} />
          {formState.errors.password && (
            <span className="error-text">{formState.errors.password.message}</span>
          )}
        </div>

        <div className="form-row">
          <label htmlFor="confirm" className="label">Confirm password</label>
          <input id="confirm" type="password" autoComplete="new-password" className="input"
                 {...register("confirm")} />
          {formState.errors.confirm && (
            <span className="error-text">{formState.errors.confirm.message}</span>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="muted-text animate-fade-in-up delay-400" style={{ textAlign: "center", marginTop: "12px" }}>
        Already have one? <Link href="/login" style={{ fontWeight: 600, color: "var(--color-primary)" }}>Sign in</Link>
      </p>
    </div>
  );
}
