import Link from "next/link";
import { Surface } from "@heroui/react";

export default function BlockedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Surface className="w-full max-w-sm rounded-3xl p-6 text-center">
        <h1 className="text-lg font-semibold">Access not authorized</h1>
        <p className="mt-2 text-sm text-muted">
          This email is not authorized to access the Jaipur Rugs Foundation admin panel. Contact
          your administrator if you believe this is a mistake.
        </p>
        <Link className="mt-4 inline-block text-sm text-link" href="/auth/login">
          Back to sign in
        </Link>
      </Surface>
    </div>
  );
}
