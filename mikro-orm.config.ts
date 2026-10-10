import 'dotenv/config';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  entities: ['./dist/**/*.entity.js'],
  entitiesTs: ['./src/**/*.entity.ts'],
  extensions: [Migrator],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    allOrNothing: true,
    emit: 'ts',
  },
});
