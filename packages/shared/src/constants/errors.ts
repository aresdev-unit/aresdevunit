export const ERROR_CODES = {
  UNAUTHORIZED: { status: 401, message: 'Authentication required' },
  FORBIDDEN: { status: 403, message: 'Insufficient permissions' },
  SKILL_NOT_FOUND: { status: 404, message: 'Skill not found' },
  SKILL_ALREADY_EXISTS: { status: 409, message: 'Skill with this name already exists' },
  VERSION_ALREADY_EXISTS: { status: 409, message: 'This version already exists' },
  VALIDATION_ERROR: { status: 422, message: 'Validation failed' },
  RATE_LIMITED: { status: 429, message: 'Too many requests' },
  INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
  AUTHORIZATION_PENDING: { status: 400, message: 'User has not yet authorized' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
