import { expect, test } from "@playwright/test";

import {
  addSessionCookie,
  ATTEMPT_ID,
  createMockApiState,
  installApiMocks,
} from "./fixtures";

test("flusso completo: scelta, 40 domande, pausa e risultato", async ({
  context,
  page,
}) => {
  const state = createMockApiState();
  await addSessionCookie(context);
  await installApiMocks(page, state);

  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /Ciao Ada, da dove ripartiamo\?/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Nuova simulazione/i }).click();

  await expect(
    page.getByRole("heading", { name: /Componi la tua prossima prova/i }),
  ).toBeVisible();
  await page
    .locator("button")
    .filter({ hasText: "Aggiornamento" })
    .first()
    .click();
  await expect(
    page.locator("button").filter({ hasText: "Modulo generale" }),
  ).toHaveCount(0);
  await page
    .locator("button")
    .filter({ hasText: "Categoria 8" })
    .first()
    .click();
  await expect(page.getByText("28 pt", { exact: true })).toBeVisible();
  const activePayloadResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/attempts/${ATTEMPT_ID}`,
  );
  await page.getByRole("button", { name: /Genera la prova/i }).click();
  const activePayload = await (await activePayloadResponse).json();
  expect(JSON.stringify(activePayload)).not.toContain("correctOptionId");
  expect(JSON.stringify(activePayload)).not.toContain("correctOption");

  await expect(page).toHaveURL(new RegExp(`/quiz/${ATTEMPT_ID}$`));
  await expect(
    page.getByRole("heading", {
      name: /Durante una verifica operativa su un trasporto di rifiuti/i,
    }),
  ).toBeVisible();
  await expect(page.getByText("ALBO-2026-0001")).toBeVisible();

  const navigator = page.getByLabel("Navigatore domande");
  await expect(navigator.getByRole("button")).toHaveCount(40);
  await expect(
    navigator.getByRole("button", { name: "Domanda 40", exact: true }),
  ).toBeVisible();

  const firstAnswer = page.getByRole("radio", {
    name: "Opzione ufficiale A della domanda 1",
  });
  await firstAnswer.check();
  await expect(firstAnswer).toBeChecked();
  await expect(
    navigator.getByRole("button", { name: /Domanda 1, risposta data/ }),
  ).toBeVisible();

  await navigator
    .getByRole("button", { name: "Domanda 40", exact: true })
    .click();
  await expect(page.getByText("ALBO-2026-0040")).toBeVisible();
  await page
    .getByRole("button", { name: /Lascia senza risposta/i })
    .click();
  await expect(
    navigator.getByRole("button", { name: /Domanda 40, omessa/ }),
  ).toBeVisible();

  await navigator
    .getByRole("button", { name: "Domanda 2", exact: true })
    .click();
  await page
    .getByRole("radio", {
      name: "Opzione ufficiale B della domanda 2",
    })
    .check();
  await expect(
    navigator.getByRole("button", { name: /Domanda 2, risposta data/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pausa", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("In pausa", { exact: true })).toBeVisible();
  await expect(page.getByText(/2 risposte su 40/)).toBeVisible();

  await page.getByRole("link", { name: /Riprendi/i }).click();
  await expect(page).toHaveURL(new RegExp(`/quiz/${ATTEMPT_ID}$`));
  await expect(
    page.getByRole("heading", { name: /Il tempo è fermo a/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Riprendi la prova/i }).click();
  await expect(page.getByText("ALBO-2026-0003")).toBeVisible();

  await page.getByRole("button", { name: "Termina", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Vuoi consegnare la prova?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("38", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Risposte omesse")).toBeVisible();
  await dialog.getByRole("button", { name: "Consegna ora" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/quiz/${ATTEMPT_ID}/risultato$`),
  );
  await expect(
    page.getByRole("heading", { name: /Un dato da cui ripartire/i }),
  ).toBeVisible();
  await expect(page.getByText("0,5", { exact: true })).toBeVisible();
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /Errate 1/ }).click();
  await expect(
    page.getByText(
      "Quesito ufficiale di collaudo numero 2: individua l'opzione corretta nel caso descritto.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button")
    .filter({ hasText: "ALBO-2026-0002" })
    .click();
  await expect(page.getByText("La tua risposta")).toBeVisible();
  await expect(
    page.getByText("Opzione ufficiale B della domanda 2"),
  ).toBeVisible();
  await expect(page.getByText("Risposta corretta")).toBeVisible();
  await expect(
    page.getByText("Opzione ufficiale A della domanda 2"),
  ).toBeVisible();

  const activeQuizPayloads = state.requests.filter(
    (request) =>
      request.method === "GET" &&
      request.pathname === `/api/attempts/${ATTEMPT_ID}`,
  );
  expect(activeQuizPayloads.length).toBeGreaterThanOrEqual(2);
});
