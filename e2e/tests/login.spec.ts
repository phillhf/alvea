import { test, expect } from "@playwright/test";

const PFLEGE = { email: "pflege@e2e.local", password: "Test-Passwort-1" };

test.describe("Anmeldung", () => {
  test("Formular heißt E-Mail und meldet ein falsches Passwort", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("E-Mail", { exact: true })).toBeVisible();
    await page.getByPlaceholder("name@beispiel.de").fill(PFLEGE.email);
    await page.getByPlaceholder("Passwort").fill("falsch");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("form")).toContainText(/ungültig|falsch|fehl/i);
  });

  // Regression 1.2.0: Module wurden vor dem Login geladen und galten danach bis
  // zum Neuladen als abgeschaltet → Knöpfe/Menüpunkte fehlten.
  test("nach dem Login sind die Module ohne Neuladen aktiv @mobil", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("name@beispiel.de").fill(PFLEGE.email);
    await page.getByPlaceholder("Passwort").fill(PFLEGE.password);
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page).toHaveURL(/\/meine-station/);
    await expect(page.getByRole("button", { name: /Bettenreinigung anfordern/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Defektes Bett/ })).toBeVisible();
    // Standardmäßig abgeschaltete Module: keine Knöpfe
    await expect(page.getByRole("button", { name: /Spind-Anfrage/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Sauerstoff/ })).toHaveCount(0);
    // Regression: SQLite liefert 0/1 – darf nicht als "0" auf der Seite landen
    await expect(page.getByText(/^0+$/)).toHaveCount(0);
  });
});
