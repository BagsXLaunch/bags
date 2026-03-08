export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly stage: string,
    public readonly retryable: boolean = false,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ParseError extends AppError {
  constructor(message: string, raw?: unknown) {
    super(message, 'PARSE_ERROR', 'parsing', false, raw);
    this.name = 'ParseError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code: string = 'VALIDATION_ERROR', raw?: unknown) {
    super(message, code, 'validation', false, raw);
    this.name = 'ValidationError';
  }
}

export class LaunchError extends AppError {
  constructor(message: string, retryable: boolean = false, raw?: unknown) {
    super(message, 'LAUNCH_ERROR', 'launch', retryable, raw);
    this.name = 'LaunchError';
  }
}

export class XApiError extends AppError {
  constructor(message: string, retryable: boolean = true, raw?: unknown) {
    super(message, 'X_API_ERROR', 'x_api', retryable, raw);
    this.name = 'XApiError';
  }
}
