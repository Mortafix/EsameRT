#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type OfficialQuestionManifest,
  type OfficialQuestionSource,
  type QuestionDocument,
  QuestionParseError,
  crosscheckOfficialExport,
  parseOfficialQuestionText,
  sha256Hex,
  validateOfficialManifest,
} from "./lib/question-parser";

interface CliOptions {
  manifestPath: string;
  outputDirectory: string;
  cacheDirectory: string;
  inputDirectory?: string;
  selectedBankIds: Set<string>;
  offline: boolean;
  writeJson: boolean;
  writeMongo: boolean;
  checkOnly: boolean;
  help: boolean;
}

interface ParsedBank {
  source: OfficialQuestionSource;
  sourceSha256: string;
  exportSha256: string;
  contentSetHash: string;
  questions: QuestionDocument[];
}

interface GeneratedBankFile {
  schemaVersion: 1;
  bank: {
    bankId: string;
    bankVersion: string;
    label: string;
    locale: "it-IT";
    examType: OfficialQuestionSource["examType"];
    module: OfficialQuestionSource["module"];
    revision: number;
    questionCount: number;
    sourceUrl: string;
    sourceSha256: string;
    exportUrl: string;
    exportSha256: string;
    expectedExportOmittedMinistryIds?: string[];
    contentSetHash: string;
    publishedAt: string;
    verifiedAt: string;
  };
  questions: QuestionDocument[];
}

const DEFAULT_MANIFEST = resolve(
  process.cwd(),
  "data/official-2026/manifest.json",
);
const DEFAULT_OUTPUT = resolve(
  process.cwd(),
  "data/official-2026/generated",
);
const DEFAULT_CACHE =
  platform() === "darwin"
    ? "/private/tmp/rtlab-official-2026"
    : join(tmpdir(), "rtlab-official-2026");
const MAX_EXTRACTED_TEXT_BYTES = 64 * 1024 * 1024;

function usage(): string {
  return `Importa e valida le nove banche quiz ufficiali 2026.

Uso:
  npm run questions:import -- [opzioni]

Opzioni:
  --manifest <file>     Manifest fonti (default: data/official-2026/manifest.json)
  --out <directory>    Directory JSON generati (default: data/official-2026/generated)
  --input-dir <dir>    Legge i PDF già presenti in questa directory
  --cache-dir <dir>    Cache dei PDF scaricati (default: ${DEFAULT_CACHE})
  --bank <bank-id>     Importa una banca; ripetibile o separabile con virgole
  --offline            Non effettua download e fallisce se un PDF non è presente
  --mongo              Importa anche in MongoDB (MONGODB_URI e MONGODB_DB richiesti)
  --no-json            Non genera i file JSON
  --check-only         Scarica/legge, estrae e valida senza scrivere output
  --help               Mostra questo aiuto

Il sourceSha256 deve coincidere con il manifest. Un cambiamento del PDF ufficiale
richiede una nuova revisione esplicita del manifest: non viene accettato in silenzio.`;
}

function requireOptionValue(
  argv: readonly string[],
  index: number,
  option: string,
): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} richiede un valore`);
  }
  return value;
}

export function parseCliOptions(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    manifestPath: DEFAULT_MANIFEST,
    outputDirectory: DEFAULT_OUTPUT,
    cacheDirectory: DEFAULT_CACHE,
    selectedBankIds: new Set<string>(),
    offline: false,
    writeJson: true,
    writeMongo: false,
    checkOnly: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--manifest":
        options.manifestPath = resolve(
          requireOptionValue(argv, index, argument),
        );
        index += 1;
        break;
      case "--out":
        options.outputDirectory = resolve(
          requireOptionValue(argv, index, argument),
        );
        index += 1;
        break;
      case "--input-dir":
        options.inputDirectory = resolve(
          requireOptionValue(argv, index, argument),
        );
        index += 1;
        break;
      case "--cache-dir":
        options.cacheDirectory = resolve(
          requireOptionValue(argv, index, argument),
        );
        index += 1;
        break;
      case "--bank": {
        const bankIds = requireOptionValue(argv, index, argument)
          .split(",")
          .map((bankId) => bankId.trim())
          .filter(Boolean);
        for (const bankId of bankIds) {
          options.selectedBankIds.add(bankId);
        }
        index += 1;
        break;
      }
      case "--offline":
        options.offline = true;
        break;
      case "--mongo":
        options.writeMongo = true;
        break;
      case "--no-json":
        options.writeJson = false;
        break;
      case "--check-only":
        options.checkOnly = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Opzione sconosciuta: ${argument}`);
    }
  }

  if (!options.help && !options.checkOnly && !options.writeJson && !options.writeMongo) {
    throw new Error("--no-json richiede --mongo oppure --check-only");
  }
  return options;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function assertPdf(bytes: Uint8Array, label: string): void {
  const signature = Buffer.from(bytes.subarray(0, 5)).toString("ascii");
  if (signature !== "%PDF-") {
    throw new Error(`${label} non contiene un PDF valido`);
  }
}

async function downloadPdf(url: string, destination: string): Promise<void> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "application/pdf",
      "user-agent": "RT-Lab-official-question-importer/1.0",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      `Download fallito (${response.status} ${response.statusText}): ${url}`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  assertPdf(bytes, url);
  await mkdir(dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.${process.pid}.tmp`;
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, destination);
}

async function resolvePdfPath(
  source: OfficialQuestionSource,
  options: CliOptions,
  kind: "id-source" | "table-export",
): Promise<string> {
  const directory = options.inputDirectory ?? options.cacheDirectory;
  const pdfFile =
    kind === "id-source" ? source.pdfFile : source.exportFile;
  const sourceUrl =
    kind === "id-source" ? source.sourceUrl : source.exportUrl;
  const pdfPath = join(directory, pdfFile);
  if (await pathExists(pdfPath)) {
    return pdfPath;
  }
  if (options.inputDirectory) {
    throw new Error(`PDF locale mancante: ${pdfPath}`);
  }
  if (options.offline) {
    throw new Error(`PDF non presente in cache durante import offline: ${pdfPath}`);
  }

  process.stdout.write(`Scarico ${source.bankId} (${kind})...\n`);
  await downloadPdf(sourceUrl, pdfPath);
  return pdfPath;
}

async function extractPdfText(
  pdfPath: string,
  mode: "layout" | "tsv" = "layout",
): Promise<string> {
  return await new Promise<string>((resolvePromise, reject) => {
    const child = spawn(
      "pdftotext",
      [mode === "layout" ? "-layout" : "-tsv", pdfPath, "-"],
      {
      stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_EXTRACTED_TEXT_BYTES) {
        child.kill();
        reject(
          new Error(
            `Testo estratto oltre il limite di ${MAX_EXTRACTED_TEXT_BYTES} byte: ${pdfPath}`,
          ),
        );
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      if ("code" in error && error.code === "ENOENT") {
        reject(
          new Error(
            "pdftotext non è disponibile. Installare Poppler prima dell'import.",
          ),
        );
        return;
      }
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(
          new Error(
            `pdftotext è terminato con codice ${exitCode}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
          ),
        );
        return;
      }
      resolvePromise(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

function calculateContentSetHash(
  questions: readonly QuestionDocument[],
): string {
  return sha256Hex(
    questions
      .map((question) => `${question.ministryId}:${question.contentHash}`)
      .join("\n"),
  );
}

async function parseBank(
  manifest: OfficialQuestionManifest,
  source: OfficialQuestionSource,
  options: CliOptions,
): Promise<ParsedBank> {
  const pdfPath = await resolvePdfPath(source, options, "id-source");
  const pdfBytes = await readFile(pdfPath);
  assertPdf(pdfBytes, pdfPath);
  const sourceSha256 = sha256Hex(pdfBytes);
  if (sourceSha256 !== source.expectedSourceSha256) {
    throw new Error(
      [
        `Hash fonte inatteso per ${source.bankId}.`,
        `Atteso: ${source.expectedSourceSha256}`,
        `Ricevuto: ${sourceSha256}`,
        "La fonte ufficiale potrebbe essere cambiata: aggiornare il manifest come nuova revisione dopo verifica manuale.",
      ].join("\n"),
    );
  }

  const extractedText = await extractPdfText(pdfPath);
  const questions = parseOfficialQuestionText(extractedText, {
    bankId: source.bankId,
    bankVersion: manifest.version,
    examType: source.examType,
    module: source.module,
    revision: source.revision,
    sourceUrl: source.sourceUrl,
    sourceSha256,
    createdAt: new Date(manifest.publishedAt),
  });

  if (questions.length !== source.expectedQuestionCount) {
    throw new Error(
      `${source.bankId}: estratte ${questions.length} domande, attese ${source.expectedQuestionCount}`,
    );
  }

  const exportPdfPath = await resolvePdfPath(
    source,
    options,
    "table-export",
  );
  const exportPdfBytes = await readFile(exportPdfPath);
  assertPdf(exportPdfBytes, exportPdfPath);
  const exportSha256 = sha256Hex(exportPdfBytes);
  if (exportSha256 !== source.expectedExportSha256) {
    throw new Error(
      [
        `Hash export inatteso per ${source.bankId}.`,
        `Atteso: ${source.expectedExportSha256}`,
        `Ricevuto: ${exportSha256}`,
        "L'export della notizia ufficiale potrebbe essere cambiato: verificare e versionare il manifest.",
      ].join("\n"),
    );
  }
  crosscheckOfficialExport(
    await extractPdfText(exportPdfPath, "tsv"),
    questions,
    source.expectedExportOmittedMinistryIds,
  );

  return {
    source,
    sourceSha256,
    exportSha256,
    contentSetHash: calculateContentSetHash(questions),
    questions,
  };
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, path);
}

async function writeGeneratedJson(
  manifest: OfficialQuestionManifest,
  banks: readonly ParsedBank[],
  outputDirectory: string,
): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });

  for (const bank of banks) {
    const generated: GeneratedBankFile = {
      schemaVersion: 1,
      bank: {
        bankId: bank.source.bankId,
        bankVersion: manifest.version,
        label: bank.source.label,
        locale: manifest.locale,
        examType: bank.source.examType,
        module: bank.source.module,
        revision: bank.source.revision,
        questionCount: bank.questions.length,
        sourceUrl: bank.source.sourceUrl,
        sourceSha256: bank.sourceSha256,
        exportUrl: bank.source.exportUrl,
        exportSha256: bank.exportSha256,
        ...(bank.source.expectedExportOmittedMinistryIds
          ? {
              expectedExportOmittedMinistryIds:
                bank.source.expectedExportOmittedMinistryIds,
            }
          : {}),
        contentSetHash: bank.contentSetHash,
        publishedAt: manifest.publishedAt,
        verifiedAt: manifest.verifiedAt,
      },
      questions: bank.questions,
    };
    await writeJsonAtomically(
      join(outputDirectory, `${bank.source.bankId}.json`),
      generated,
    );
  }

  const index = {
    schemaVersion: 1,
    bankVersion: manifest.version,
    locale: manifest.locale,
    publishedAt: manifest.publishedAt,
    verifiedAt: manifest.verifiedAt,
    totalQuestions: banks.reduce(
      (sum, bank) => sum + bank.questions.length,
      0,
    ),
    banks: banks.map((bank) => ({
      bankId: bank.source.bankId,
      file: `${bank.source.bankId}.json`,
      examType: bank.source.examType,
      module: bank.source.module,
      revision: bank.source.revision,
      questionCount: bank.questions.length,
      sourceSha256: bank.sourceSha256,
      exportSha256: bank.exportSha256,
      ...(bank.source.expectedExportOmittedMinistryIds
        ? {
            expectedExportOmittedMinistryIds:
              bank.source.expectedExportOmittedMinistryIds,
          }
        : {}),
      contentSetHash: bank.contentSetHash,
    })),
  };
  await writeJsonAtomically(join(outputDirectory, "index.json"), index);
}

async function importBanksIntoMongo(
  manifest: OfficialQuestionManifest,
  banks: readonly ParsedBank[],
): Promise<void> {
  const mongodbUri = process.env.MONGODB_URI?.trim();
  const mongodbDatabase = process.env.MONGODB_DB?.trim();
  if (!mongodbUri || !mongodbDatabase) {
    throw new Error(
      "--mongo richiede le variabili MONGODB_URI e MONGODB_DB",
    );
  }

  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(mongodbUri, {
    appName: "rt-lab-question-importer",
  });

  try {
    await client.connect();
    const database = client.db(mongodbDatabase);
    const questionsCollection =
      database.collection<QuestionDocument>("questions");
    const questionBanksCollection = database.collection("questionBanks");

    await Promise.all([
      questionsCollection.createIndex(
        { bankId: 1, bankVersion: 1, ministryId: 1 },
        {
          name: "question_bank_ministry_unique",
          unique: true,
        },
      ),
      questionBanksCollection.createIndex(
        { bankId: 1, version: 1 },
        {
          name: "question_bank_version_unique",
          unique: true,
        },
      ),
    ]);

    for (const bank of banks) {
      const identity = {
        bankId: bank.source.bankId,
        version: manifest.version,
      };
      const existingBank = await questionBanksCollection.findOne(identity);
      if (
        existingBank &&
        (existingBank.sourceSha256 !== bank.sourceSha256 ||
          (existingBank.exportSha256 !== undefined &&
            existingBank.exportSha256 !== bank.exportSha256) ||
          existingBank.contentSetHash !== bank.contentSetHash ||
          existingBank.questionCount !== bank.questions.length)
      ) {
        throw new Error(
          `${bank.source.bankId}@${manifest.version} esiste con contenuto diverso: le versioni ufficiali sono immutabili`,
        );
      }

      const existingQuestions = await questionsCollection
        .find(
          {
            bankId: bank.source.bankId,
            bankVersion: manifest.version,
          },
          {
            projection: {
              ministryId: 1,
              contentHash: 1,
              sourceSha256: 1,
            },
          },
        )
        .toArray();
      const incomingByMinistryId = new Map(
        bank.questions.map((question) => [question.ministryId, question]),
      );

      for (const existingQuestion of existingQuestions) {
        const incoming = incomingByMinistryId.get(existingQuestion.ministryId);
        if (!incoming) {
          throw new Error(
            `${bank.source.bankId}@${manifest.version} contiene in Mongo una domanda non presente nella fonte: ${existingQuestion.ministryId}`,
          );
        }
        if (
          existingQuestion.contentHash !== incoming.contentHash ||
          existingQuestion.sourceSha256 !== incoming.sourceSha256
        ) {
          throw new Error(
            `${bank.source.bankId}@${manifest.version}/${existingQuestion.ministryId} esiste con contenuto diverso`,
          );
        }
        incomingByMinistryId.delete(existingQuestion.ministryId);
      }

      const missingQuestions = [...incomingByMinistryId.values()];
      for (let offset = 0; offset < missingQuestions.length; offset += 500) {
        await questionsCollection.insertMany(
          missingQuestions.slice(offset, offset + 500),
          { ordered: true },
        );
      }

      const storedCount = await questionsCollection.countDocuments({
        bankId: bank.source.bankId,
        bankVersion: manifest.version,
      });
      if (storedCount !== bank.questions.length) {
        throw new Error(
          `${bank.source.bankId}: Mongo contiene ${storedCount} domande, attese ${bank.questions.length}`,
        );
      }

      const now = new Date();
      await questionBanksCollection.updateOne(
        identity,
        {
          $setOnInsert: {
            ...identity,
            examType: bank.source.examType,
            module: bank.source.module,
            questionCount: bank.questions.length,
            sourceUrls: [bank.source.sourceUrl, bank.source.exportUrl],
            sourceSha256: bank.sourceSha256,
            exportSha256: bank.exportSha256,
            ...(bank.source.expectedExportOmittedMinistryIds
              ? {
                  expectedExportOmittedMinistryIds:
                    bank.source.expectedExportOmittedMinistryIds,
                }
              : {}),
            importedAt: now,
            status: "staged",
          },
          $set: {
            contentSetHash: bank.contentSetHash,
            lastVerifiedAt: now,
          },
        },
        { upsert: true },
      );
      await questionBanksCollection.updateMany(
        {
          examType: bank.source.examType,
          module: bank.source.module,
          status: "active",
          $nor: [identity],
        },
        {
          $set: {
            status: "archived",
            archivedAt: now,
          },
        },
      );
      await questionBanksCollection.updateOne(identity, {
        $set: {
          status: "active",
          activatedAt: now,
        },
        $unset: {
          archivedAt: "",
        },
      });

      process.stdout.write(
        `${bank.source.bankId}: ${missingQuestions.length} inserite, ${storedCount} totali\n`,
      );
    }
  } finally {
    await client.close();
  }
}

async function readManifest(path: string): Promise<OfficialQuestionManifest> {
  let candidate: unknown;
  try {
    candidate = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Impossibile leggere il manifest ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return validateOfficialManifest(candidate);
}

export async function runImport(options: CliOptions): Promise<void> {
  const manifest = await readManifest(options.manifestPath);
  const availableBankIds = new Set(
    manifest.sources.map((source) => source.bankId),
  );
  for (const selectedBankId of options.selectedBankIds) {
    if (!availableBankIds.has(selectedBankId)) {
      throw new Error(`Banca non presente nel manifest: ${selectedBankId}`);
    }
  }

  const selectedSources =
    options.selectedBankIds.size === 0
      ? manifest.sources
      : manifest.sources.filter((source) =>
          options.selectedBankIds.has(source.bankId),
        );

  const parsedBanks: ParsedBank[] = [];
  for (const source of selectedSources) {
    const parsedBank = await parseBank(manifest, source, options);
    parsedBanks.push(parsedBank);
    process.stdout.write(
      `Validata ${source.bankId}: ${parsedBank.questions.length} domande\n`,
    );
  }

  if (!options.checkOnly && options.writeJson) {
    await writeGeneratedJson(
      manifest,
      parsedBanks,
      options.outputDirectory,
    );
    process.stdout.write(`JSON generati in ${options.outputDirectory}\n`);
  }
  if (!options.checkOnly && options.writeMongo) {
    await importBanksIntoMongo(manifest, parsedBanks);
  }

  const totalQuestions = parsedBanks.reduce(
    (sum, bank) => sum + bank.questions.length,
    0,
  );
  process.stdout.write(
    `Completato: ${parsedBanks.length} banche, ${totalQuestions} domande\n`,
  );
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  await runImport(options);
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((error: unknown) => {
    if (error instanceof QuestionParseError) {
      const details = error.issues
        .slice(0, 25)
        .map(
          (issue) =>
            `- ${issue.code}${issue.ministryId ? ` [${issue.ministryId}]` : ""}: ${issue.message}`,
        )
        .join("\n");
      const omitted =
        error.issues.length > 25
          ? `\n- ...altri ${error.issues.length - 25} problemi`
          : "";
      process.stderr.write(`${error.message}\n${details}${omitted}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
