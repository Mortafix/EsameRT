import { Db, MongoClient } from "mongodb";

import { getConfig } from "@/lib/config";

type MongoGlobal = typeof globalThis & {
  __rtLabMongoClientPromise?: Promise<MongoClient>;
};

const mongoGlobal = globalThis as MongoGlobal;

function createClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(getConfig().MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5_000,
    appName: "rt-lab",
  });
  return client.connect();
}

export function getMongoClient(): Promise<MongoClient> {
  if (!mongoGlobal.__rtLabMongoClientPromise) {
    mongoGlobal.__rtLabMongoClientPromise = createClientPromise().catch((error) => {
      mongoGlobal.__rtLabMongoClientPromise = undefined;
      throw error;
    });
  }
  return mongoGlobal.__rtLabMongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getConfig().MONGODB_DB);
}

export async function closeMongoClient(): Promise<void> {
  const promise = mongoGlobal.__rtLabMongoClientPromise;
  mongoGlobal.__rtLabMongoClientPromise = undefined;
  if (!promise) return;
  const client = await promise;
  await client.close();
}
