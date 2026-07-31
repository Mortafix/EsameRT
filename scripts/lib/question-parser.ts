import { createHash } from "node:crypto";

export const EXAM_TYPES = ["initial", "update"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const QUESTION_MODULES = [
  "general",
  "cat145",
  "cat8",
  "cat9",
  "cat10",
] as const;
export type QuestionModule = (typeof QUESTION_MODULES)[number];

export interface OfficialQuestionSource {
  bankId: string;
  label: string;
  examType: ExamType;
  module: QuestionModule;
  revision: number;
  idSet: number;
  isAggiornamento: boolean;
  pdfFile: string;
  sourceUrl: string;
  expectedSourceSha256: string;
  exportFile: string;
  exportUrl: string;
  expectedExportSha256: string;
  expectedExportOmittedMinistryIds?: string[];
  expectedQuestionCount: number;
}

export interface OfficialQuestionManifest {
  schemaVersion: 1;
  version: string;
  locale: "it-IT";
  publishedAt: string;
  verifiedAt: string;
  indexUrl: string;
  noticeUrl: string;
  rulesUrl: string;
  sources: OfficialQuestionSource[];
}

export interface QuestionOption {
  id: "A" | "B" | "C" | "D";
  text: string;
}

export interface QuestionDocument {
  bankId: string;
  bankVersion: string;
  examType: ExamType;
  module: QuestionModule;
  subject: string;
  subtopic?: string;
  ministryId: string;
  rawText: string;
  text: string;
  options: [QuestionOption, QuestionOption, QuestionOption, QuestionOption];
  correctOptionId: QuestionOption["id"];
  revision: number;
  sourceUrl: string;
  sourceSha256: string;
  contentHash: string;
  createdAt: Date;
}

export interface QuestionParseMetadata {
  bankId: string;
  bankVersion: string;
  examType: ExamType;
  module: QuestionModule;
  revision: number;
  sourceUrl: string;
  sourceSha256: string;
  createdAt: Date;
}

export type QuestionValidationCode =
  | "duplicate-ministry-id"
  | "empty-option"
  | "empty-question"
  | "export-content-mismatch"
  | "export-layout"
  | "header-contamination"
  | "invalid-content-hash"
  | "invalid-ministry-id"
  | "invalid-option-count"
  | "invalid-option-ids"
  | "invalid-source-hash"
  | "missing-correct-option"
  | "missing-subject"
  | "multiple-correct-options";

export interface QuestionValidationIssue {
  code: QuestionValidationCode;
  message: string;
  ministryId?: string;
}

interface DraftOption {
  correct: boolean;
  lines: string[];
}

interface DraftQuestion {
  ministryId: string;
  questionLines: string[];
  options: DraftOption[];
  subject: string;
  subtopic?: string;
}

type HeadingKind = "subject" | "subtopic";

interface PendingHeading {
  kind: HeadingKind;
  lines: string[];
}

const MINISTRY_ID_PATTERN = /^[A-Z0-9]+_\d+_\d{5}$/u;
const QUESTION_START_PATTERN =
  /^\s*([A-Z0-9]+_\d+_\d{5})\s*:\s*(.*?)\s*$/u;
const OPTION_START_PATTERN =
  /^\s*(?:[-\u2013\u2014]\s*)?(Esatta|Sbagliata)\s*:\s*(.*?)\s*$/iu;
const HEADING_START_PATTERN =
  /^\s*(Materia|Sottomateria)\s*:\s*(\d+(?:\.\d+)*\.?\s*.+)$/iu;
const HEADER_CONTAMINATION_PATTERN =
  /(?:QUIZ VERIFICHE DI IDONEITÀ|Modulo di partecipazione\s*:|Data ultima revisione\s*:|Pagina\s+\d+\s+di\s+\d+|(?:^|\s)Materia\s*:)/iu;
const OPTION_IDS = ["A", "B", "C", "D"] as const;
const EXPORT_COLUMN_LABELS = [
  "Materia",
  "Domanda",
  "Risposta Esatta",
  "Risposta2",
  "Risposta3",
  "Risposta4",
] as const;

export class QuestionParseError extends Error {
  readonly issues: QuestionValidationIssue[];

  constructor(message: string, issues: QuestionValidationIssue[]) {
    super(message);
    this.name = "QuestionParseError";
    this.issues = issues;
  }
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Applies only layout-safe cleanup. It preserves spelling, capitalization,
 * quotation marks and punctuation chosen by the official source.
 */
export function normalizeOfficialText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\uFEFF|\u200B|\u2060/gu, "")
    .replace(/\u00AD/gu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/([\p{L}\p{N}])\s*-\s*\n\s*(?=[\p{Ll}\p{N}])/gu, "$1-")
    .replace(/[\u00A0\u2007\u202F]/gu, " ")
    .replace(/[ \t]*\n[ \t]*/gu, " ")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/\s+([,.;:!?%])/gu, "$1")
    .replace(/([([{«“])\s+/gu, "$1")
    .replace(/\s+([)\]}»”])/gu, "$1")
    .trim();
}

function normalizeOfficialHeading(value: string): string {
  return normalizeOfficialText(value).replace(
    /^(\d+(?:\.\d+)*\.)(?=\p{L})/u,
    "$1 ",
  );
}

export function calculateContentHash(
  text: string,
  optionTexts: readonly string[],
): string {
  const canonicalOptions = optionTexts
    .map((option) => normalizeOfficialText(option))
    .sort((left, right) => left.localeCompare(right, "it"));

  return sha256Hex(
    JSON.stringify({
      text: normalizeOfficialText(text),
      options: canonicalOptions,
    }),
  );
}

function canonicalizeForExportCrosscheck(value: string): string {
  return normalizeOfficialText(value)
    .replace(/[’‘]/gu, "'")
    .replace(/[“”«»"]/gu, "")
    .replace(/riﬁu/gu, "rifiuti")
    .replace(/ﬁ/gu, "fi")
    .replace(/ﬂ/gu, "fl")
    .replace(/\bTRUE\b/gu, "VERO")
    .replace(/\bFALSE\b/gu, "FALSO")
    .replace(/(?:^|\s)-\s*Sbagliata:\s*/giu, " ")
    // A leading minus may sit exactly on a table-column boundary and be
    // assigned to the adjacent cell by Poppler. Ignore only unary numeric
    // signs in this secondary cross-check; the ID-bearing source remains the
    // authoritative text stored in the generated bank.
    .replace(/\s*-\s*(?=\d)/gu, " ")
    .replace(/\s*-\s*/gu, "-")
    .replace(
      /(^|\s)(\d+(?:\.\d+)*\.)\s*(?=\p{L})/gu,
      "$1$2",
    )
    .replace(
      /(^|\s)(\p{L}\.)\s*(?=\p{Lu})/gu,
      "$1$2",
    )
    .trim();
}

interface ExportTsvWord {
  page: number;
  paragraph: number;
  block: number;
  line: number;
  left: number;
  top: number;
  width: number;
  text: string;
}

function parseExportTsv(extractedExportTsv: string): ExportTsvWord[] {
  const words: ExportTsvWord[] = [];
  for (const row of extractedExportTsv.replace(/\r\n?/gu, "\n").split("\n")) {
    const fields = row.split("\t");
    if (fields[0] !== "5" || fields.length < 12) {
      continue;
    }
    const word = {
      page: Number(fields[1]),
      paragraph: Number(fields[2]),
      block: Number(fields[3]),
      line: Number(fields[4]),
      left: Number(fields[6]),
      top: Number(fields[7]),
      width: Number(fields[8]),
      text: fields.slice(11).join("\t"),
    };
    if (
      !Number.isFinite(word.page) ||
      !Number.isFinite(word.left) ||
      !Number.isFinite(word.top) ||
      !Number.isFinite(word.width) ||
      word.text.length === 0
    ) {
      continue;
    }
    words.push(word);
  }
  return words;
}

function exportColumnStarts(
  words: readonly ExportTsvWord[],
  firstQuestion: QuestionDocument,
): number[] {
  const firstPageWords = words.filter((word) => word.page === 1);
  const headerTop = Math.min(
    ...firstPageWords
      .filter((word) => word.text === "Materia")
      .map((word) => word.top),
  );
  const headerWords = firstPageWords.filter(
    (word) => Math.abs(word.top - headerTop) < 0.5,
  );
  const labelBounds = EXPORT_COLUMN_LABELS.map((label) => {
    const labelParts = label.split(" ");
    const matchedWords = labelParts.map((part) =>
      headerWords.find((word) => word.text === part),
    );
    if (matchedWords.some((word) => word === undefined)) {
      return undefined;
    }
    const left = Math.min(
      ...matchedWords.map((word) => (word as ExportTsvWord).left),
    );
    const right = Math.max(
      ...matchedWords.map(
        (word) =>
          (word as ExportTsvWord).left + (word as ExportTsvWord).width,
      ),
    );
    return { center: (left + right) / 2 };
  });
  if (
    !Number.isFinite(headerTop) ||
    labelBounds.some((bounds) => bounds === undefined)
  ) {
    throw new QuestionParseError(
      "Intestazione TSV dell'export ufficiale non riconosciuta",
      [
        {
          code: "export-layout",
          message: "Le sei intestazioni tabellari non sono presenti",
        },
      ],
    );
  }

  const firstBodyLeft = Math.min(
    ...firstPageWords
      .filter((word) => word.top > headerTop + 2)
      .map((word) => word.left),
  );
  if (!Number.isFinite(firstBodyLeft)) {
    throw new QuestionParseError(
      "Corpo TSV dell'export ufficiale non riconosciuto",
      [
        {
          code: "export-layout",
          ministryId: firstQuestion.ministryId,
          message: "Non è stato possibile calcolare il margine della tabella",
        },
      ],
    );
  }

  const starts = [firstBodyLeft];
  for (let columnIndex = 0; columnIndex < labelBounds.length - 1; columnIndex += 1) {
    const headerCenter = labelBounds[columnIndex]?.center;
    const previousStart = starts[columnIndex];
    if (headerCenter === undefined || previousStart === undefined) {
      break;
    }
    starts.push(2 * headerCenter - previousStart);
  }
  return starts;
}

function buildExportColumnStreams(
  words: readonly ExportTsvWord[],
  firstQuestion: QuestionDocument,
): string[] {
  const starts = exportColumnStarts(words, firstQuestion);
  const boundaries = starts.slice(1).map((start) => start - 0.5);
  const columnWords = EXPORT_COLUMN_LABELS.map(
    () => [] as ExportTsvWord[],
  );

  for (const word of words) {
    const center = word.left + word.width / 2;
    const columnIndex = boundaries.findIndex(
      (boundary) => center < boundary,
    );
    const resolvedColumn =
      columnIndex < 0 ? EXPORT_COLUMN_LABELS.length - 1 : columnIndex;
    columnWords[resolvedColumn]?.push(word);
  }

  return columnWords.map((wordsInColumn) => {
    const orderedWords = [...wordsInColumn].sort(
      (left, right) =>
        left.page - right.page ||
        left.top - right.top ||
        left.left - right.left,
    );
    const fragments: string[] = [];
    let previousLine = "";
    for (const word of orderedWords) {
      const lineKey = `${word.page}:${word.top.toFixed(2)}`;
      if (fragments.length > 0) {
        fragments.push(previousLine === lineKey ? " " : "\n");
      }
      fragments.push(word.text);
      previousLine = lineKey;
    }
    return canonicalizeForExportCrosscheck(fragments.join(""));
  });
}

interface MatchedExportRange {
  end: number;
  start: number;
}

function rangesOverlap(
  left: MatchedExportRange,
  right: MatchedExportRange,
): boolean {
  return left.start < right.end && right.start < left.end;
}

function findUnmatchedExportOccurrence(
  stream: string,
  expected: string,
  matchedRanges: readonly MatchedExportRange[],
): MatchedExportRange | undefined {
  let position = stream.indexOf(expected);
  while (position >= 0) {
    const candidate = {
      start: position,
      end: position + expected.length,
    };
    if (
      !matchedRanges.some((matchedRange) =>
        rangesOverlap(candidate, matchedRange),
      )
    ) {
      return candidate;
    }
    position = stream.indexOf(expected, position + 1);
  }
  return undefined;
}

function findOrderedExportCell(
  stream: string,
  expected: string,
  cursor: number,
  allowTruncatedTail: boolean,
): MatchedExportRange | undefined {
  const exactPosition = stream.indexOf(expected, cursor);
  if (exactPosition >= 0) {
    return {
      start: exactPosition,
      end: exactPosition + expected.length,
    };
  }
  if (!allowTruncatedTail || expected.length < 80) {
    return undefined;
  }

  const words = expected.split(" ");
  const minimumWordCount = Math.max(4, Math.ceil(words.length * 0.8));
  for (
    let wordCount = words.length - 1;
    wordCount >= minimumWordCount;
    wordCount -= 1
  ) {
    const prefix = words.slice(0, wordCount).join(" ");
    if (prefix.length < 80) {
      break;
    }
    const position = stream.indexOf(prefix, cursor);
    if (position >= 0) {
      return {
        start: position,
        end: position + prefix.length,
      };
    }
  }
  return undefined;
}

function findUnmatchedExportCell(
  stream: string,
  expected: string,
  matchedRanges: readonly MatchedExportRange[],
  allowTruncatedTail: boolean,
): MatchedExportRange | undefined {
  const exact = findUnmatchedExportOccurrence(
    stream,
    expected,
    matchedRanges,
  );
  if (exact !== undefined || !allowTruncatedTail || expected.length < 80) {
    return exact;
  }

  const words = expected.split(" ");
  const minimumWordCount = Math.max(4, Math.ceil(words.length * 0.8));
  for (
    let wordCount = words.length - 1;
    wordCount >= minimumWordCount;
    wordCount -= 1
  ) {
    const prefix = words.slice(0, wordCount).join(" ");
    if (prefix.length < 80) {
      break;
    }
    const occurrence = findUnmatchedExportOccurrence(
      stream,
      prefix,
      matchedRanges,
    );
    if (occurrence !== undefined) {
      return occurrence;
    }
  }
  return undefined;
}

/**
 * Cross-checks the ID-bearing source against the separate wide-table export
 * linked by the official July 2026 notice. Initial-bank rows must retain their
 * order. Update exports are checked by exact membership because the official
 * table groups rows differently. Any omission already present in an official
 * export must be declared by ministry ID in the hash-locked manifest.
 * Distractors are matched across the three interchangeable distractor columns.
 */
export function crosscheckOfficialExport(
  extractedExportTsv: string,
  questions: readonly QuestionDocument[],
  expectedOmittedMinistryIds: readonly string[] = [],
): void {
  if (questions.length === 0) {
    throw new QuestionParseError(
      "Impossibile verificare un export senza domande",
      [{ code: "export-content-mismatch", message: "La banca è vuota" }],
    );
  }

  const words = parseExportTsv(extractedExportTsv);
  if (words.length === 0) {
    throw new QuestionParseError(
      "Il TSV dell'export ufficiale è vuoto",
      [
        {
          code: "export-layout",
          message: "pdftotext non ha estratto parole con coordinate",
        },
      ],
    );
  }
  const streams = buildExportColumnStreams(
    words,
    questions[0] as QuestionDocument,
  );
  const orderedColumnIndexes = [0, 1, 2] as const;
  const cursors = orderedColumnIndexes.map(() => 0);
  const updateRows: {
    cells: [string, string, string];
    distractors: string[];
    ministryId: string;
  }[] = [];
  const distractors: {
    ministryId: string;
    text: string;
  }[] = [];

  for (const question of questions) {
    const correctOption = question.options.find(
      (option) => option.id === question.correctOptionId,
    );
    if (correctOption === undefined) {
      throw new QuestionParseError(
        `Risposta corretta non trovata per ${question.ministryId}`,
        [
          {
            code: "missing-correct-option",
            ministryId: question.ministryId,
            message: "L'ID della risposta corretta non appartiene alle opzioni",
          },
        ],
      );
    }
    const expectedCells: [string, string, string] = [
      canonicalizeForExportCrosscheck(question.subject),
      canonicalizeForExportCrosscheck(question.text),
      canonicalizeForExportCrosscheck(correctOption.text),
    ];
    const questionDistractors = question.options
      .filter((option) => option.id !== question.correctOptionId)
      .map((option) => canonicalizeForExportCrosscheck(option.text));

    if (question.examType === "update") {
      updateRows.push({
        cells: expectedCells,
        distractors: questionDistractors,
        ministryId: question.ministryId,
      });
      continue;
    }

    for (const columnIndex of orderedColumnIndexes) {
      const expected = expectedCells[columnIndex];
      const stream = streams[columnIndex] ?? "";
      const match = findOrderedExportCell(
        stream,
        expected,
        cursors[columnIndex] ?? 0,
        columnIndex === 1,
      );
      if (match === undefined) {
        throw new QuestionParseError(
          `L'export ufficiale diverge alla domanda ${question.ministryId}`,
          [
            {
              code: "export-content-mismatch",
              ministryId: question.ministryId,
              message: [
                `Contenuto o ordine differente nella colonna ${EXPORT_COLUMN_LABELS[columnIndex]}.`,
                `Atteso: ${expected.slice(0, 360)}`,
                `Export: ${stream.slice(cursors[columnIndex] ?? 0, (cursors[columnIndex] ?? 0) + 480)}`,
              ].join(" "),
            },
          ],
        );
      }
      cursors[columnIndex] = match.end;
    }

    for (const text of questionDistractors) {
      distractors.push({
        ministryId: question.ministryId,
        text,
      });
    }
  }

  if (questions[0]?.examType === "update") {
    const questionStream = streams[1] ?? "";
    const questionRanges: MatchedExportRange[] = [];
    const matchedRows: typeof updateRows = [];
    const rowsByQuestionLength = [...updateRows].sort(
      (left, right) =>
        right.cells[1].length - left.cells[1].length ||
        left.ministryId.localeCompare(right.ministryId, "it"),
    );
    for (const row of rowsByQuestionLength) {
      const occurrence = findUnmatchedExportCell(
        questionStream,
        row.cells[1],
        questionRanges,
        true,
      );
      if (occurrence !== undefined) {
        questionRanges.push(occurrence);
        matchedRows.push(row);
      }
    }

    const matchedIds = new Set(
      matchedRows.map((row) => row.ministryId),
    );
    const missingIds = updateRows
      .filter((row) => !matchedIds.has(row.ministryId))
      .map((row) => row.ministryId);
    const expectedMissingIds = new Set(expectedOmittedMinistryIds);
    const unexpectedMissingIds = missingIds.filter(
      (ministryId) => !expectedMissingIds.has(ministryId),
    );
    const unexpectedlyPresentIds = expectedOmittedMinistryIds.filter(
      (ministryId) => matchedIds.has(ministryId),
    );
    const unknownExpectedIds = expectedOmittedMinistryIds.filter(
      (ministryId) =>
        !updateRows.some((row) => row.ministryId === ministryId),
    );

    if (
      unexpectedMissingIds.length > 0 ||
      unexpectedlyPresentIds.length > 0 ||
      unknownExpectedIds.length > 0 ||
      missingIds.length !== expectedMissingIds.size
    ) {
      throw new QuestionParseError(
        "Le omissioni dell'export ufficiale di aggiornamento non coincidono con il manifest",
        [
          {
            code: "export-content-mismatch",
            message: [
              `Assenti non dichiarate: ${unexpectedMissingIds.slice(0, 8).join(", ") || "nessuna"}.`,
              `Dichiarate ma presenti: ${unexpectedlyPresentIds.slice(0, 8).join(", ") || "nessuna"}.`,
              `Dichiarate ma non appartenenti alla banca: ${unknownExpectedIds.slice(0, 8).join(", ") || "nessuna"}.`,
            ].join(" "),
          },
        ],
      );
    }

    for (const columnIndex of [0, 2] as const) {
      const stream = streams[columnIndex] ?? "";
      const matchedRanges: MatchedExportRange[] = [];
      const cells = matchedRows.map((row) => ({
        ministryId: row.ministryId,
        text: row.cells[columnIndex],
      }));
      cells.sort(
        (left, right) =>
          right.text.length - left.text.length ||
          left.ministryId.localeCompare(right.ministryId, "it"),
      );
      for (const cell of cells) {
        const occurrence = findUnmatchedExportCell(
          stream,
          cell.text,
          matchedRanges,
          false,
        );
        if (occurrence === undefined) {
          throw new QuestionParseError(
            `L'export ufficiale diverge alla domanda ${cell.ministryId}`,
            [
              {
                code: "export-content-mismatch",
                ministryId: cell.ministryId,
                message: `Contenuto assente dalla colonna ${EXPORT_COLUMN_LABELS[columnIndex]}: ${cell.text.slice(0, 360)}`,
              },
            ],
          );
        }
        matchedRanges.push(occurrence);
      }
    }

    for (const row of matchedRows) {
      for (const text of row.distractors) {
        distractors.push({
          ministryId: row.ministryId,
          text,
        });
      }
    }
  }

  const distractorStreams = streams.slice(3);
  const matchedRanges = distractorStreams.map(
    () => [] as MatchedExportRange[],
  );
  distractors.sort(
    (left, right) =>
      right.text.length - left.text.length ||
      left.ministryId.localeCompare(right.ministryId, "it"),
  );

  for (const distractor of distractors) {
    let matched = false;
    for (
      let streamIndex = 0;
      streamIndex < distractorStreams.length;
      streamIndex += 1
    ) {
      const occurrence = findUnmatchedExportOccurrence(
        distractorStreams[streamIndex] ?? "",
        distractor.text,
        matchedRanges[streamIndex] ?? [],
      );
      if (occurrence !== undefined) {
        matchedRanges[streamIndex]?.push(occurrence);
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new QuestionParseError(
        `L'export ufficiale diverge alla domanda ${distractor.ministryId}`,
        [
          {
            code: "export-content-mismatch",
            ministryId: distractor.ministryId,
            message: `Distrattore assente dall'export: ${distractor.text.slice(0, 160)}`,
          },
        ],
      );
    }
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} deve essere un oggetto`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label}.${key} deve essere una stringa non vuota`);
  }
  return value;
}

function requiredInteger(
  record: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(`${label}.${key} deve essere un intero`);
  }
  return value;
}

function requiredBoolean(
  record: Record<string, unknown>,
  key: string,
  label: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new TypeError(`${label}.${key} deve essere booleano`);
  }
  return value;
}

function isExamType(value: string): value is ExamType {
  return EXAM_TYPES.some((candidate) => candidate === value);
}

function isQuestionModule(value: string): value is QuestionModule {
  return QUESTION_MODULES.some((candidate) => candidate === value);
}

function assertHttpUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} non è un URL valido`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError(`${label} deve usare HTTP o HTTPS`);
  }
  return url;
}

export function validateOfficialManifest(
  candidate: unknown,
): OfficialQuestionManifest {
  const manifest = asRecord(candidate, "manifest");
  if (manifest.schemaVersion !== 1) {
    throw new TypeError("manifest.schemaVersion deve essere 1");
  }
  if (manifest.locale !== "it-IT") {
    throw new TypeError("manifest.locale deve essere it-IT");
  }

  const version = requiredString(manifest, "version", "manifest");
  const publishedAt = requiredString(manifest, "publishedAt", "manifest");
  const verifiedAt = requiredString(manifest, "verifiedAt", "manifest");
  const indexUrl = requiredString(manifest, "indexUrl", "manifest");
  const noticeUrl = requiredString(manifest, "noticeUrl", "manifest");
  const rulesUrl = requiredString(manifest, "rulesUrl", "manifest");

  if (Number.isNaN(Date.parse(publishedAt))) {
    throw new TypeError("manifest.publishedAt deve essere una data ISO valida");
  }
  if (Number.isNaN(Date.parse(verifiedAt))) {
    throw new TypeError("manifest.verifiedAt deve essere una data valida");
  }
  assertHttpUrl(indexUrl, "manifest.indexUrl");
  assertHttpUrl(noticeUrl, "manifest.noticeUrl");
  assertHttpUrl(rulesUrl, "manifest.rulesUrl");

  if (!Array.isArray(manifest.sources) || manifest.sources.length !== 9) {
    throw new TypeError(
      "manifest.sources deve contenere esattamente le nove banche ufficiali",
    );
  }

  const sources = manifest.sources.map((unknownSource, index) => {
    const label = `manifest.sources[${index}]`;
    const source = asRecord(unknownSource, label);
    const bankId = requiredString(source, "bankId", label);
    const sourceLabel = requiredString(source, "label", label);
    const examType = requiredString(source, "examType", label);
    const questionModule = requiredString(source, "module", label);
    const revision = requiredInteger(source, "revision", label);
    const idSet = requiredInteger(source, "idSet", label);
    const isAggiornamento = requiredBoolean(
      source,
      "isAggiornamento",
      label,
    );
    const pdfFile = requiredString(source, "pdfFile", label);
    const sourceUrl = requiredString(source, "sourceUrl", label);
    const expectedSourceSha256 = requiredString(
      source,
      "expectedSourceSha256",
      label,
    ).toLowerCase();
    const exportFile = requiredString(source, "exportFile", label);
    const exportUrl = requiredString(source, "exportUrl", label);
    const expectedExportSha256 = requiredString(
      source,
      "expectedExportSha256",
      label,
    ).toLowerCase();
    const rawExpectedExportOmissions =
      source.expectedExportOmittedMinistryIds;
    if (
      rawExpectedExportOmissions !== undefined &&
      !Array.isArray(rawExpectedExportOmissions)
    ) {
      throw new TypeError(
        `${label}.expectedExportOmittedMinistryIds deve essere un array`,
      );
    }
    const expectedExportOmittedMinistryIds = (
      rawExpectedExportOmissions ?? []
    ).map((value, omissionIndex) => {
      if (
        typeof value !== "string" ||
        !MINISTRY_ID_PATTERN.test(value)
      ) {
        throw new TypeError(
          `${label}.expectedExportOmittedMinistryIds[${omissionIndex}] non è un ID ministeriale valido`,
        );
      }
      return value;
    });
    const expectedQuestionCount = requiredInteger(
      source,
      "expectedQuestionCount",
      label,
    );

    if (!isExamType(examType)) {
      throw new TypeError(`${label}.examType non è supportato`);
    }
    if (!isQuestionModule(questionModule)) {
      throw new TypeError(`${label}.module non è supportato`);
    }
    if (examType === "update" && questionModule === "general") {
      throw new TypeError("Il modulo generale di aggiornamento non esiste");
    }
    if ((examType === "update") !== isAggiornamento) {
      throw new TypeError(
        `${label}.isAggiornamento non coincide con examType`,
      );
    }
    if (
      examType === "initial" &&
      expectedExportOmittedMinistryIds.length > 0
    ) {
      throw new TypeError(
        `${label}.expectedExportOmittedMinistryIds è ammesso solo per l'aggiornamento`,
      );
    }
    if (
      new Set(expectedExportOmittedMinistryIds).size !==
      expectedExportOmittedMinistryIds.length
    ) {
      throw new TypeError(
        `${label}.expectedExportOmittedMinistryIds contiene duplicati`,
      );
    }
    if (revision < 1 || idSet < 1 || expectedQuestionCount < 40) {
      throw new TypeError(`${label} contiene valori numerici non validi`);
    }
    if (!/^[a-z0-9][a-z0-9-]+$/u.test(bankId)) {
      throw new TypeError(`${label}.bankId non è uno slug valido`);
    }
    if (!/^[a-z0-9][a-z0-9-]+\.pdf$/u.test(pdfFile)) {
      throw new TypeError(`${label}.pdfFile non è un nome PDF sicuro`);
    }
    if (!/^[a-z0-9][a-z0-9-]+\.pdf$/u.test(exportFile)) {
      throw new TypeError(`${label}.exportFile non è un nome PDF sicuro`);
    }
    if (!/^[a-f0-9]{64}$/u.test(expectedSourceSha256)) {
      throw new TypeError(`${label}.expectedSourceSha256 non è SHA-256`);
    }
    if (!/^[a-f0-9]{64}$/u.test(expectedExportSha256)) {
      throw new TypeError(`${label}.expectedExportSha256 non è SHA-256`);
    }

    const parsedSourceUrl = assertHttpUrl(sourceUrl, `${label}.sourceUrl`);
    if (
      parsedSourceUrl.hostname !== "www.albonazionalegestoriambientali.it" ||
      parsedSourceUrl.pathname !==
        "/RT/HttpHandler/DownloadSetDomande.ashx" ||
      parsedSourceUrl.searchParams.get("idSet") !== String(idSet) ||
      parsedSourceUrl.searchParams.get("isAggiornamento") !==
        (isAggiornamento ? "1" : "0") ||
      parsedSourceUrl.searchParams.get("lang")?.toUpperCase() !== "IT"
    ) {
      throw new TypeError(
        `${label}.sourceUrl non coincide con i metadati della fonte ufficiale`,
      );
    }
    const parsedExportUrl = assertHttpUrl(exportUrl, `${label}.exportUrl`);
    if (
      parsedExportUrl.hostname !== "www.albonazionalegestoriambientali.it" ||
      !decodeURIComponent(parsedExportUrl.pathname).startsWith(
        "/Download/it/News/Verifiche lingua italiana/",
      ) ||
      !parsedExportUrl.pathname.toLocaleLowerCase("it").endsWith(".pdf")
    ) {
      throw new TypeError(
        `${label}.exportUrl non punta all'export della notizia ufficiale`,
      );
    }

    return {
      bankId,
      label: sourceLabel,
      examType,
      module: questionModule,
      revision,
      idSet,
      isAggiornamento,
      pdfFile,
      sourceUrl,
      expectedSourceSha256,
      exportFile,
      exportUrl,
      expectedExportSha256,
      ...(expectedExportOmittedMinistryIds.length > 0
        ? { expectedExportOmittedMinistryIds }
        : {}),
      expectedQuestionCount,
    } satisfies OfficialQuestionSource;
  });

  const expectedCombinations = new Set([
    "initial:general",
    "initial:cat145",
    "initial:cat8",
    "initial:cat9",
    "initial:cat10",
    "update:cat145",
    "update:cat8",
    "update:cat9",
    "update:cat10",
  ]);
  const combinations = new Set<string>();
  const bankIds = new Set<string>();
  const idSets = new Set<number>();

  for (const source of sources) {
    const combination = `${source.examType}:${source.module}`;
    if (!expectedCombinations.has(combination)) {
      throw new TypeError(`Combinazione banca inattesa: ${combination}`);
    }
    if (combinations.has(combination)) {
      throw new TypeError(`Combinazione banca duplicata: ${combination}`);
    }
    if (bankIds.has(source.bankId)) {
      throw new TypeError(`bankId duplicato: ${source.bankId}`);
    }
    if (idSets.has(source.idSet)) {
      throw new TypeError(`idSet duplicato: ${source.idSet}`);
    }
    combinations.add(combination);
    bankIds.add(source.bankId);
    idSets.add(source.idSet);
  }

  for (const expectedCombination of expectedCombinations) {
    if (!combinations.has(expectedCombination)) {
      throw new TypeError(`Banca mancante: ${expectedCombination}`);
    }
  }

  return {
    schemaVersion: 1,
    version,
    locale: "it-IT",
    publishedAt,
    verifiedAt,
    indexUrl,
    noticeUrl,
    rulesUrl,
    sources,
  };
}

function isIgnorablePageFurniture(line: string): boolean {
  return (
    /^QUIZ VERIFICHE DI IDONEITÀ DEL RESPONSABILE TECNICO$/iu.test(line) ||
    /^\(art\.?\s*13,.*Delibera.*n\.?\s*6\/2025\)$/iu.test(line) ||
    /^MODULO (?:GENERALE|SPECIALISTICO)\b.*$/iu.test(line) ||
    /^(?:VERIFICA INIZIALE|AGGIORNAMENTO)$/iu.test(line) ||
    /^Modulo di partecipazione\s*:/iu.test(line) ||
    /^Data ultima revisione\s*:/iu.test(line) ||
    /^Pagina\s+\d+\s+di\s+\d+$/iu.test(line)
  );
}

function mergeSplitOptionMarkers(lines: string[]): string[] {
  const merged: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    if (
      /^\s*[-\u2013\u2014]\s*$/u.test(line) &&
      /^\s*(?:Esatta|Sbagliata)\s*:/iu.test(next)
    ) {
      merged.push(`- ${next.trimStart()}`);
      index += 1;
      continue;
    }
    merged.push(line);
  }
  return merged;
}

function cleanRawLines(lines: readonly string[]): string {
  return lines
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function createQuestionDocument(
  draft: DraftQuestion,
  metadata: QuestionParseMetadata,
): QuestionDocument {
  const rawText = cleanRawLines(draft.questionLines);
  const text = normalizeOfficialText(rawText);
  const optionTexts = draft.options.map((option) =>
    normalizeOfficialText(cleanRawLines(option.lines)),
  );
  const options = OPTION_IDS.map((id, index) => ({
    id,
    text: optionTexts[index] ?? "",
  })) as [QuestionOption, QuestionOption, QuestionOption, QuestionOption];
  const correctIndexes = draft.options.flatMap((option, index) =>
    option.correct ? [index] : [],
  );
  const correctOptionId = OPTION_IDS[correctIndexes[0] ?? 0];

  return {
    bankId: metadata.bankId,
    bankVersion: metadata.bankVersion,
    examType: metadata.examType,
    module: metadata.module,
    subject: normalizeOfficialText(draft.subject),
    ...(draft.subtopic
      ? { subtopic: normalizeOfficialText(draft.subtopic) }
      : {}),
    ministryId: draft.ministryId,
    rawText,
    text,
    options,
    correctOptionId,
    revision: metadata.revision,
    sourceUrl: metadata.sourceUrl,
    sourceSha256: metadata.sourceSha256.toLowerCase(),
    contentHash: calculateContentHash(text, optionTexts),
    createdAt: new Date(metadata.createdAt),
  };
}

export function validateQuestionDocuments(
  questions: readonly QuestionDocument[],
): QuestionValidationIssue[] {
  const issues: QuestionValidationIssue[] = [];
  const ministryIds = new Set<string>();

  for (const question of questions) {
    const ministryId = question.ministryId;
    if (!MINISTRY_ID_PATTERN.test(ministryId)) {
      issues.push({
        code: "invalid-ministry-id",
        ministryId,
        message: `ID ministeriale non valido: ${ministryId}`,
      });
    }
    if (ministryIds.has(ministryId)) {
      issues.push({
        code: "duplicate-ministry-id",
        ministryId,
        message: `ID ministeriale duplicato nella banca: ${ministryId}`,
      });
    }
    ministryIds.add(ministryId);

    if (question.text.length === 0) {
      issues.push({
        code: "empty-question",
        ministryId,
        message: "Il testo della domanda è vuoto",
      });
    }
    if (question.subject.length === 0) {
      issues.push({
        code: "missing-subject",
        ministryId,
        message: "La materia ufficiale è assente",
      });
    }
    if (question.options.length !== 4) {
      issues.push({
        code: "invalid-option-count",
        ministryId,
        message: `Sono presenti ${question.options.length} opzioni invece di 4`,
      });
    }
    if (
      question.options.some((option, index) => option.id !== OPTION_IDS[index])
    ) {
      issues.push({
        code: "invalid-option-ids",
        ministryId,
        message: "Gli ID opzione devono essere A, B, C e D nell'ordine fonte",
      });
    }
    if (question.options.some((option) => option.text.length === 0)) {
      issues.push({
        code: "empty-option",
        ministryId,
        message: "Una o più opzioni sono vuote",
      });
    }
    if (!question.options.some((option) => option.id === question.correctOptionId)) {
      issues.push({
        code: "missing-correct-option",
        ministryId,
        message: "La risposta corretta non appartiene alle quattro opzioni",
      });
    }
    if (
      HEADER_CONTAMINATION_PATTERN.test(question.text) ||
      question.options.some((option) =>
        HEADER_CONTAMINATION_PATTERN.test(option.text),
      )
    ) {
      issues.push({
        code: "header-contamination",
        ministryId,
        message: "Un'intestazione o piè di pagina è confluito nel contenuto",
      });
    }
    if (!/^[a-f0-9]{64}$/u.test(question.sourceSha256)) {
      issues.push({
        code: "invalid-source-hash",
        ministryId,
        message: "sourceSha256 non è un hash SHA-256 valido",
      });
    }
    const expectedContentHash = calculateContentHash(
      question.text,
      question.options.map((option) => option.text),
    );
    if (question.contentHash !== expectedContentHash) {
      issues.push({
        code: "invalid-content-hash",
        ministryId,
        message: "contentHash non coincide con il contenuto normalizzato",
      });
    }
  }

  return issues;
}

export function parseOfficialQuestionText(
  extractedText: string,
  metadata: QuestionParseMetadata,
): QuestionDocument[] {
  const lines = mergeSplitOptionMarkers(
    extractedText
      .replace(/\r\n?/gu, "\n")
      .replace(/\f/gu, "\n")
      .replace(/\u0000/gu, "")
      .split("\n"),
  );

  const questions: QuestionDocument[] = [];
  const structuralIssues: QuestionValidationIssue[] = [];
  let currentSubject = "";
  let currentSubtopic: string | undefined;
  let pendingHeading: PendingHeading | undefined;
  let draft: DraftQuestion | undefined;

  const finishHeading = (): void => {
    if (!pendingHeading) {
      return;
    }
    const heading = normalizeOfficialHeading(
      cleanRawLines(pendingHeading.lines),
    );
    if (pendingHeading.kind === "subject") {
      currentSubject = heading;
      currentSubtopic = undefined;
    } else {
      currentSubtopic = heading;
    }
    pendingHeading = undefined;
  };

  const finishQuestion = (): void => {
    if (!draft) {
      return;
    }

    const correctCount = draft.options.filter((option) => option.correct).length;
    if (draft.options.length !== 4) {
      structuralIssues.push({
        code: "invalid-option-count",
        ministryId: draft.ministryId,
        message: `Sono presenti ${draft.options.length} opzioni invece di 4`,
      });
    }
    if (correctCount === 0) {
      structuralIssues.push({
        code: "missing-correct-option",
        ministryId: draft.ministryId,
        message: "La fonte non indica alcuna risposta esatta",
      });
    }
    if (correctCount > 1) {
      structuralIssues.push({
        code: "multiple-correct-options",
        ministryId: draft.ministryId,
        message: `La fonte indica ${correctCount} risposte esatte`,
      });
    }

    if (draft.options.length === 4 && correctCount === 1) {
      questions.push(createQuestionDocument(draft, metadata));
    }
    draft = undefined;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      finishHeading();
      continue;
    }
    if (isIgnorablePageFurniture(line)) {
      continue;
    }

    const headingMatch = line.match(HEADING_START_PATTERN);
    if (headingMatch) {
      finishHeading();
      finishQuestion();
      pendingHeading = {
        kind:
          headingMatch[1]?.toLocaleLowerCase("it") === "sottomateria"
            ? "subtopic"
            : "subject",
        lines: [headingMatch[2] ?? ""],
      };
      continue;
    }

    const questionMatch = line.match(QUESTION_START_PATTERN);
    if (questionMatch) {
      finishHeading();
      finishQuestion();
      draft = {
        ministryId: questionMatch[1] ?? "",
        questionLines: [questionMatch[2] ?? ""],
        options: [],
        subject: currentSubject,
        ...(currentSubtopic ? { subtopic: currentSubtopic } : {}),
      };
      continue;
    }

    const optionMatch = line.match(OPTION_START_PATTERN);
    if (optionMatch && draft) {
      finishHeading();
      draft.options.push({
        correct: optionMatch[1]?.toLocaleLowerCase("it") === "esatta",
        lines: [optionMatch[2] ?? ""],
      });
      continue;
    }

    if (pendingHeading) {
      pendingHeading.lines.push(line);
      continue;
    }
    if (!draft) {
      continue;
    }
    const currentOption = draft.options.at(-1);
    if (currentOption) {
      currentOption.lines.push(line);
    } else {
      draft.questionLines.push(line);
    }
  }

  finishHeading();
  finishQuestion();

  const validationIssues = [
    ...structuralIssues,
    ...validateQuestionDocuments(questions),
  ];
  if (validationIssues.length > 0) {
    throw new QuestionParseError(
      `La banca ${metadata.bankId} non supera la validazione (${validationIssues.length} problemi)`,
      validationIssues,
    );
  }
  if (questions.length === 0) {
    throw new QuestionParseError(
      `Nessuna domanda riconosciuta nella banca ${metadata.bankId}`,
      [
        {
          code: "empty-question",
          message: "Il parser non ha riconosciuto alcuna domanda",
        },
      ],
    );
  }

  return questions;
}
