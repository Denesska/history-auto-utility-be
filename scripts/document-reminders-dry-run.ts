/**
 * Dry run of the document expiry reminder job: logs who WOULD be notified, sends and writes nothing.
 *   ENV_FILE=.env.dev npx ts-node scripts/document-reminders-dry-run.ts [YYYY-MM-DD] [--user=ID]
 * The optional date simulates "today".
 */
import * as dotenv from 'dotenv';

// Must run before Prisma is imported: Prisma otherwise falls back to .env (the PROD database).
dotenv.config({ path: process.env.ENV_FILE ?? '.env.dev', override: true });
if (!process.env.DATABASE_URL?.includes('hau_db_dev')) {
  console.error('Refusing to run: DATABASE_URL is not the dev database.');
  process.exit(1);
}

async function main(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { DocumentRemindersService } = await import('../src/modules/document-reminders/document-reminders.service');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const arg = process.argv.slice(2).find(a => !a.startsWith('--'));
  const userArg = process.argv.find(a => a.startsWith('--user='));
  const onlyUserId = userArg ? Number(userArg.slice(7)) : undefined;
  const today = arg ? new Date(`${arg}T12:00:00`) : undefined;
  const summary = await app.get(DocumentRemindersService).run({ dryRun: true, today, onlyUserId });
  console.log(JSON.stringify({ ...summary, candidates: summary.candidates.length }, null, 2));
  console.table(summary.candidates.map(c => ({ ...c, expiresAt: c.expiresAt.toISOString().slice(0, 10) })));
  await app.close();
  process.exit(0);
}
void main();
