/**
 * ERROR HANDLER MIDDLEWARE
 *
 * Xử lý tất cả lỗi trong ứng dụng
 * Phải được mounted LAST trong app setup
 */

import { logger } from "../utils/logger.js";
import { BaseException } from "../exceptions/base.exception.js";

export function errorHandlerMiddleware(err, req, res, next) {
  logger.error(`[${req.method}] ${req.path}`, err);

  // Known exceptions
  if (err instanceof BaseException) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        timestamp: err.timestamp,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
        ...(err.details && { details: err.details }),
      },
    });
  }

  // Database errors
  if (err.code === "ECONNREFUSED") {
    return res.status(503).json({
      success: false,
      error: {
        code: "DATABASE_CONNECTION_ERROR",
        message: "Database connection failed",
        timestamp: new Date(),
      },
    });
  }

  // Validation errors (JSON parse failed, etc.)
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
        timestamp: new Date(),
      },
    });
  }

  // Unknown errors
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
      timestamp: new Date(),
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
}

/**
 * NOT FOUND HANDLER - Xử lý 404 errors
 */
export function notFoundMiddleware(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date(),
    },
  });
}
