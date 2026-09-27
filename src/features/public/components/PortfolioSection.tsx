import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import ActionLink from "@/components/ActionLink";
import type { PublicSiteContent } from "../public-content";

export default function PortfolioSection({ content }: { content: PublicSiteContent }) {
  const railRef = useRef<HTMLDivElement>(null);

  function scrollPortfolio(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;

    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    rail.scrollBy({ left: direction * rail.clientWidth * 0.78, behavior });
  }

  return (
    <section className="portfolio-section public-section" id="trabalhos" aria-labelledby="portfolio-title">
      <div className="section-inner">
        <div className="section-heading section-heading--portfolio">
          <div>
            <p className="section-kicker">Dhow Barber</p>
            <h2 id="portfolio-title">Nossos trabalhos</h2>
          </div>
          <p className="section-lede">Cortes, desenhos e acabamentos feitos aqui na cadeira.</p>
        </div>

        {content.portfolio.length > 0 ? (
          <>
            <div className="portfolio-rail" ref={railRef} aria-label="Portfólio da Dhow Barber">
              {content.portfolio.map((item, index) => (
                <figure className="portfolio-item" key={item.id}>
                  <img
                    src={item.image}
                    alt={item.caption || "Trabalho da Dhow Barber"}
                    width="720"
                    height="900"
                    loading={index < 3 ? "eager" : "lazy"}
                  />
                  {item.caption ? <figcaption>{item.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
            {content.portfolio.length > 1 && (
              <div className="portfolio-controls" aria-label="Controles do portfólio">
                <button type="button" onClick={() => scrollPortfolio(-1)} aria-label="Trabalhos anteriores">
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button type="button" onClick={() => scrollPortfolio(1)} aria-label="Próximos trabalhos">
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="portfolio-empty">
            <p>As fotos do portfólio são cadastradas no painel do barbeiro.</p>
          </div>
        )}

        <div className="portfolio-follow">
          <p>Acompanhe nossos últimos trabalhos no Instagram.</p>
          <ActionLink href={content.config.instagram} target="_blank" rel="noopener noreferrer" tone="outline">
            Ver mais no Instagram
          </ActionLink>
        </div>
      </div>
    </section>
  );
}