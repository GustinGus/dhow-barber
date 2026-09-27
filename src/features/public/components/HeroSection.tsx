import ActionLink from "@/components/ActionLink";
import portfolioCover from "@/assets/portfolio-cover.jpg";
import type { PublicSiteContent } from "../public-content";

export default function HeroSection({ content }: { content: PublicSiteContent }) {
  const cover = content.portfolio[0];
  const location = `${content.config.bairro}, ${content.config.cidade}`;

  return (
    <section className="hero-section" id="top" aria-labelledby="hero-title">
      <img
        className="hero-section__image"
        src={cover?.image || portfolioCover}
        alt=""
        width="1800"
        height="1200"
      />
      <div className="hero-section__shade" aria-hidden="true" />
      <div className="hero-section__inner">
        <div className="hero-copy">
          <p className="hero-kicker">Barbearia em {location}</p>
          <h1 id="hero-title">Seu estilo.<br />Seu horário.<br />Seu momento.</h1>
          <p className="hero-intro">Agende seu atendimento de forma rápida e simples.</p>
          <div className="hero-actions">
            <ActionLink href="#/agendar" tone="primary">Agendar agora</ActionLink>
            <a className="hero-secondary-link" href="#servicos">Conhecer serviços</a>
          </div>
        </div>

        <div className="hero-proof" aria-label={`${content.config.nota} estrelas e ${content.config.avaliacoes} avaliações no Google`}>
          <span className="hero-proof__score">{content.config.nota}</span>
          <span className="hero-proof__stars" aria-hidden="true">★★★★★</span>
          <span className="hero-proof__label">{content.config.avaliacoes} avaliações no Google</span>
        </div>
      </div>
      <a className="hero-scroll-cue" href="#servicos" aria-label="Rolar para os serviços">
        <span />
      </a>
    </section>
  );
}