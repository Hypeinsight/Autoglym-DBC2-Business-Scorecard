import type { Request, Response, NextFunction } from 'express'
import type { ApiError } from '../types/api.js'

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    const body: ApiError = { error: err.message, code: err.statusCode }
    if (err.detail) body.detail = err.detail
    res.status(err.statusCode).json(body)
    return
  }

  console.error('[unhandled error]', err)
  const body: ApiError = { error: 'Internal server error', code: 500 }
  res.status(500).json(body)
}
