/**
 * Shared command-line handling for the multilingual migration scripts. They connect the way
 * the server does (MONGO_BASE_ADDRESS, MONGO_DB_PREFIX, MONGO_SINGLE_DATABASE from
 * server/.env) and are dry runs unless `--apply` is given.
 */
import mongoose from "mongoose";
import { DATABASE } from "../config";

export interface CliOptions {
  apply: boolean;
  batchSize: number;
  only: string[];
}

export function parseArgs(argv: string[]): CliOptions {
  const value = (name: string) => {
    const inline = argv.find((a) => a.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const batch = parseInt(value("batch-size") || "", 10);
  return {
    apply: argv.includes("--apply"),
    batchSize: Number.isInteger(batch) && batch > 0 ? batch : 500,
    only: (value("only") || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

/** The physical database the server's `user_content` data lives in. */
export function databaseName(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.MONGO_SINGLE_DATABASE === "true") return undefined; // the database named in the URI
  return `${env.MONGO_DB_PREFIX || "subturtle_"}${DATABASE}`;
}

export async function connect(env: NodeJS.ProcessEnv = process.env) {
  const uri = env.MONGO_BASE_ADDRESS || "mongodb://localhost:27017";
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
  const name = databaseName(env);
  const db = name ? connection.useDb(name, { useCache: true }).db : connection.db;
  return { connection, db, label: `${db?.databaseName}` };
}

export function banner(script: string, options: CliOptions, label: string) {
  console.log(`[${script}] database: ${label}`);
  console.log(
    options.apply
      ? `[${script}] APPLY: changes will be written`
      : `[${script}] dry run: nothing is written (add --apply to write)`
  );
}
