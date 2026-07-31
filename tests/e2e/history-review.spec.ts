import { expect, test } from "@playwright/test";

import {
  addSessionCookie,
  createMockApiState,
  installApiMocks,
} from "./fixtures";

test("storico: filtri e cancellazione definitiva aggiornano subito l'archivio", async ({
  context,
  page,
}) => {
  const state = createMockApiState();
  await addSessionCookie(context);
  await installApiMocks(page, state);

  await page.goto("/storico");

  await expect(
    page.getByRole("heading", { name: /Ogni prova lascia una traccia utile/i }),
  ).toBeVisible();
  await expect(page.getByText("2 prove", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Categoria 8", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Categorie 1 · 4 · 5",
      exact: true,
    }),
  ).toBeVisible();

  await page.getByLabel("Esito").selectOption("passed");
  await expect(page.getByText("1 prova", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Categoria 8", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Categorie 1 · 4 · 5",
      exact: true,
    }),
  ).toHaveCount(0);

  await page.getByLabel("Esito").selectOption("all");
  await page
    .getByRole("button", { name: "Elimina prova Categoria 8" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Eliminare questa prova?",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(/Statistiche e ripasso saranno ricalcolati/i),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Elimina definitivamente" })
    .click();

  await expect(page.getByText("1 prova", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Categoria 8", exact: true }),
  ).toHaveCount(0);
  expect(state.history.map((attempt) => attempt.id)).toEqual([
    "historic-cat145-failed",
  ]);
  expect(
    state.requests.some(
      (request) =>
        request.method === "DELETE" &&
        request.pathname === "/api/history/historic-cat8-passed",
    ),
  ).toBe(true);
});

test("ripasso: feed senza answer key, feedback ufficiale e una sola visita per domanda", async ({
  context,
  page,
}) => {
  const state = createMockApiState();
  await addSessionCookie(context);
  await installApiMocks(page, state);

  const feedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/review",
  );
  await page.goto("/ripasso");
  const feedPayload = await (await feedResponse).json();
  expect(JSON.stringify(feedPayload)).not.toContain("correctOptionId");

  await expect(
    page.getByRole("heading", { name: /Parti dagli errori, non da zero/i }),
  ).toBeVisible();
  await expect(page.getByText("ALBO-RIPASSO-0001")).toBeVisible();
  await expect(
    page.getByText("7", { exact: true }).first(),
  ).toBeVisible();

  await page
    .getByRole("radio", { name: "Un adempimento non sufficiente" })
    .click();
  await page.getByRole("button", { name: /Verifica risposta/i }).click();
  await expect(
    page.getByText("Non era questa la risposta ufficiale."),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "L'adempimento ufficiale corretto" }),
  ).toBeVisible();
  await expect(
    page.getByText(/RT Lab non aggiunge spiegazioni generate/i),
  ).toBeVisible();

  await page.getByRole("button", { name: /Prossima domanda/i }).click();
  await expect(page.getByText("ALBO-RIPASSO-0002")).toBeVisible();
  await expect(page.getByText("ALBO-RIPASSO-0001")).toHaveCount(0);

  await page
    .getByRole("radio", { name: "Il controllo ufficiale corretto" })
    .click();
  await page.getByRole("button", { name: /Verifica risposta/i }).click();
  await expect(page.getByText("Risposta corretta.")).toBeVisible();
  await page.getByRole("button", { name: /Prossima domanda/i }).click();

  await expect(
    page.getByRole("heading", { name: "Hai rivisto tutto il gruppo." }),
  ).toBeVisible();
  const answers = state.requests.filter(
    (request) =>
      request.method === "POST" && request.pathname === "/api/review",
  );
  expect(answers).toHaveLength(2);
  expect(answers.map((request) => request.body)).toEqual([
    {
      questionId: "review-q1",
      optionId: "review-q1-b",
    },
    {
      questionId: "review-q2",
      optionId: "review-q2-a",
    },
  ]);
});
