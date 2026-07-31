export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError =
      body && typeof body === "object" && "error" in body
        ? body.error
        : undefined;
    const message =
      apiError &&
      typeof apiError === "object" &&
      "message" in apiError &&
      typeof apiError.message === "string"
        ? apiError.message
        : typeof apiError === "string"
          ? apiError
          : "Si è verificato un errore. Riprova.";

    throw new ApiError(
      message,
      response.status,
      apiError,
    );
  }

  if (body && typeof body === "object" && "data" in body) {
    return body.data as T;
  }

  return body as T;
}
