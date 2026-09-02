"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicHome } from "@/components/public-home";

export default function Home() {
  const router = useRouter();
  const [showSubpage, setShowSubpage] = useState(false);

  useEffect(() => {
    if (window.location.hash) {
      setShowSubpage(true);
      return;
    }
    router.replace("/auth");
  }, [router]);

  if (!showSubpage) return null;
  return <PublicHome onLogin={() => router.push("/auth?login=1")} />;
}
