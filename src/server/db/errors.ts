export class DatabaseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseError";
  }
}

export function wrapDatabaseError(
  error: unknown,
  operation: string,
): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }

  return new DatabaseError(
    `Database operation failed during ${operation}.`,
    {
      cause: error instanceof Error ? error : undefined,
    },
  );
}
