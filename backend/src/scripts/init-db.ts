import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { db, query, newId, migrate, ensureWaesche } from "../config/db";
import { ALL_PERMISSIONS } from "../types";

async function main() {
  console.log("📦 Schema anlegen und migrieren...");

  // Basis-Schema zuerst anlegen
  const schemaPath = path.resolve(__dirname, "../../../db/init.sql");
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, "utf-8"));
  }

  // Migrationen – Fehler loggen aber nicht abbrechen
  try {
    migrate();
  } catch (e: any) {
    console.warn("⚠️  Migrations-Fehler (wird ignoriert):", e.message);
  }

  // ensureWaesche immer ausführen – stellt alle Tabellen/Spalten sicher
  try {
    ensureWaesche();
  } catch { /* ignorieren */ }

  const { rows: exist } = query(`SELECT id FROM users LIMIT 1`);
  if (exist.length) {
    console.log("✓ Daten existieren bereits – Seed übersprungen.");
    return;
  }

  console.log("🌱 Grunddaten einspielen...");

  // ── Krankheitserreger (RKI §7 IfSG) ──────────────────────────────────────
  const pathogens: Array<[string, string, string, number, string, string, string]> = [
    ["MRSA",    "MRSA",             "Methicillin-resistenter Staphylococcus aureus",              1,
      "Flächendesinfektion auf Alkoholbasis (Meliseptol® Foam pure, Mikrozid® AF)",
      "Einmal-Reinigungstücher, keine Stoffbezüge wiederverwenden",
      "PSA: Schutzkittel, Einmalhandschuhe, ggf. MNS. EWZ laut Herstellerangabe. RKI-Empfehlung 2014."],
    ["VRE",     "VRE",              "Vancomycin-resistente Enterokokken",                          1,
      "Flächendesinfektion mit sporozider Wirkung oder Aldehyd-basiert",
      "Einmal-Reinigungstücher, mechanische Reinigung vor Desinfektion",
      "Hohe Umgebungsresistenz – gründliche Wischdesinfektion ALLER Kontaktflächen. PSA: Kittel + Handschuhe."],
    ["3MRGN",   "3MRGN",            "Multiresistente gramnegative Stäbchen (3-fach)",              1,
      "Flächendesinfektionsmittel mit begrenzt viruzider Wirkung",
      "Einmaltücher, feuchtes Wischen",
      "PSA: Handschuhe, bei Spritzgefahr Kittel + MNS. Sanitär besonders gründlich."],
    ["4MRGN",   "4MRGN",            "Multiresistente gramnegative Stäbchen (4-fach, z.B. CRKP)",   1,
      "Flächendesinfektion mit nachgewiesener Wirksamkeit gegen MRGN",
      "Einmaltücher zwingend, mechanische Reinigung wichtig",
      "PSA: Kittel, Handschuhe, MNS. Isolierung! Alle Kontaktflächen desinfizieren."],
    ["ESBL",    "ESBL",             "Extended-Spectrum Beta-Lactamase Bildner",                    2,
      "Übliche Flächendesinfektion (begrenzt viruzid)",
      "Einmaltücher",
      "PSA: Handschuhe. Händedesinfektion nach jedem Kontakt."],
    ["CDIFF",   "C. difficile",     "Clostridioides difficile – Sporenbildner (meldepflichtig)",   1,
      "⚠️ SPORIZID: Peressigsäure-basiert (Perform®). Alkohol-basiert reicht NICHT!",
      "Einmaltücher, mechanische Reinigung zwingend vor Desinfektion",
      "Sporen alkoholresistent! Händewaschen mit Seife (kein Desinfektionsmittel allein). EWZ min. 15 Min."],
    ["NORO",    "Norovirus",        "Akute Gastroenteritis, hoch kontagiös (meldepflichtig)",      1,
      "Viruzides Desinfektionsmittel (VAH 'viruzid', z.B. Apesin® AP100)",
      "Einmaltücher, Erbrochenes/Stuhl vorher aufnehmen",
      "PSA: Kittel, Handschuhe, MNS, ggf. Schutzbrille. Sanitär + Türklinken besonders."],
    ["ROTA",    "Rotavirus",        "Gastroenteritis, v.a. Kinder (meldepflichtig)",               2,
      "Viruzides Desinfektionsmittel (begrenzt viruzid PLUS)",
      "Einmaltücher",
      "PSA: Kittel, Handschuhe. Windel-/Ausscheidungshygiene."],
    ["INFLU",   "Influenza",        "Saisonale Grippe (meldepflichtig bei Ausbruch/Krankenhaus)",  2,
      "Begrenzt viruzides Flächendesinfektionsmittel",
      "Einmaltücher oder Standard-Reinigung",
      "PSA: MNS, Handschuhe. Aerogene Übertragung – Raum lüften."],
    ["SARS2",   "SARS-CoV-2",       "COVID-19 (meldepflichtig)",                                   2,
      "Begrenzt viruzides Flächendesinfektionsmittel",
      "Einmaltücher",
      "PSA: FFP2, Schutzkittel, Handschuhe, Schutzbrille. Häufig berührte Flächen."],
    ["RSV",     "RSV",              "Respiratorisches Synzytial-Virus",                            2,
      "Begrenzt viruzides Flächendesinfektionsmittel",
      "Einmaltücher",
      "PSA: MNS, Handschuhe. Kontaktübertragung."],
    ["MASERN",  "Masern",           "Masernvirus – hochkontagiös, aerogen (meldepflichtig)",       1,
      "Viruzides Desinfektionsmittel",
      "Einmaltücher",
      "⚠️ Aerogene Übertragung. PSA: FFP2/FFP3, Kittel, Handschuhe. Isolierzimmer."],
    ["VARIZ",   "Varizellen/VZV",   "Windpocken/Herpes Zoster (meldepflichtig)",                  1,
      "Viruzides Desinfektionsmittel",
      "Einmaltücher",
      "PSA: FFP2, Kittel, Handschuhe. Aerogene + Tröpfchenübertragung. Isolierzimmer."],
    ["TBC",     "Tuberkulose",      "Mycobacterium tuberculosis, offene TBC (meldepflichtig)",     1,
      "Tuberkulozides Desinfektionsmittel (VAH 'tuberkulozid', z.B. Incidin® Pro)",
      "Einmaltücher, mechanische Reinigung wichtig",
      "PSA: FFP3-Maske zwingend, Kittel, Handschuhe. Raum erst nach 2h Lüftung betreten."],
    ["MENINGO", "Meningokokken",    "Neisseria meningitidis – Meningitis/Sepsis (meldepflichtig)", 1,
      "Begrenzt viruzides Flächendesinfektionsmittel",
      "Einmaltücher",
      "PSA: MNS, Handschuhe. Prophylaxe für Kontaktpersonen prüfen!"],
    ["LEGIO",   "Legionellen",      "Legionella pneumophila – Lungenentzündung (meldepflichtig)",  1,
      "Standard-Flächendesinfektion",
      "Gründliche Nassreinigung",
      "Keine Mensch-zu-Mensch-Übertragung. Wasseranlage prüfen. PSA: Handschuhe."],
    ["PERTUS",  "Pertussis",        "Bordetella pertussis – Keuchhusten (meldepflichtig)",         2,
      "Begrenzt viruzides Flächendesinfektionsmittel",
      "Einmaltücher",
      "PSA: MNS, Handschuhe. Isolierung in erster Woche."],
    ["SCAB",    "Scabies",          "Krätze – Sarcoptes scabiei",                                  2,
      "Standard-Flächendesinfektion",
      "Textilien bei 60°C waschen oder 3 Tage versiegelt lagern",
      "PSA: langärmliger Kittel, Handschuhe. Matratze absaugen + desinfizieren."],
    ["ACINETO", "Acinetobacter",    "Acinetobacter baumannii, oft multiresistent",                 1,
      "Flächendesinfektion mit begrenzt viruzider Wirkung",
      "Einmaltücher, mechanische Reinigung",
      "Hohe Umweltresistenz! Alle Oberflächen gründlich reinigen. PSA: Kittel + Handschuhe."],
    ["SONSTIG", "Sonstiger Erreger","Frei eintragbar – Details in den Auftragsnotizen",            3,
      "Je nach Erreger – Notizen/Hygieneplan beachten",
      "Standard-Reinigung",
      "Details im Notizfeld des Auftrags angeben."],
  ];

  pathogens.forEach(([code, name, desc, sev, dis, cln, notes]) => {
    try {
      query(
        `INSERT OR IGNORE INTO pathogens (code,name,description,severity,disinfectant,cleaning_agent,hygiene_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [code, name, desc, sev, dis, cln, notes]
      );
    } catch { /* bereits vorhanden – ignorieren */ }
  });

  // ── Bett-Typen ─────────────────────────────────────────────────────────────
  const bedTypes: [string, string][] = [
    ["Standardbett",       "Standard-Krankenhausbett"],
    ["Intensivbett",       "ICU/Intensiv mit erweiterter Elektrik"],
    ["Pflegebett",         "Niedrigflurbett / Pflegebett"],
    ["Kinderbett",         "Bett für pädiatrische Stationen"],
    ["Entbindungsbett",    "Geburtsbett / Kreißsaalbett"],
    ["Bariatrisches Bett", "XXL-Bett für adipöse Patienten"],
    ["Notfallbett",        "Mobiles Notfall-/Schleusenbett"],
  ];
  bedTypes.forEach(([name, desc]) => {
    try {
      query(`INSERT OR IGNORE INTO bed_types (id,name,description) VALUES ($1,$2,$3)`, [newId(), name, desc]);
    } catch { /* ignorieren */ }
  });

  // ── Admin-Rolle sicherstellen ──────────────────────────────────────────────
  const allPerms = ALL_PERMISSIONS;
  let adminRoleId = (query<any>(`SELECT id FROM roles WHERE name='Administrator' LIMIT 1`).rows[0] as any)?.id;
  if (!adminRoleId) {
    adminRoleId = newId();
    query(`INSERT INTO roles (id,name,permissions) VALUES ($1,$2,$3)`,
      [adminRoleId, "Administrator", JSON.stringify(allPerms)]);
  } else {
    query(`UPDATE roles SET permissions=$1 WHERE id=$2`, [JSON.stringify(allPerms), adminRoleId]);
  }

  // ── Admin-Nutzer ───────────────────────────────────────────────────────────
  // Prüft alle bisherigen Login-Domains: neue Installationen bekommen
  // @alvea.local, bestehende Installationen (vor den Umbenennungen) behalten
  // ihre bisherige Adresse, damit beim Update kein doppelter Admin entsteht.
  const existingAdmin = query<any>(
    `SELECT id, email FROM users WHERE email IN ('admin@alvea.local','admin@openclinic.local','admin@bettenaufbereitung.local') LIMIT 1`
  ).rows[0];
  if (!existingAdmin) {
    const hash = await bcrypt.hash("admin123", 10);
    const pin  = await bcrypt.hash("1234", 10);
    query(
      `INSERT INTO users (id,email,password_hash,pin_hash,full_name,active,role_id)
       VALUES ($1,'admin@alvea.local',$2,$3,'Administrator',1,$4)`,
      [newId(), hash, pin, adminRoleId]
    );
    console.log("   Login: admin@alvea.local / admin123");
  } else {
    query(`UPDATE users SET role_id=$1, active=1 WHERE id=$2`, [adminRoleId, existingAdmin.id]);
    console.log("   Admin-User bereits vorhanden – Rolle aktualisiert.");
    console.log(`   Login: ${existingAdmin.email} / (bestehendes Passwort)`);
  }
  console.log("\n✅ Einrichtung abgeschlossen.");
  console.log("   ⚠️  Passwort nach dem ersten Login sofort ändern!");
  console.log("");
  console.log("   Nächste Schritte unter Verwaltung:");
  console.log("   1. Haus anlegen");
  console.log("   2. Bereiche anlegen");
  console.log("   3. Stationen anlegen");
  console.log("   4. Zimmer und Betten anlegen");
  console.log("   5. Mitarbeiter anlegen und Bereiche zuweisen");
}

main().catch((e) => { console.error(e); process.exit(1); });
