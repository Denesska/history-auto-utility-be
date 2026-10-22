/**
 * REAL run (sends notifications/push/email, writes dedup rows) of the document and/or maintenance reminder jobs,
 * restricted to ONE user. Dev database only. A dry run goes first and the real run aborts if any candidate
 * belongs to somebody else.
 *   ENV_FILE=.env.dev npx ts-node -T scripts/reminders-real-run-dev.ts <documents|maintenance|both> --user=ID [YYYY-MM-DD] [--send]
 * Without --send it only prints the dry-run candidates.
 */
import * as dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE ?? '.env.dev', override: true });
if (!process.env.DATABASE_URL?.includes('hau_db_dev')) {
  console.error('Refusing to run: DATABASE_URL is not the dev database.');
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const which = args.find(a => ['documents', 'maintenance', 'both'].includes(a));
  const userArg = args.find(a => a.startsWith('--user='));
  const dateArg = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const send = args.includes('--send');
  if (!which || !userArg) {
    console.error('Usage: reminders-real-run-dev.ts <documents|maintenance|both> --user=ID [YYYY-MM-DD] [--send]');
    process.exit(1);
  }
  const onlyUserId = Number(userArg.slice(7));
  const today = dateArg ? new Date(`${dateArg}T12:00:00`) : undefined;

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { DocumentRemindersService } = await import('../src/modules/document-reminders/document-reminders.service');
  const { MaintenanceRemindersService } = await import('../src/modules/maintenance-reminders/maintenance-reminders.service');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });

  const jobs: { name: string; run: (o: object) => Promise<{ candidates: { userId: number; action: string }[] }> }[] = [];
  if (which !== 'maintenance') jobs.push({ name: 'documents', run: o => app.get(DocumentRemindersService).run(o) });
  if (which !== 'documents') jobs.push({ name: 'maintenance', run: o => app.get(MaintenanceRemindersService).run(o) });

  for (const job of jobs) {
    const dry = await job.run({ dryRun: true, today, onlyUserId });
    const foreign = dry.candidates.filter(c => c.userId !== onlyUserId);
    console.log(`[${job.name}] dry-run candidates: ${dry.candidates.length} (foreign: ${foreign.length})`);
    console.table(dry.candidates);
    if (foreign.length) {
      console.error('ABORT: candidates for other users found');
      await app.close();
      process.exit(2);
    }
    if (!send) continue;
    const real = await job.run({ dryRun: false, today, onlyUserId });
    console.log(`[${job.name}] REAL run summary:`, JSON.stringify({ ...real, candidates: real.candidates.length }));
  }
  await app.close();
  process.exit(0);
}
void main();
