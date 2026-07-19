/**
 * GET/POST /api/commentary
 *
 * Editable free-text commentary (highlight/lowlight/opportunity blocks,
 * campaign bullets) shown on the Commentary tab. Starting content is the
 * seeded sample text; any edit saved via POST overrides that seed for the
 * given month going forward.
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { upsertCommentaryText, getCommentaryTextForMonth } from '../db/index.js'
import { AppError } from '../middleware/errorHandler.js'

export const commentaryRouter = Router()

/** Every field key that exists in the seeded sample commentary - kept in sync with src/data/commentary.ts (frontend). */
const ALLOWED_FIELD_KEYS = new Set([
  'media-highlight', 'media-lowlight', 'media-opportunity',
  'engagement-highlight', 'engagement-lowlight', 'engagement-opportunity',
  'core-products-name', 'core-products-dates', 'core-products-bullet-0', 'core-products-bullet-1', 'core-products-bullet-2', 'core-products-bullet-3',
  'made-for-both-name', 'made-for-both-dates', 'made-for-both-bullet-0', 'made-for-both-bullet-1', 'made-for-both-bullet-2', 'made-for-both-bullet-3',
])

const QuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be 'YYYY-MM'"),
})

commentaryRouter.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = QuerySchema.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError(400, 'Invalid query parameters', parsed.error.message)
    }
    const edits = getCommentaryTextForMonth(parsed.data.month)
    return res.json({ month: parsed.data.month, edits })
  } catch (err) {
    return next(err)
  }
})

const BodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be 'YYYY-MM'"),
  fieldKey: z.string().refine((k) => ALLOWED_FIELD_KEYS.has(k), 'Unknown or disallowed field key'),
  value: z.string().min(1).max(2000),
})

commentaryRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'Invalid request body', parsed.error.message)
    }
    const { month, fieldKey, value } = parsed.data
    upsertCommentaryText(month, fieldKey, value)
    return res.json({ status: 'ok', month, fieldKey, value })
  } catch (err) {
    return next(err)
  }
})
