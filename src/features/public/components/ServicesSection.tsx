import ActionLink from "@/components/ActionLink";
import { formatServiceDuration, formatServicePrice } from "../public-content";
import type { PublicSiteContent } from "../public-content";

export default function ServicesSection({ content }: { content: PublicSiteContent }) {
  return (
    <section className="services-section public-section" id="servicos" aria-labelledby="services-title">
      <div className="section-inner">
        <div className="section-heading section-heading--split">
          <div>
            <p className="section-kicker">Na cadeira</p>
            <h2 id="services-title">O que a gente faz</h2>
          </div>
          <p className="section-lede">
            Escolha o serviço e siga para a agenda. Cada atendimento tem seu tempo reservado — nada de espera.
          </p>
        </div>

        {content.servicos.length > 0 ? (
          <ul className="service-list">
            {content.servicos.map((service) => (
              <li className="service-row" key={service.id}>
                <h3>{service.nome}</h3>
                {service.desc ? <p className="service-description">{service.desc}</p> : null}
                <p className="service-price">{formatServicePrice(service.preco)}</p>
                {service.duracao ? <p className="service-duration">{formatServiceDuration(service.duracao)}</p> : null}
                <ActionLink
                  className="service-link"
                  href={`#/agendar?s=${encodeURIComponent(service.id)}`}
                  tone="outline"
                  aria-label={`Agendar ${service.nome}`}
                >
                  Agendar
                </ActionLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="service-empty">Consulte os serviços diretamente com a Dhow Barber.</p>
        )}

        {content.servicos.some((service) => service.preco == null) && (
          <p className="service-note">Alguns valores ainda não estão publicados. Confirme no WhatsApp ou aguarde a confirmação do agendamento.</p>
        )}
      </div>
    </section>
  );
}