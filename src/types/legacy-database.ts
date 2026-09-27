export type LegacyPrice = number | string | null;

export interface LegacyService {
  id: string;
  nome: string;
  desc: string;
  preco: LegacyPrice;
  duracao: number | null;
  ativo: boolean;
  [field: string]: unknown;
}

export interface LegacyOpeningDay {
  aberto: boolean;
  ini: string;
  fim: string;
  [field: string]: unknown;
}

export interface LegacyLunchBreak {
  ativo: boolean;
  ini: string;
  fim: string;
  [field: string]: unknown;
}

export interface LegacyHours {
  livre?: boolean;
  livreIni?: string;
  livreFim?: string;
  configurado: boolean;
  intervalo: number;
  almoco: LegacyLunchBreak;
  dias: LegacyOpeningDay[];
  [field: string]: unknown;
}

export interface LegacyBlock {
  id: string;
  dataIni: string;
  dataFim?: string;
  diaTodo: boolean;
  ini: string;
  fim: string;
  motivo: string;
  [field: string]: unknown;
}

export interface LegacyAppointment {
  id: string;
  codigo: string;
  cliente: string;
  telefone: string;
  telDigits: string;
  servicoId: string;
  data: string;
  hora: string;
  duracao: number;
  pagamento: string;
  obs: string;
  status: string;
  criadoEm: string;
  [field: string]: unknown;
}

export interface LegacyPortfolioItem {
  id: string;
  image: string;
  caption: string;
  instagramUrl?: string;
  ativo: boolean;
  [field: string]: unknown;
}

export interface LegacyConfig {
  nome: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
  telefone: string;
  telefoneRaw: string;
  whatsapp: string;
  instagram: string;
  canal: string;
  canalOutro: string;
  senha: string;
  nota: string;
  avaliacoes: number;
  [field: string]: unknown;
}

export interface LegacyDatabase {
  config: LegacyConfig;
  servicos: LegacyService[];
  horarios: LegacyHours;
  bloqueios: LegacyBlock[];
  agendamentos: LegacyAppointment[];
  portfolio: LegacyPortfolioItem[];
  portfolioRemovidas?: string[];
  depoimentos: string[];
  dataVersion?: number;
  [field: string]: unknown;
}