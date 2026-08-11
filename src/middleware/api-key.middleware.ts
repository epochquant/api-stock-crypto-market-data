import { type FastifyRequest, type FastifyReply } from 'fastify';

/**
 * Fastify preHandler hook that validates the `x-api-key` header.
 * Rejects with 401 if the key is missing or does not match API_KEY env var.
 */
export async function apiKeyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  apiKey: string,
): Promise<void> {
  const providedKey = request.headers['x-api-key'];
  if (!providedKey || providedKey !== apiKey) {
    await reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing API key' });
  }
}
