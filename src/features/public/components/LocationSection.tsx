import { Camera, MapPin, Phone } from "lucide-react";
import ActionLink from "@/components/ActionLink";
import { googleMapsUrl } from "../public-content";
import type { PublicSiteContent } from "../public-content";

export default function LocationSection({ content }: { content: PublicSiteContent }) {
  const mapUrl = googleMapsUrl(content);
  const whatsappUrl = `https://wa.me/${content.config.whatsapp}`;

  return (
    <section className="location-section public-section" id="local" aria-labelledby="location-title">
      <div className="section-inner location-layout">
        <div className="location-copy">
          <p className="section-kicker">Vista Alegre · Jundiaí</p>
          <h2 id="location-title">Onde estamos</h2>
          <address>
            {content.config.endereco}<br />
            {content.config.bairro}<br />
            {content.config.cidade}<br />
            {content.config.cep}
          </address>
          <ActionLink href={mapUrl} target="_blank" rel="noopener noreferrer" tone="primary">
            <MapPin aria-hidden="true" data-icon="inline-start" />
            Como chegar
          </ActionLink>
        </div>

        <div className="contact-panel">
          <h3>Fale com a gente</h3>
          <a href={`tel:${content.config.telefoneRaw}`}>
            <Phone aria-hidden="true" />
            <span><small>Ligar</small>{content.config.telefone}</span>
          </a>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            <span className="contact-panel__wa" aria-hidden="true">wa</span>
            <span><small>WhatsApp</small>{content.config.telefone}</span>
          </a>
          <a href={content.config.instagram} target="_blank" rel="noopener noreferrer">
            <Camera aria-hidden="true" />
            <span><small>Instagram</small>@dhowbarber_</span>
          </a>
          <ActionLink className="location-booking" href="#/agendar" tone="outline">
            Agendar agora
          </ActionLink>
        </div>
      </div>
    </section>
  );
}