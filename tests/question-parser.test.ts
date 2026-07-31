import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  QuestionParseError,
  calculateContentHash,
  normalizeOfficialText,
  parseOfficialQuestionText,
  sha256Hex,
  validateOfficialManifest,
  validateQuestionDocuments,
  type QuestionDocument,
  type QuestionParseMetadata,
} from "../scripts/lib/question-parser";

const SOURCE_HASH = "a".repeat(64);
const GENERATED_DIRECTORY = resolve(
  process.cwd(),
  "data/official-2026/generated",
);
const METADATA: QuestionParseMetadata = {
  bankId: "official-it-initial-general",
  bankVersion: "2026-01-02",
  examType: "initial",
  module: "general",
  revision: 1,
  sourceUrl:
    "https://www.albonazionalegestoriambientali.it/RT/HttpHandler/DownloadSetDomande.ashx?idSet=171&isAggiornamento=0&lang=IT",
  sourceSha256: SOURCE_HASH,
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
};

const VALID_EXTRACT = `QUIZ VERIFICHE DI IDONEITÀ DEL RESPONSABILE TECNICO
(art.13, comma 1, D.M.120/2014; art.2 Delibera del Comitato Nazionale n.6/2025)
MODULO GENERALE PER TUTTE LE CATEGORIE
VERIFICA INIZIALE
Data ultima revisione: 02/01/2026

Materia: 1. Legislazione dei rifiuti: italiana e europea

G_1_04514: La normativa italiana sui rifiuti dispone che la tutela
dell'ambiente sia garantita
-     Esatta: da tutti gli enti pubblici e privati
-     Sbagliata: dalle sole persone giuridiche private
-     Sbagliata: dalle sole persone fisiche private
-     Sbagliata: dai soli enti pubblici

Modulo di partecipazione: MODULO GENERALE PER TUTTE LE CATEGORIE - VERIFICA INIZIALE
Data ultima revisione: 02/01/2026 Pagina 1 di 2
\fG_1_04515: Una copertura in cemento-
amianto deve essere valutata
-
Sbagliata: soltanto visivamente
-
Esatta: secondo la normativa applicabile
-
Sbagliata: soltanto ogni dieci anni
-
Sbagliata: mai

Materia: 2.Compiti del responsabile tecnico
Sottomateria: 2.1 Presidio operativo

G_2_05000: Il responsabile tecnico svolge il proprio incarico
- Sbagliata: senza alcuna responsabilità
- Sbagliata: soltanto da remoto
- Esatta: nel rispetto dei compiti assegnati
- Sbagliata: soltanto una volta l'anno
`;

describe("normalizeOfficialText", () => {
  it("ricompone righe e spazi senza riscrivere il contenuto", () => {
    expect(
      normalizeOfficialText(
        "  Una copertura in cemento-\n amianto ;  è  conforme\u00A0?  ",
      ),
    ).toBe("Una copertura in cemento-amianto; è conforme?");
  });

  it("applica NFC e rimuove soltanto caratteri di layout invisibili", () => {
    expect(normalizeOfficialText("caffe\u0301\u00AD \u200Bcorretto")).toBe(
      "caffé corretto",
    );
  });
});

describe("parseOfficialQuestionText", () => {
  it("estrae domande, materie, opzioni e risposta corretta dal layout PDF", () => {
    const questions = parseOfficialQuestionText(VALID_EXTRACT, METADATA);

    expect(questions).toHaveLength(3);
    expect(questions[0]).toMatchObject({
      ministryId: "G_1_04514",
      subject: "1. Legislazione dei rifiuti: italiana e europea",
      text: "La normativa italiana sui rifiuti dispone che la tutela dell'ambiente sia garantita",
      correctOptionId: "A",
      sourceSha256: SOURCE_HASH,
    });
    expect(questions[0]?.rawText).toContain("\n");
    expect(questions[0]?.options.map((option) => option.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);

    expect(questions[1]).toMatchObject({
      ministryId: "G_1_04515",
      text: "Una copertura in cemento-amianto deve essere valutata",
      correctOptionId: "B",
    });
    expect(questions[1]?.options[1]?.text).toBe(
      "secondo la normativa applicabile",
    );

    expect(questions[2]).toMatchObject({
      ministryId: "G_2_05000",
      subject: "2. Compiti del responsabile tecnico",
      subtopic: "2.1 Presidio operativo",
      correctOptionId: "C",
    });
    expect(
      questions.flatMap((question) => [
        question.text,
        ...question.options.map((option) => option.text),
      ]),
    ).not.toContain(expect.stringMatching(/Modulo di partecipazione/iu));
  });

  it("produce un contentHash indipendente da ID ministeriale e ordine opzioni", () => {
    const first = calculateContentHash("Domanda uguale", [
      "Risposta A",
      "Risposta B",
      "Risposta C",
      "Risposta D",
    ]);
    const second = calculateContentHash("  Domanda  uguale ", [
      "Risposta D",
      "Risposta B",
      "Risposta A",
      "Risposta C",
    ]);

    expect(second).toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("blocca domande con opzioni mancanti", () => {
    const invalid = `Materia: 1. Materia
G_1_00001: Domanda
- Esatta: Uno
- Sbagliata: Due
- Sbagliata: Tre`;

    expect(() => parseOfficialQuestionText(invalid, METADATA)).toThrowError(
      QuestionParseError,
    );
    try {
      parseOfficialQuestionText(invalid, METADATA);
    } catch (error) {
      expect(error).toBeInstanceOf(QuestionParseError);
      expect((error as QuestionParseError).issues).toContainEqual(
        expect.objectContaining({ code: "invalid-option-count" }),
      );
    }
  });

  it("blocca più risposte esatte e ID ministeriali duplicati", () => {
    const repeated = `Materia: 1. Materia
G_1_00001: Prima domanda
- Esatta: Uno
- Esatta: Due
- Sbagliata: Tre
- Sbagliata: Quattro

G_1_00001: Seconda domanda
- Esatta: Uno
- Sbagliata: Due
- Sbagliata: Tre
- Sbagliata: Quattro`;

    try {
      parseOfficialQuestionText(repeated, METADATA);
      throw new Error("Il parser avrebbe dovuto rifiutare la banca");
    } catch (error) {
      expect(error).toBeInstanceOf(QuestionParseError);
      const codes = (error as QuestionParseError).issues.map(
        (issue) => issue.code,
      );
      expect(codes).toContain("multiple-correct-options");
      expect(codes).not.toContain("duplicate-ministry-id");
    }

    const duplicatedValid = `Materia: 1. Materia
G_1_00001: Prima domanda
- Esatta: Uno
- Sbagliata: Due
- Sbagliata: Tre
- Sbagliata: Quattro

G_1_00001: Seconda domanda
- Esatta: Uno
- Sbagliata: Due
- Sbagliata: Tre
- Sbagliata: Quattro`;
    try {
      parseOfficialQuestionText(duplicatedValid, METADATA);
      throw new Error("Il parser avrebbe dovuto rifiutare gli ID duplicati");
    } catch (error) {
      expect(error).toBeInstanceOf(QuestionParseError);
      expect((error as QuestionParseError).issues).toContainEqual(
        expect.objectContaining({ code: "duplicate-ministry-id" }),
      );
    }
  });

  it("blocca materia mancante e intestazioni contaminate nelle opzioni", () => {
    const invalid = `G_1_00001: Domanda senza materia
- Esatta: Uno
- Sbagliata: Due
- Sbagliata: Modulo di partecipazione: intestazione intrusa
- Sbagliata: Quattro`;

    try {
      parseOfficialQuestionText(invalid, METADATA);
      throw new Error("Il parser avrebbe dovuto rifiutare la banca");
    } catch (error) {
      expect(error).toBeInstanceOf(QuestionParseError);
      const codes = (error as QuestionParseError).issues.map(
        (issue) => issue.code,
      );
      expect(codes).toContain("missing-subject");
      expect(codes).toContain("header-contamination");
    }
  });
});

describe("manifest e dataset ufficiale 2026", () => {
  it("descrive esattamente le cinque banche iniziali e quattro di aggiornamento", async () => {
    const manifestPath = resolve(
      process.cwd(),
      "data/official-2026/manifest.json",
    );
    const manifest = validateOfficialManifest(
      JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    );

    expect(manifest.sources).toHaveLength(9);
    expect(
      manifest.sources.reduce(
        (total, source) => total + source.expectedQuestionCount,
        0,
      ),
    ).toBe(5_057);
    expect(
      manifest.sources.filter((source) => source.examType === "initial"),
    ).toHaveLength(5);
    expect(
      manifest.sources.filter((source) => source.examType === "update"),
    ).toHaveLength(4);
    expect(
      manifest.sources.some(
        (source) =>
          source.examType === "update" && source.module === "general",
      ),
    ).toBe(false);
    expect(
      manifest.sources
        .filter(
          (source) =>
            (source.expectedExportOmittedMinistryIds?.length ?? 0) > 0,
        )
        .map((source) => ({
          bankId: source.bankId,
          ministryIds: source.expectedExportOmittedMinistryIds,
        })),
    ).toEqual([
      {
        bankId: "official-it-update-cat8",
        ministryIds: [
          "8_4_06179",
          "8_4_06180",
          "8_4_06181",
          "8_4_06182",
          "8_4_06183",
        ],
      },
    ]);
  });

  it("mantiene validi e riproducibili tutti i file JSON generati", async () => {
    const manifestPath = resolve(
      process.cwd(),
      "data/official-2026/manifest.json",
    );
    const manifest = validateOfficialManifest(
      JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    );
    const index = JSON.parse(
      await readFile(resolve(GENERATED_DIRECTORY, "index.json"), "utf8"),
    ) as {
      totalQuestions: number;
      banks: Array<{
        bankId: string;
        questionCount: number;
        sourceSha256: string;
        exportSha256: string;
        expectedExportOmittedMinistryIds?: string[];
        contentSetHash: string;
      }>;
    };

    expect(index.totalQuestions).toBe(5_057);
    expect(index.banks).toHaveLength(9);

    for (const source of manifest.sources) {
      const generated = JSON.parse(
        await readFile(
          resolve(GENERATED_DIRECTORY, `${source.bankId}.json`),
          "utf8",
        ),
      ) as {
        bank: {
          bankId: string;
          bankVersion: string;
          questionCount: number;
          sourceSha256: string;
          exportUrl: string;
          exportSha256: string;
          expectedExportOmittedMinistryIds?: string[];
          contentSetHash: string;
        };
        questions: QuestionDocument[];
      };

      expect(generated.bank).toMatchObject({
        bankId: source.bankId,
        bankVersion: manifest.version,
        questionCount: source.expectedQuestionCount,
        sourceSha256: source.expectedSourceSha256,
        exportUrl: source.exportUrl,
        exportSha256: source.expectedExportSha256,
      });
      expect(generated.bank.expectedExportOmittedMinistryIds).toEqual(
        source.expectedExportOmittedMinistryIds,
      );
      expect(
        index.banks.find((bank) => bank.bankId === source.bankId),
      ).toMatchObject({
        questionCount: source.expectedQuestionCount,
        sourceSha256: source.expectedSourceSha256,
        exportSha256: source.expectedExportSha256,
        contentSetHash: generated.bank.contentSetHash,
      });
      expect(
        index.banks.find((bank) => bank.bankId === source.bankId)
          ?.expectedExportOmittedMinistryIds,
      ).toEqual(source.expectedExportOmittedMinistryIds);
      expect(generated.questions).toHaveLength(source.expectedQuestionCount);
      expect(validateQuestionDocuments(generated.questions)).toEqual([]);
      expect(
        generated.questions.every(
          (question) =>
            question.options.filter(
              (option) => option.id === question.correctOptionId,
            ).length === 1,
        ),
      ).toBe(true);
      expect(
        new Set(
          generated.questions.map((question) => question.ministryId),
        ).size,
      ).toBe(generated.questions.length);
      expect(
        sha256Hex(
          generated.questions
            .map(
              (question) =>
                `${question.ministryId}:${question.contentHash}`,
            )
            .join("\n"),
        ),
      ).toBe(generated.bank.contentSetHash);
    }
  });

  it(
    "incrocia ogni banca di aggiornamento con generale e specialistica iniziali",
    async () => {
      const loadQuestions = async (
        bankId: string,
      ): Promise<QuestionDocument[]> => {
        const generated = JSON.parse(
          await readFile(
            resolve(GENERATED_DIRECTORY, `${bankId}.json`),
            "utf8",
          ),
        ) as { questions: QuestionDocument[] };
        return generated.questions;
      };
      const general = await loadQuestions("official-it-initial-general");

      for (const questionModule of ["cat145", "cat8", "cat9", "cat10"]) {
        const [specialist, update] = await Promise.all([
          loadQuestions(`official-it-initial-${questionModule}`),
          loadQuestions(`official-it-update-${questionModule}`),
        ]);
        const initialByMinistryId = new Map(
          [...general, ...specialist].map((question) => [
            question.ministryId,
            question.contentHash,
          ]),
        );

        expect(
          update.filter(
            (question) =>
              initialByMinistryId.get(question.ministryId) !==
              question.contentHash,
          ),
        ).toEqual([]);
      }
    },
  );
});
