import { api, buildWorld, login, World } from "./helpers";

let w: World;
let pflegeA: string, pflegeB: string, reinigungA: string, reinigungB: string;

beforeAll(async () => {
  w = await buildWorld();
  pflegeA    = await login(w.users.pflegeA);
  pflegeB    = await login(w.users.pflegeB);
  reinigungA = await login(w.users.reinigungA);
  reinigungB = await login(w.users.reinigungB);
});

async function bedStatus(bedId: string, stationId: string): Promise<string> {
  const res = await api(w.admin).get(`/api/beds?station_id=${stationId}`);
  return res.body.find((b: any) => b.id === bedId)?.status;
}

describe("Bettenaufbereitung – kompletter Ablauf", () => {
  let taskId: string;
  const bed = () => w.stationA.rooms[0].beds[0];

  it("Pflege fordert eine Reinigung an", async () => {
    const res = await api(pflegeA).post("/api/tasks", { category: "bed_cleaning", bed_id: bed(), cleaning_type: "normal" });
    expect(res.status).toBe(201);
    taskId = res.body.id;
    expect(res.body.status).toBe("offen");
    expect(await bedStatus(bed(), w.stationA.id)).toBe("angefordert");
  });

  it("verhindert einen zweiten aktiven Auftrag für dasselbe Bett", async () => {
    const res = await api(pflegeA).post("/api/tasks", { category: "bed_cleaning", bed_id: bed(), cleaning_type: "normal" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("active_task_exists");
  });

  it("Pflege darf den Auftrag nicht selbst annehmen", async () => {
    expect((await api(pflegeA).post(`/api/tasks/${taskId}/claim`)).status).toBe(403);
  });

  it("Reinigungskraft einer anderen Station darf ihn nicht annehmen", async () => {
    expect((await api(reinigungB).post(`/api/tasks/${taskId}/claim`)).status).toBe(403);
  });

  it("Reinigungskraft der Station nimmt an → unterwegs", async () => {
    const res = await api(reinigungA).post(`/api/tasks/${taskId}/claim`);
    expect(res.status).toBe(200);
    const t = await api(reinigungA).get(`/api/tasks/${taskId}`);
    expect(t.body.status).toBe("unterwegs");
  });

  it("angekommen → laufend (Annehmen startet direkt)", async () => {
    expect((await api(reinigungA).patch(`/api/tasks/${taskId}`, { status: "angekommen" })).status).toBe(200);
    expect((await api(reinigungA).patch(`/api/tasks/${taskId}`, { status: "laufend" })).status).toBe(200);
    expect(await bedStatus(bed(), w.stationA.id)).toBe("in_bearbeitung");
  });

  it("andere Reinigungskräfte dürfen den laufenden Auftrag nicht ändern", async () => {
    expect((await api(reinigungB).patch(`/api/tasks/${taskId}`, { status: "abgeschlossen" })).status).toBe(403);
  });

  it("Abschließen speichert den Barcode im selben Schritt", async () => {
    const res = await api(reinigungA).patch(`/api/tasks/${taskId}`, { status: "abgeschlossen", scanned_barcode: "BETT-0001" });
    expect(res.status).toBe(200);
    const t = await api(reinigungA).get(`/api/tasks/${taskId}`);
    expect(t.body.status).toBe("abgeschlossen");
    expect(t.body.scanned_barcode).toBe("BETT-0001");
    expect(t.body.completed_at).toBeTruthy();
    expect(await bedStatus(bed(), w.stationA.id)).toBe("frei");
  });

  it("nach dem Abschluss ist eine neue Anforderung wieder möglich", async () => {
    const res = await api(pflegeA).post("/api/tasks", { category: "bed_cleaning", bed_id: bed(), cleaning_type: "infektioes", pathogens: ["MRSA"] });
    expect(res.status).toBe(201);
  });
});

describe("Sichtbarkeit nach Station", () => {
  it("Aufträge von Station A sind für Station B nicht sichtbar", async () => {
    const own = await api(reinigungA).get("/api/tasks?category=bed_cleaning");
    const foreign = await api(reinigungB).get("/api/tasks?category=bed_cleaning");
    expect(own.status).toBe(200);
    expect(own.body.length).toBeGreaterThan(0);
    expect(foreign.status).toBe(200);
    expect(foreign.body).toHaveLength(0);
  });

  it("Pflege von Station B kann für Station A keine Reinigung anfordern", async () => {
    const res = await api(pflegeB).post("/api/tasks", {
      category: "bed_cleaning", bed_id: w.stationA.rooms[1].beds[0], cleaning_type: "normal",
    });
    expect(res.status).toBe(403);
  });
});

describe("Scheuer-Wisch", () => {
  it("kann ohne Desinfektionsmaßnahme angefordert werden", async () => {
    const res = await api(pflegeA).post("/api/tasks", {
      category: "room_cleaning", room_id: w.stationA.rooms[1].id, cleaning_type: "schlussdesinfektion", pathogens: [],
    });
    expect(res.status).toBe(201);
  });
});
