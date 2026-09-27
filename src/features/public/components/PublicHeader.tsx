import { Menu, X } from "lucide-react";
import { useState } from "react";
import dhowLogo from "@/assets/dhow-logo.png";
import ActionLink from "@/components/ActionLink";
import type { PublicSiteContent } from "../public-content";

const links = [
  ["#servicos", "Serviços"],
  ["#trabalhos", "Trabalhos"],
  ["#sobre", "Sobre"],
  ["#local", "Localização"],
] as const;

export default function PublicHeader({ content }: { content: PublicSiteContent }) {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="public-header">
      <div className="public-header__inner">
        <a className="brand-wordmark" href="#top" onClick={closeMenu} aria-label={`${content.config.nome}, início`}>
          <img className="brand-wordmark__logo" src={dhowLogo} alt="" width="42" height="42" />
          <span className="brand-wordmark__copy">
            <span className="brand-wordmark__name">{content.config.nome}</span>
            <span className="brand-wordmark__place">Barbearia · {content.config.cidade}</span>
          </span>
        </a>

        <nav className="desktop-nav" aria-label="Navegação principal">
          {links.map(([href, label]) => (
            <a key={href} href={href}>{label}</a>
          ))}
        </nav>

        <ActionLink className="header-booking" href="#/agendar" tone="light">
          Agendar
        </ActionLink>

        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      {menuOpen && (
        <nav className="mobile-nav" id="mobile-navigation" aria-label="Navegação móvel">
          {links.map(([href, label]) => (
            <a key={href} href={href} onClick={closeMenu}>{label}</a>
          ))}
          <ActionLink href="#/agendar" tone="light" onClick={closeMenu}>
            Agendar horário
          </ActionLink>
        </nav>
      )}
    </header>
  );
}