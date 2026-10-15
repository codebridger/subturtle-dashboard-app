/**
 * A real in-memory MongoDB for tests of the per-language records (ADR-006). Each test file
 * mocks `getCollection` to read from the `models` map this returns, so the services run real
 * queries, upserts and unique indexes.
 */
import mongoose, { Connection, Model, Schema } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

export interface MemoryMongo {
  connection: Connection;
  models: Record<string, Model<any>>;
  /** Registers a model; `schema` defaults to a loose one that keeps every field. */
  model(name: string, schema?: Schema): Model<any>;
  clear(): Promise<void>;
  stop(): Promise<void>;
}

export async function startMemoryMongo(models: Record<string, Model<any>>): Promise<MemoryMongo> {
  const server = await MongoMemoryServer.create();
  const connection = await mongoose.createConnection(server.getUri()).asPromise();
  return {
    connection,
    models,
    model(name, schema) {
      const m = connection.model(name, schema || new Schema({}, { strict: false, timestamps: true }), name);
      models[name] = m;
      return m;
    },
    async clear() {
      await Promise.all(Object.values(models).map((m) => m.deleteMany({})));
    },
    async stop() {
      await connection.close();
      await server.stop();
    },
  };
}
