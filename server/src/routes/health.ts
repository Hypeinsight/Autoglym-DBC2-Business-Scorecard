import { Router } from 'express'
import type { HealthResponse } from '../types/api.js'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
  }
  res.json(body)
})
