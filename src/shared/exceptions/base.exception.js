/**
 * BASE EXCEPTION - Lớp cơ sở cho tất cả exceptions
 */
export class BaseException extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date();
    this.name = this.constructor.name;
  }
}

/**
 * VALIDATION EXCEPTION - Lỗi validation input
 */
export class ValidationException extends BaseException {
  constructor(code, message, details = {}) {
    super(400, code, message);
    this.details = details;
  }
}

/**
 * BUSINESS EXCEPTION - Lỗi business logic
 */
export class BusinessException extends BaseException {
  constructor(code, message) {
    super(400, code, message);
  }
}

/**
 * NOT FOUND EXCEPTION - Resource không tồn tại
 */
export class NotFoundException extends BaseException {
  constructor(resourceName, identifier) {
    super(404, "NOT_FOUND", `${resourceName} with ${identifier} not found`);
    this.resourceName = resourceName;
  }
}

/**
 * UNAUTHORIZED EXCEPTION - Không được xác thực
 */
export class UnauthorizedException extends BaseException {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
  }
}

/**
 * FORBIDDEN EXCEPTION - Không có quyền truy cập
 */
export class ForbiddenException extends BaseException {
  constructor(message = "Forbidden") {
    super(403, "FORBIDDEN", message);
  }
}

/**
 * CONFLICT EXCEPTION - Resource đã tồn tại
 */
export class ConflictException extends BaseException {
  constructor(code, message) {
    super(409, code, message);
  }
}

/**
 * EXTERNAL SERVICE EXCEPTION - Lỗi từ external API
 */
export class ExternalServiceException extends BaseException {
  constructor(serviceName, message, originalError = null) {
    super(502, "EXTERNAL_SERVICE_ERROR", `${serviceName} error: ${message}`);
    this.serviceName = serviceName;
    this.originalError = originalError;
  }
}

/**
 * DATABASE EXCEPTION - Lỗi database
 */
export class DatabaseException extends BaseException {
  constructor(message, originalError = null) {
    super(500, "DATABASE_ERROR", message);
    this.originalError = originalError;
  }
}
