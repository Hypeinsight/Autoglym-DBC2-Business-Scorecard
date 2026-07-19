/**
 * POST /api/ingest/run?date=YYYY-MM-DD
 *
 * Manually triggers the daily ingestion job - used for testing and for
 * backfilling historical days one at a time. Defaults to yesterday if no
 * date is given, matching the scheduled job's behaviour.
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { runDailyIngestion } from '../db/ingest.js'
import { latestIngestedDate } from '../db/index.js'
import { AppError } from '../middleware/errorHandler.js'

export const ingestRouter = Router()

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be 'YYYY-MM-DD'").optional(),
})

ingestRouter.post('/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = QuerySchema.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError(400, 'Invalid query parameters', parsed.error.message)
    }

    await runDailyIngestion(parsed.data.date)
    return res.json({ status: 'ok', date: parsed.data.date ?? 'yesterday', latestIngestedDate: latestIngestedDate() })
  } catch (err) {
    return next(err)
  }
})

ingestRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ latestIngestedDate: latestIngestedDate() })
})
