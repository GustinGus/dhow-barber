import { useEffect, useState } from "react";
import BookingFlow from "@/features/booking/BookingFlow";
import PublicLandingPage from "@/features/public/PublicLandingPage";

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  const route = hash.replace(/^#/, "");
  const [path, query = ""] = route.split("?");

  if (path.startsWith("/agendar")) {
    return <BookingFlow key={route} initialServiceId={new URLSearchParams(query).get("s")} />;
  }

  return <PublicLandingPage />;
}