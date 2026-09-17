import fs from 'fs';
import path from 'path';

// Get DB type from argument
const args = process.argv.slice(2);
const dbType = args[0] || 'sqlite';

const validDbTypes = ['sqlite', 'mysql', 'mariadb', 'postgresql', 'postgres'];

if (!validDbTypes.includes(dbType)) {
  console.error(`❌ Invalid DB type: ${dbType}`);
  console.error(`✅ Supported types: ${validDbTypes.join(', ')}`);
  process.exit(1);
}

const envContent = `DB_TYPE=${dbType}\n`;
const envFilePath = path.join(process.cwd(), '.env.local');

try {
  fs.writeFileSync(envFilePath, envContent, 'utf8');
  console.warn(`✅ successfully created ${envFilePath} with DB_TYPE=${dbType}`);
} catch (error) {
  console.error('❌ Failed to create .env.local file:', error);
  process.exit(1);
}
