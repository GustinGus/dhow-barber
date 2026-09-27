import { createFreshLegacyDatabase } from "@/features/booking/booking-domain";
import type { LegacyDatabase } from "@/types/legacy-database";
import { readLegacyDatabase } from "./legacy-storage";

export const LEGACY_DATA_VERSION = 2;

/**
 * Port of the legacy `migrateDB` (index.html). The legacy page runs it on every
 * boot; the React pages apply it in memory after reading so both see the same
 * data. Only the default portfolio photos are not reproduced here: the legacy
 * page adds them back the next time it migrates.
 */
export function migrateLegacyDatabase(saved: LegacyDatabase | null): LegacyDatabase {
  const defaults = createFreshLegacyDatabase();

  if (!saved) {
    return { ...defaults, dataVersion: LEGACY_DATA_VERSION };
  }

  const database: LegacyDatabase = { ...defaults, ...saved };
  database.config = { ...defaults.config, ...(saved.config || {}) };
  database.horarios = { ...defaults.horarios, ...(saved.horarios || {}) };

  if ((saved.dataVersion || 1) < 2) {
    const previousServices = Array.isArray(saved.servicos) ? saved.servicos : [];
    database.servicos = defaults.servicos.map((service) => {
      const previous = previousServices.find((item) => item.id === service.id);
      return {
        ...service,
        duracao: previous?.duracao ?? service.duracao,
        ativo: previous?.ativo ?? service.ativo,
      };
    });
  }

  if (saved.portfolio) {
    database.portfolio = [...saved.portfolio];
    const existing = new Set(database.portfolio.map((item) => item.id));
    const removed = new Set(saved.portfolioRemovidas || []);
    defaults.portfolio.forEach((item) => {
      if (!existing.has(item.id) && !removed.has(item.id)) database.portfolio.push(item);
    });
  }

  database.dataVersion = LEGACY_DATA_VERSION;
  return database;
}

/** Reads the shared legacy database and migrates it in memory; nothing is written. */
export async function readMigratedLegacyDatabase(): Promise<LegacyDatabase | null> {
  const saved = await readLegacyDatabase();
  return saved ? migrateLegacyDatabase(saved) : null;
}
