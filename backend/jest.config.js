module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  // Eigene, leere Datenbank pro Testdatei (siehe setup.ts)
  setupFiles: ["<rootDir>/src/__tests__/setup.ts"],
  // bcrypt (Cost 12) macht Logins bewusst langsam
  testTimeout: 30000,
  verbose: true,
};
