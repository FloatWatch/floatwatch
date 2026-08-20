"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { AuthScreen } from "../../components/auth-screen";
import { Dashboard } from "@/components/dashboard";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { type PublicView } from "@/components/public-page-header";
import { type WorkspaceView } from "@/components/workspace-sections";
import { FloatWatchChat } from "@/components/floatwatch-chat";

export const dynamic = "force-dynamic";

function sanitizeReturnPath(raw: string | null) {
  if (!raw) return "/auth";
  if (!raw.startsWith("/")) return "/auth";
  if (raw.startsWith("//")) return "/auth";
  return raw;
}

function parseEntryView(raw: string | null): WorkspaceView | null {
  const views: WorkspaceView[] = ["home", "overview", "development", "analysis", "records", "compare", "free", "bug", "inquiry", "faq", "notice", "admin"];
  return views.includes(raw as WorkspaceView) ? raw as WorkspaceView : null;
}

export default function AuthPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [returnTo, setReturnTo] = useState("/auth");
  const [openLoginPanel, setOpenLoginPanel] = useState(false);
  const [entryView, setEntryView] = useState<WorkspaceView | null>(null);
  const [oauthError, setOauthError] = useState("");
  const [publicView, setPublicView] = useState<"home" | "overview" | "development" | "notice" | "community" | "bug" | "faq">("home");
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextReturnTo = sanitizeReturnPath(params.get("return"));
    const nextOpenLoginPanel = params.get("login") === "1";
    const nextEntryView = parseEntryView(params.get("workspace") ?? params.get("entry"));
    const nextOauthError = params.get("oauth_error") ?? "";
    const requestedView = params.get("view");
    const publicViews = ["overview", "development", "notice", "community", "bug", "faq"] as const;
    const nextPublicView = publicViews.includes(requestedView as typeof publicViews[number]) ? requestedView as typeof publicViews[number] : "home";
    setOpenLoginPanel(nextOpenLoginPanel);
    setReturnTo(nextReturnTo);
    setEntryView(nextEntryView);
    setOauthError(nextOauthError);
    setPublicView(nextPublicView);

    api<User>("/auth/me")
      .then((nextUser) => {
        setUser(nextUser);
        if (nextReturnTo !== "/auth") {
          router.replace(nextReturnTo);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    function restorePublicLocation() {
      const params = new URLSearchParams(window.location.search);
      const requestedView = params.get("view");
      const publicViews = ["overview", "development", "notice", "community", "bug", "faq"] as const;
      setPublicView(publicViews.includes(requestedView as typeof publicViews[number]) ? requestedView as typeof publicViews[number] : "home");
      setOpenLoginPanel(params.get("login") === "1");
    }
    window.addEventListener("popstate", restorePublicLocation);
    return () => window.removeEventListener("popstate", restorePublicLocation);
  }, []);

  function buildAuthLoginHref(entry?: WorkspaceView | null) {
    const base = "/auth?login=1";
    const loginParams = new URLSearchParams();
    loginParams.set("login", "1");
    if (returnTo !== "/auth") {
      loginParams.set("return", returnTo);
    }
    if (entry) {
      loginParams.set("entry", entry);
    }
    if (publicView !== "home") {
      loginParams.set("view", publicView);
    }
    return `/auth?${loginParams.toString()}`;
  }

  function openLoginPanelView(entry?: WorkspaceView | null) {
    setOpenLoginPanel(true);
    router.push(buildAuthLoginHref(entry), { scroll: false });
  }

  if (loading) {
    return (
      <main className="boot-screen">
        <LoaderCircle className="spin" size={28} />
        <span>로그인 상태를 확인하는 중입니다.</span>
      </main>
    );
  }

  if (user) {
    return <><Dashboard
      user={user}
      onUserUpdated={setUser}
      onLogout={() => {
        setUser(null);
        setOpenLoginPanel(false);
        router.replace("/auth");
      }}
      initialView={entryView ?? "home"}
    /><FloatWatchChat loggedIn/></>;
  }

  return (
    <><AuthScreen
      initialPanelCollapsed={!openLoginPanel}
      isPanelOpen={openLoginPanel}
      externalError={oauthError}
      contentView={publicView}
        onSuccess={(nextUser) => {
          setUser(nextUser);
          if (returnTo !== "/auth") {
            router.replace(returnTo);
            return;
          }
          if (entryView) {
            router.replace(`/auth?entry=${entryView}`);
          }
        }}
      onBack={() => {
        setOpenLoginPanel(false);
        router.push("/auth");
      }}
      onHeaderNavigate={(view: PublicView) => {
        setOpenLoginPanel(false);
        if (view === "home") {
          setPublicView("home");
          router.push("/auth");
          return;
        }
        if (view === "overview") {
          setPublicView("overview");
          router.push("/auth?view=overview");
          return;
        }
        if (view === "development") {
          setPublicView("development");
          router.push("/auth?view=development");
          return;
        }
        if (view === "notice" || view === "community" || view === "bug" || view === "faq") {
          setPublicView(view);
          router.push(`/auth?view=${view}`);
          return;
        }
        router.replace(`/#${view}`);
      }}
        onHeaderLogin={() => openLoginPanelView()}
        onStartAnalysis={() => openLoginPanelView("analysis")}
        showPanelToggle={false}
      /><FloatWatchChat loggedIn={false}/></>
  );
}
