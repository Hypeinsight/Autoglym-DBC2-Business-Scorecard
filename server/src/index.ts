import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { healthRouter } from './routes/health.js'
import { scorecardRouter } from './routes/scorecard.js'
import { ingestRouter } from './routes/ingest.js'
import { manualMetricsRouter } from './routes/manualMetrics.js'
import { commentaryRouter } from './routes/commentary.js'
import { errorHandler } from './middleware/errorHandler.js'
import { startIngestionScheduler } from './db/scheduler.js'

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'

const app = express()

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }))
app.use(express.json())

// Routes
app.use('/api/health', healthRouter)
app.use('/api/scorecard', scorecardRouter)
app.use('/api/ingest', ingestRouter)
app.use('/api/manual-metrics', manualMetricsRouter)
app.use('/api/commentary', commentaryRouter)

// Central error handler — must be last
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`[server] Autoglym DBC2 API running at http://localhost:${PORT}`)
  console.log(`[server] Accepting requests from ${FRONTEND_ORIGIN}`)
  startIngestionScheduler()
})

export { app }
