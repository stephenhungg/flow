import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('__dirname:', __dirname);
const envPath = path.resolve(__dirname, '../../.env');
console.log('Resolved path:', envPath);

import fs from 'fs';
const exists = fs.existsSync(envPath);
console.log('File exists:', exists);

if (exists) {
  const result = dotenv.config({ path: envPath });
  console.log('Loaded vars:', Object.keys(result.parsed || {}).length);
  console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'FOUND' : 'NOT FOUND');
} else {
  console.log('File does not exist!');
}

