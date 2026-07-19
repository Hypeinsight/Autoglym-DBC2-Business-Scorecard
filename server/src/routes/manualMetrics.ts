/**
 * POST /api/manual-metrics
 *
 * Saves a manually-typed figure for one metric in one calendar month -
 * e.g. Press Office Impressions, which has no API source and is entered
 * directly on the scorecard card each month.
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { upsertManualMetric, getManualMetric } from '../db/index.js'
import { AppError } from '../middleware/errorHandler.js'

export const manualMetricsRouter = Router()

/** Metric keys that are allowed to be set this way - avoids the endpoint being used to overwrite arbitrary data. */
const ALLOWED_METRIC_KEYS = new Set([
  'press_office_impressions',
  // Period-box overrides - typed directly into the 3M/6M/12M cells,
  // independent of the monthly headline figure above them.
  'press_office_impressions_3m',
  'press_office_impressions_6m',
  'press_office_impressions_12m',
])

const BodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be 'YYYY-MM'"),
  metricKey: z.string().refine((k) => ALLOWED_METRIC_KEYS.has(k), 'Unknown or disallowed metric key'),
  value: z.number().finite(),
})

manualMetricsRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'Invalid request body', parsed.error.message)
    }

    const { month, metricKey, value } = parsed.data
    upsertManualMetric(month, metricKey, value)
    return res.json({ status: 'ok', month, metricKey, value: getManualMetric(month, metricKey) })
  } catch (err) {
    return next(err)
  }
})
