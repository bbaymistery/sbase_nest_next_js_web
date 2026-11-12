import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    //willthe path to the schema file that contains the table definitions be 
    schema: './src/db/schema/index.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
