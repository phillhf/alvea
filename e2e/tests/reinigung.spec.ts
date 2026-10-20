import { test, expect } from "@playwright/test";
import { asRole, auth, freeBed, world } from "./helpers";

test.use({ storageState: asRole("reinigung") });

test.describe("Reinigungskraft – Bettenaufbereitung", () => {
  test("ein Bett in vier Schritten erledigen, Barcode wird mitgespeichert @mobil", async ({ page, request }) => {
    // Auftrag wie von der Pflege angefordert
    const bed = await freeBed(request, world().station2B);
    const created = await request.post("/api/tasks", {
      headers: auth("admin"),
      data: { category: "bed_cleaning", bed_id: bed.id, cleaning_type: "normal" },
    });
    expect(created.status()).toBe(201);
    const taskId = (await created.json()).id;

    await page.goto("/");
    const card = page.locator(".card-interactive").filter({ hasText: "Station 2B" });

    // 1) Auf dem Weg
    await card.getByRole("button", { name: /Auf dem Weg zur Station/ }).click();
    // 2) Angekommen → Station öffnet sich automatisch
    await card.getByRole("button", { name: /Auf der Station angekommen/ }).click();
    await expect(page).toHaveURL(/\/stations\//);

    // 3) Annehmen → Auftrag läuft sofort (kein zweites "im Zimmer annehmen")
    const taskCard = page.locator(".card").filter({ hasText: `Zi. ${bed.room_number}` }).filter({ hasText: `Stellplatz ${bed.bed_number}` });
    await taskCard.getByRole("button", { name: /Annehmen/ }).click();
    await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}`));
    await expect(page.getByRole("button", { name: /Auftrag im Zimmer annehmen/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Speichern" })).toHaveCount(0);

    // 4) Barcode eingeben und direkt abschließen – ohne Rückfrage
    await page.getByPlaceholder("Barcode eingeben…").fill(`E2E-${bed.room_number}-${bed.bed_number}`);
    await page.getByRole("button", { name: /Auftrag als erledigt melden/ }).click();
    await expect(page).toHaveURL(/\/stations\//);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const task = await (await request.get(`/api/tasks/${taskId}`, { headers: auth("admin") })).json();
    expect(task.status).toBe("abgeschlossen");
    expect(task.scanned_barcode).toBe(`E2E-${bed.room_number}-${bed.bed_number}`);
  });
});
