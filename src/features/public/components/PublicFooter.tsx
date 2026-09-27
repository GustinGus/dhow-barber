import { getLegacyPageUrl } from "@/app/legacy-routes";
import type { PublicSiteContent } from "../public-content";

export default function PublicFooter({ content }: { content: PublicSiteContent }) {
  return (
    <footer className="public-footer">
      <div className="section-inner">
        <div className="footer-main">
          <a className="footer-brand" href="#top">{content.config.nome}</a>
          <p>{content.config.bairro} · {content.config.cidade}</p>
          <nav aria-label="Links do rodapé">
            <a href="#/agendar">Agendar horário</a>
            <a href={getLegacyPageUrl("#/meus")}>Meus agendamentos</a>
            <a href={getLegacyPageUrl("#/admin")}>Área do barbeiro</a>
          </nav>
        </div>
        <div className="footer-meta">
          <span>© {new Date().getFullYear()} {content.config.nome}</span>
          <span>Feito por Gustavo</span>
        </div>
      </div>
    </footer>
  );
}