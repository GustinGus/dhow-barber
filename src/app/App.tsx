import { useEffect, useState } from "react";
import BookingFlow from "@/features/booking/BookingFlow";
import PublicLandingPage from "@/features/public/PublicLandingPage";
import {
  getHashRoute,
  getLegacyPageUrl,
  getLegacySectionId,
  isLegacyRoute,
  replaceLocation,
} from "./legacy-routes";

interface AppProps {
  navigate?: (url: string) => void;
}

export default function App({ navigate = replaceLocation }: AppProps) {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  const legacyRoute = isLegacyRoute(hash);
  const sectionId = getLegacySectionId(hash);

  useEffect(() => {
    if (legacyRoute) navigate(getLegacyPageUrl(hash));
  }, [hash, legacyRoute, navigate]);

  useEffect(() => {
    if (!sectionId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView?.({ behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [sectionId]);

  if (legacyRoute) return null;

  const route = getHashRoute(hash);
  const [path, query = ""] = route.split("?");

  if (path.startsWith("/agendar")) {
    return <BookingFlow key={route} initialServiceId={new URLSearchParams(query).get("s")} />;
  }

  return <PublicLandingPage />;
}
