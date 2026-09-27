import type { PublicSiteContent } from "../public-content";

export default function AboutSection({ content }: { content: PublicSiteContent }) {
  return (
    <section className="about-section public-section" id="sobre" aria-labelledby="about-title">
      <div className="section-inner about-layout">
        <div className="about-copy">
          <p className="section-kicker">Sobre a Dhow</p>
          <h2 id="about-title">Trabalho feito com calma.</h2>
          <p>
            A Dhow Barber é uma barbearia de bairro em {content.config.bairro}, {content.config.cidade}. Atendimento no horário marcado, conversa boa e trabalho feito com calma — do corte clássico ao desenho autoral.
          </p>
          <p>
            A agenda online existe para você escolher seu horário sem precisar ficar negociando por mensagem.
          </p>
        </div>

        <div className="about-reviews">
          <div className="review-score">
            <span className="review-score__number">{content.config.nota}</span>
            <span className="review-score__stars" aria-label="5 estrelas">★★★★★</span>
            <span className="review-score__count">{content.config.avaliacoes} avaliações no Google</span>
          </div>
          <div className="quote-list">
            {content.depoimentos.map((quote, index) => (
              <figure className="customer-quote" key={`${quote}-${index}`}>
                <blockquote>“{quote}”</blockquote>
                <figcaption>Cliente Dhow</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}