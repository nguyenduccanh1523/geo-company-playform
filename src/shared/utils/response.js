import { createLogger } from "./logger.js";

const logger = createLogger("ResponseHandler");

/**
 * Standard Success Response
 * @param {object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Response message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {void}
 */
export function sendSuccess(res, data, message = "Success", statusCode = 200) {
  return res.status(statusCode).json({
    statusCode,
    message,
    data,
  });
}

/**
 * Standard Error Response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {*} error - Additional error details (optional)
 * @returns {void}
 */
export function sendError(res, message, statusCode = 500, error = null) {
  logger.error(`[${statusCode}] ${message}`, error);

  return res.status(statusCode).json({
    statusCode,
    message,
    ...(error && process.env.NODE_ENV === "development" && { error }),
  });
}

/**
 * Validation Error Response (400)
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {*} details - Validation details (optional)
 * @returns {void}
 */
export function sendValidationError(res, message, details = null) {
  return res.status(400).json({
    statusCode: 400,
    message,
    ...(details && { details }),
  });
}

/**
 * Not Found Error Response (404)
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @returns {void}
 */
export function sendNotFound(res, message = "Resource not found") {
  return res.status(404).json({
    statusCode: 404,
    message,
  });
}

/**
 * Unauthorized Error Response (401)
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @returns {void}
 */
export function sendUnauthorized(res, message = "Unauthorized") {
  return res.status(401).json({
    statusCode: 401,
    message,
  });
}

/**
 * Forbidden Error Response (403)
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @returns {void}
 */
export function sendForbidden(res, message = "Forbidden") {
  return res.status(403).json({
    statusCode: 403,
    message,
  });
}

/**
 * Paginated Success Response
 *
 * Pagination info is optional and at the same level as data
 * Format: { statusCode, message, data: [...], pagination?: {...} }
 *
 * @param {object} res - Express response object
 * @param {Array} data - Array of resources
 * @param {object} pagination - Pagination info { page, pageSize, total, totalPages }
 * @param {string} message - Response message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {void}
 */
export function sendPaginatedSuccess(
  res,
  data,
  pagination,
  message = "Success",
  statusCode = 200,
) {
  const response = {
    statusCode,
    message,
    data: Array.isArray(data) ? data : [],
  };

  // Add pagination if provided
  if (pagination) {
    response.pagination = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pagination.total,
      totalPages: pagination.totalPages,
      hasNextPage: pagination.page < pagination.totalPages,
      hasPreviousPage: pagination.page > 1,
    };
  }

  return res.status(statusCode).json(response);
}

export default {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendPaginatedSuccess,
};
