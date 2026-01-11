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

let client = null;
let db = null;

export async function connectToDatabase() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('❌ [DB] MONGODB_URI environment variable is not defined');
    throw new Error('MONGODB_URI environment variable is required');
  }

  if (client && db) {
    return { client, db };
  }

  try {
    // Connection options for better compatibility with Railway/cloud deployments
    const clientOptions = {
      serverSelectionTimeoutMS: 10000, // Timeout after 10 seconds
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      // Retry logic
      retryWrites: true,
      retryReads: true,
      // SSL/TLS options - let MongoDB driver handle SSL automatically
      // For mongodb+srv:// connections, SSL is required and handled automatically
    };

    client = new MongoClient(MONGODB_URI, clientOptions);
    await client.connect();
    
    // Test the connection
    await client.db('admin').command({ ping: 1 });
    
    db = client.db('flow');
    console.log('✅ [DB] Connected to MongoDB');
    return { client, db };
  } catch (error) {
    console.error('❌ [DB] MongoDB connection error:', error);
    console.error('❌ [DB] Make sure:');
    console.error('   1. MONGODB_URI is correct');
    console.error('   2. MongoDB Atlas Network Access allows Railway IPs (or 0.0.0.0/0)');
    console.error('   3. Database user credentials are correct');
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

