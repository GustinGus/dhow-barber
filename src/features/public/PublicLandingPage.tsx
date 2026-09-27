import { useEffect, useState } from "react";
import { readMigratedLegacyDatabase } from "@/lib/storage/legacy-migration";
import AboutSection from "./components/AboutSection";
import HeroSection from "./components/HeroSection";
import LocationSection from "./components/LocationSection";
import PortfolioSection from "./components/PortfolioSection";
import PublicFooter from "./components/PublicFooter";
import PublicHeader from "./components/PublicHeader";
import ServicesSection from "./components/ServicesSection";
import "./landing.css";
import { defaultPublicContent, toPublicSiteContent } from "./public-content";

export default function PublicLandingPage() {
  const [content, setContent] = useState(defaultPublicContent);

  useEffect(() => {
    let active = true;

    void readMigratedLegacyDatabase()
      .then((database) => {
        if (active) {
          setContent(toPublicSiteContent(database));
        }
      })
      .catch(() => {
        if (active) {
          setContent(defaultPublicContent);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="public-site">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <PublicHeader content={content} />
      <main id="main-content">
        <HeroSection content={content} />
        <ServicesSection content={content} />
        <PortfolioSection content={content} />
        <AboutSection content={content} />
        <LocationSection content={content} />
      </main>
      <PublicFooter content={content} />
    </div>
  );
}