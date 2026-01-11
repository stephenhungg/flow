/**
 * MongoDB connection and database helpers
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root directory
// backend/server/lib/ -> ../ -> backend/server/ -> ../ -> backend/ -> ../ -> root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is required');
}

let client = null;
let db = null;

export async function connectToDatabase() {
  if (client && db) {
    return { client, db };
  }

  try {
    // MongoDB connection options with SSL/TLS settings for Railway
    const options = {
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    };

    client = new MongoClient(MONGODB_URI, options);
    await client.connect();
    db = client.db('flow');
    console.log('✅ [DB] Connected to MongoDB');
    return { client, db };
  } catch (error) {
    console.error('❌ [DB] MongoDB connection error:', error);
    throw error;
  }
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  return db;
}

export function getUsersCollection() {
  return getDatabase().collection('users');
}

export function getScenesCollection() {
  return getDatabase().collection('scenes');
}

