import { expect, test } from "@playwright/test";

import {
  addSessionCookie,
  createMockApiState,
  installApiMocks,
} from "./fixtures";

test.beforeEach(async ({ context, page }) => {
  await addSessionCookie(context);
  await installApiMocks(page, createMockApiState());
});

test("statistiche personali con campione e grafici accessibili", async ({
  page,
}) => {
  await page.goto("/statistiche");

  await expect(
    page.getByRole("heading", { name: "Statistiche", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("12 esami nel campione")).toBeVisible();
  await expect(page.getByText("Punteggio medio", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: /Grafico dei punteggi nel tempo/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Argomenti da rinforzare" }),
  ).toBeVisible();
});

test("pannello admin mostra solo metriche aggregate e utenti", async ({
  page,
}) => {
  await page.goto("/admin");

  await expect(
    page.getByRole("heading", { name: "Amministrazione", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Vista aggregata")).toBeVisible();
  await expect(
    page.getByText("Nessun dettaglio risposta visibile"),
  ).toBeVisible();
  await expect(
    page.getByText("Ada Lovelace", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText("Bruno Rossi", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mostra codice di Ada Lovelace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: /Grafico giornaliero degli accessi/i,
    }),
  ).toBeVisible();
});
