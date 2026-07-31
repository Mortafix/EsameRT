import { expect, test } from "@playwright/test";

import { createMockApiState, installApiMocks } from "./fixtures";

test("accesso con il solo codice e sessione persistente", async ({ page }) => {
  const state = createMockApiState();
  await installApiMocks(page, state);

  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: /Preparati con più consapevolezza/i }),
  ).toBeVisible();
  const code = page.getByLabel("Codice personale");
  const submit = page.getByRole("button", { name: "Entra in RT Lab" });

  await expect(submit).toBeDisabled();
  await code.fill("ADA-RT2026");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: /Ciao Ada, da dove ripartiamo\?/i }),
  ).toBeVisible();
  await expect(page.getByText("Ada Lovelace", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: /Ciao Ada, da dove ripartiamo\?/i }),
  ).toBeVisible();
});
