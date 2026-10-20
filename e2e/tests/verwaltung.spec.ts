import { test, expect } from "@playwright/test";
import { asRole } from "./helpers";

test.use({ storageState: asRole("admin") });

test.describe("Verwaltung", () => {
  test.beforeEach(async ({ page }) => {
    // Zuletzt geöffneten Bereich vergessen → immer mit der Übersicht starten
    await page.addInitScript(() => sessionStorage.clear());
  });

  test("Übersicht zeigt Gruppen und Verknüpfungen", async ({ page }) => {
    await page.goto("/admin/hierarchy");
    const main = page.locator("main");
    for (const group of ["Fachliche Stammdaten", "Darstellung & Module", "System"]) {
      await expect(main.getByRole("heading", { name: group, exact: true })).toBeVisible();
    }
    await expect(main.getByRole("link", { name: /Raumbuch/ })).toBeVisible();
    await expect(main.getByRole("link", { name: /Benutzer & Rollen/ })).toBeVisible();
    await expect(page.getByText("Raumbuchung")).toHaveCount(0);
  });

  test("Löschen fragt im App-Dialog nach, Abbrechen lässt den Eintrag stehen", async ({ page }) => {
    await page.goto("/admin/hierarchy");
    await page.getByRole("button", { name: /Bett-Typen/ }).click();
    await expect(page.getByText("Standardbett")).toBeVisible();

    const deleteButtons = page.getByRole("button", { name: "🗑" });
    const before = await deleteButtons.count();
    await deleteButtons.last().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("löschen?");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(deleteButtons).toHaveCount(before);
  });

  test("Update-Bereich zeigt die installierte Version", async ({ page }) => {
    await page.goto("/admin/hierarchy");
    await page.getByRole("button", { name: /Update/ }).click();
    await expect(page.getByText("Installiert")).toBeVisible();
    await expect(page.getByText(/^\d+\.\d+\.\d+$/).first()).toBeVisible();
  });
});
