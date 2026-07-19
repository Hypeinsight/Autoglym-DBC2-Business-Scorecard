/**
 * Schedules the daily ingestion job inside the server process.
 * Runs once a day at 02:00 server time - after all platforms' data for
 * "yesterday" has settled (Meta/Google Ads finalize same-day numbers with
 * some lag, so pulling the prior day at 2am avoids partial-day data).
 */
import cron from 'node-cron'
import { runDailyIngestion } from './ingest.js'

export function startIngestionScheduler(): void {
  cron.schedule('0 2 * * *', () => {
    void runDailyIngestion()
  })
  console.log('[scheduler] Daily ingestion scheduled for 02:00')
}
