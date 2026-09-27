import type {
  LegacyDatabase,
  LegacyPortfolioItem,
  LegacyService,
} from "@/types/legacy-database";

export interface PublicSiteContent {
  config: {
    nome: string;
    endereco: string;
    bairro: string;
    cidade: string;
    cep: string;
    telefone: string;
    telefoneRaw: string;
    whatsapp: string;
    instagram: string;
    nota: string;
    avaliacoes: number;
  };
  servicos: LegacyService[];
  portfolio: LegacyPortfolioItem[];
  depoimentos: string[];
}

export const defaultPublicContent: PublicSiteContent = {
  config: {
    nome: "Dhow Barber",
    endereco: "R. Profa. Olga Nilza Dos Santos Machado, 24",
    bairro: "Vista Alegre",
    cidade: "Jundiaí - SP",
    cep: "13214-442",
    telefone: "(11) 94146-5958",
    telefoneRaw: "+5511941465958",
    whatsapp: "5511941465958",
    instagram: "https://www.instagram.com/dhowbarber_/",
    nota: "5,0",
    avaliacoes: 42,
  },
  servicos: [
    { id: "s1", nome: "Corte de cabelo", desc: "", preco: 40, duracao: null, ativo: true },
    { id: "s2", nome: "Corte + Sobrancelha", desc: "", preco: 45, duracao: null, ativo: true },
    { id: "s3", nome: "Barba", desc: "", preco: 25, duracao: null, ativo: true },
    { id: "s4", nome: "Corte + Barba", desc: "", preco: 60, duracao: null, ativo: true },
    { id: "s5", nome: "Sobrancelha", desc: "", preco: 5, duracao: null, ativo: true },
    {
      id: "s6",
      nome: "Coloração",
      desc: "",
      preco: "Verificar com o Dhow",
      duracao: null,
      ativo: true,
    },
  ],
  portfolio: [],
  depoimentos: [
    "Lugar otimo, gente fina e faz cabelo piscina",
    "Tem cafezinho e massagem, show de bola!",
    "Ótimo profissional, super recomendo!",
  ],
};

export function toPublicSiteContent(database: LegacyDatabase | null): PublicSiteContent {
  if (!database) {
    return defaultPublicContent;
  }

  const config = database.config;

  return {
    config: {
      nome: config.nome ?? defaultPublicContent.config.nome,
      endereco: config.endereco ?? defaultPublicContent.config.endereco,
      bairro: config.bairro ?? defaultPublicContent.config.bairro,
      cidade: config.cidade ?? defaultPublicContent.config.cidade,
      cep: config.cep ?? defaultPublicContent.config.cep,
      telefone: config.telefone ?? defaultPublicContent.config.telefone,
      telefoneRaw: config.telefoneRaw ?? defaultPublicContent.config.telefoneRaw,
      whatsapp: config.whatsapp ?? defaultPublicContent.config.whatsapp,
      instagram: config.instagram ?? defaultPublicContent.config.instagram,
      nota: config.nota ?? defaultPublicContent.config.nota,
      avaliacoes: config.avaliacoes ?? defaultPublicContent.config.avaliacoes,
    },
    servicos: Array.isArray(database.servicos)
      ? database.servicos.filter((service) => service.ativo)
      : defaultPublicContent.servicos,
    portfolio: Array.isArray(database.portfolio)
      ? database.portfolio.filter((item) => item.ativo)
      : defaultPublicContent.portfolio,
    depoimentos: Array.isArray(database.depoimentos)
      ? database.depoimentos
      : defaultPublicContent.depoimentos,
  };
}

export function formatServicePrice(price: LegacyService["preco"]): string {
  if (typeof price === "number") {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(price);
  }

  return price ?? "Valor sob consulta";
}

export function formatServiceDuration(duration: number): string {
  if (duration >= 60) {
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    return minutes ? `${hours}h${minutes}` : `${hours}h`;
  }

  return `${duration} min`;
}

export function googleMapsUrl(content: PublicSiteContent): string {
  const address = [
    content.config.endereco,
    content.config.bairro,
    content.config.cidade,
    content.config.cep,
  ].join(", ");

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}