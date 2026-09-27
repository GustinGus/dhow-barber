import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import legacyFixture from "@/../tests/fixtures/legacy-database.json";
import {
  LEGACY_DATA_VERSION,
  migrateLegacyDatabase,
  readMigratedLegacyDatabase,
} from "@/lib/storage/legacy-migration";
import { LEGACY_STORAGE_KEYS } from "@/lib/storage/legacy-storage";
import type { LegacyDatabase } from "@/types/legacy-database";

const fixture = legacyFixture as LegacyDatabase;
// The shared fixture has no dataVersion (the legacy code reads that as v1); these tests need a current v2 database.
const v2Fixture: LegacyDatabase = { ...structuredClone(fixture), dataVersion: 2 };

type LegacyMigrate = (saved: unknown) => LegacyDatabase;

function loadLegacyMigrateDB(): LegacyMigrate {
  const html = readFileSync(path.resolve(__dirname, "../../public/legado.html"), "utf8");
  const seedStart = html.indexOf("function seed(){");
  const seedEnd = html.indexOf("var DB = seed();");
  const migrateStart = html.indexOf("const DATA_VERSION = 2;");
  const migrateEnd = html.indexOf("/* ---------- Utilidades ---------- */");
  if ([seedStart, seedEnd, migrateStart, migrateEnd].includes(-1)) {
    throw new Error("Could not locate the legacy seed/migrateDB source in public/legado.html.");
  }
  const source = `${html.slice(seedStart, seedEnd)}\n${html.slice(migrateStart, migrateEnd)}\nreturn migrateDB;`;
  return new Function(source)() as LegacyMigrate;
}

function withoutPortfolio(database: LegacyDatabase) {
  const { portfolio: _portfolio, ...rest } = database;
  return rest;
}

function createV1Database(): LegacyDatabase {
  return {
    config: {
      nome: "Dhow Barber",
      whatsapp: "5511999999999",
      senha: "senha-antiga",
    },
    servicos: [
      { id: "s1", nome: "Corte de cabelo", desc: "", preco: 35, duracao: 45, ativo: true },
      { id: "s2", nome: "Barba", desc: "", preco: 25, duracao: 30, ativo: false },
      { id: "s3", nome: "Sobrancelha", desc: "", preco: 5, duracao: null, ativo: true },
      { id: "s4", nome: "Coloração", desc: "", preco: "Consultar com o Dhow!", duracao: 90, ativo: true },
    ],
    horarios: {
      configurado: true,
      intervalo: 15,
      almoco: { ativo: true, ini: "12:00", fim: "13:00" },
      dias: Array.from({ length: 7 }, (_, day) => ({ aberto: day > 0, ini: "09:00", fim: "18:00" })),
    },
    bloqueios: [{ id: "b1", dataIni: "2026-10-05", diaTodo: true, ini: "", fim: "", motivo: "Feriado" }],
    agendamentos: [structuredClone(fixture.agendamentos[0])],
    portfolio: [{ id: "custom", image: "data:image/jpeg;base64,x", caption: "Foto do barbeiro", ativo: true }],
    portfolioRemovidas: ["p1"],
    depoimentos: ["Depoimento antigo"],
    campoLegadoDesconhecido: { manter: true },
  } as unknown as LegacyDatabase;
}

describe("legacy v1 → v2 migration", () => {
  const legacyMigrateDB = loadLegacyMigrateDB();

  beforeEach(() => {
    window.localStorage.clear();
    delete window.storage;
  });

  afterEach(() => {
    delete window.storage;
  });

  it("matches the legacy migrateDB for a v1 database (except default portfolio photos)", () => {
    const saved = createV1Database();
    const legacy = legacyMigrateDB(structuredClone(saved));
    const migrated = migrateLegacyDatabase(structuredClone(saved));

    expect(withoutPortfolio(migrated)).toEqual(withoutPortfolio(legacy));
    expect(migrated.portfolio).toEqual(saved.portfolio);
    expect(legacy.portfolio.slice(0, 1)).toEqual(saved.portfolio);
  });

  it("matches the legacy migrateDB for a v2 database", () => {
    const saved = structuredClone(v2Fixture);
    const legacy = legacyMigrateDB(structuredClone(saved));
    const migrated = migrateLegacyDatabase(structuredClone(saved));

    expect(withoutPortfolio(migrated)).toEqual(withoutPortfolio(legacy));
    expect(migrated.portfolio).toEqual(saved.portfolio);
  });

  it("remaps v1 services by id, keeping only their duration and active flag", () => {
    const migrated = migrateLegacyDatabase(createV1Database());

    expect(migrated.dataVersion).toBe(LEGACY_DATA_VERSION);
    expect(migrated.servicos.map((service) => [service.id, service.nome, service.duracao, service.ativo])).toEqual([
      ["s1", "Corte de cabelo", 45, true],
      ["s2", "Corte + Sobrancelha", 30, false],
      ["s3", "Barba", null, true],
      ["s4", "Corte + Barba", 90, true],
      ["s5", "Sobrancelha", null, true],
      ["s6", "Coloração", null, true],
    ]);
    expect(migrated.servicos[0].preco).toBe(40);
  });

  it("fills missing config and schedule fields while keeping saved values and data", () => {
    const saved = createV1Database();
    const migrated = migrateLegacyDatabase(saved);

    expect(migrated.config.whatsapp).toBe("5511999999999");
    expect(migrated.config.senha).toBe("senha-antiga");
    expect(migrated.config.endereco).toBe("R. Profa. Olga Nilza Dos Santos Machado, 24");
    expect(migrated.horarios.configurado).toBe(true);
    expect(migrated.horarios.intervalo).toBe(15);
    expect(migrated.horarios.livre).toBe(true);
    expect(migrated.bloqueios).toEqual(saved.bloqueios);
    expect(migrated.agendamentos).toEqual(saved.agendamentos);
    expect(migrated.depoimentos).toEqual(["Depoimento antigo"]);
    expect(migrated.portfolioRemovidas).toEqual(["p1"]);
    expect(migrated.campoLegadoDesconhecido).toEqual({ manter: true });
  });

  it("keeps a v2 database's services, prices and unknown fields untouched", () => {
    const saved = structuredClone(v2Fixture);
    const migrated = migrateLegacyDatabase(saved);

    expect(migrated.servicos).toEqual(v2Fixture.servicos);
    expect(migrated.agendamentos).toEqual(v2Fixture.agendamentos);
    expect(migrated.campoLegadoDesconhecido).toEqual({ manter: true });
    expect(migrated.dataVersion).toBe(2);
  });

  it("does not mutate the saved database", () => {
    const saved = createV1Database();
    const snapshot = structuredClone(saved);
    migrateLegacyDatabase(saved);
    expect(saved).toEqual(snapshot);
  });

  it("returns a version-2 seed when nothing was saved", () => {
    const migrated = migrateLegacyDatabase(null);
    expect(migrated.dataVersion).toBe(2);
    expect(migrated.agendamentos).toEqual([]);
    expect(migrated.servicos.map((service) => service.id)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
  });

  it("reads and migrates in memory without writing to storage", async () => {
    const serialized = JSON.stringify(createV1Database());
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, serialized);

    const migrated = await readMigratedLegacyDatabase();

    expect(migrated?.dataVersion).toBe(2);
    expect(migrated?.servicos[1].nome).toBe("Corte + Sobrancelha");
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBe(serialized);
  });

  it("returns null when there is no saved database", async () => {
    expect(await readMigratedLegacyDatabase()).toBeNull();
  });
});
