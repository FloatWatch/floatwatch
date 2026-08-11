import { redirect } from "next/navigation";

function sanitizeReturnPath(raw: string | null) {
  if (!raw) return "/auth";
  if (!raw.startsWith("/")) return "/auth";
  if (raw.startsWith("//")) return "/auth";
  return raw;
}

export default function AuthLoginPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | undefined };
}) {
  const returnTo = sanitizeReturnPath(searchParams?.return ?? null);
  const query = returnTo === "/auth" ? "" : `&return=${encodeURIComponent(returnTo)}`;
  redirect(`/auth?login=1${query}`);
}
