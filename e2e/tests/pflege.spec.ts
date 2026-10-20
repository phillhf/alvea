import { test, expect } from "@playwright/test";
import { asRole, freeBed, world } from "./helpers";

test.use({ storageState: asRole("pflege") });

test.describe("Pflege – Meine Station", () => {
  test("Bettenreinigung mit drei Tipps anfordern @mobil", async ({ page, request }) => {
    const bed = await freeBed(request, world().station1A);
    await page.goto("/meine-station");

    await page.getByRole("button", { name: /Bettenreinigung anfordern/ }).click();
    const dialog = page.locator(".fixed").filter({ hasText: "Bett antippen" });
    // Nur eine Station zugeordnet → keine Stationsauswahl
    await expect(dialog.getByText("Station *")).toHaveCount(0);

    // Bett direkt in der Zimmerzeile antippen
    const row = dialog.locator("div.flex.items-center").filter({ hasText: `Zi. ${bed.room_number}` });
    await row.getByRole("button", { name: bed.bed_number, exact: true }).click();
    await expect(dialog.getByText("Reinigungsart *")).toBeVisible(); // Normal ist vorbelegt
    await dialog.getByRole("button", { name: "Reinigung anfordern" }).click();

    await expect(page.getByText(`Zi. ${bed.room_number} · Bett ${bed.bed_number}`)).toBeVisible();
    await expect(page.getByText(/aktiver Auftrag|aktive Aufträge/)).toBeVisible();
  });

  test("Defekt mit Zimmer melden – Station wird mitgespeichert", async ({ page }) => {
    await page.goto("/meine-station");
    await page.getByRole("button", { name: /Defektes Bett/ }).click();

    const dialog = page.locator(".fixed").filter({ hasText: "Defektes Bett melden" });
    await expect(dialog.getByRole("button", { name: "Defekt melden" })).toBeDisabled();
    await dialog.getByPlaceholder(/Seitengitter/).fill("Bremse blockiert");
    await dialog.locator("select").filter({ hasText: "kein bestimmtes Zimmer" }).selectOption({ label: "Zimmer 1A-03" });
    await dialog.getByRole("button", { name: "Defekt melden" }).click();

    await expect(page.getByText("Station 1A · Zimmer 1A-03").first()).toBeVisible();
  });
});
