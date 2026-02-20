import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.APP_SOURCE_DB_URL;
    if (!connectionString) {
      throw new Error("APP_SOURCE_DB_URL is not set");
    }

    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

export async function queryInternal(text: string, params?: any[]) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function query(text: string, params?: any[]) {
  "use server";
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function getOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await queryInternal(text, params);
  return result.rows[0] || null;
}

export async function getMany<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  "use server";
  const result = await query(text, params);
  return result.rows;
}
