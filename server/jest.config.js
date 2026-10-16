module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts",
    "!src/triggers.ts",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testTimeout: 10000,
  // Locally, half the cores: each ts-jest worker can grow to ~3 GB, and the default
  // (cores - 1) filled a 16 GB Mac and froze it. CI keeps Jest's default (Jest rejects
  // `maxWorkers: undefined`, so the key is left out there).
  ...(process.env.CI ? {} : { maxWorkers: "50%" }),
  verbose: true,
};
