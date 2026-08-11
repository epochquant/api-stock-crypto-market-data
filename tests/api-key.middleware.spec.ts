import { apiKeyMiddleware } from '../src/middleware/api-key.middleware';
import type { FastifyRequest, FastifyReply } from 'fastify';

function makeRequest(apiKeyHeader?: string): FastifyRequest {
  return {
    headers: apiKeyHeader ? { 'x-api-key': apiKeyHeader } : {},
  } as unknown as FastifyRequest;
}

function makeReply(): { status: jest.Mock; send: jest.Mock; statusCode?: number; body?: unknown } {
  const reply: { status: jest.Mock; send: jest.Mock; statusCode?: number; body?: unknown } = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return reply;
}

describe('apiKeyMiddleware', () => {
  const VALID_KEY = 'test-secret-key';

  it('should pass through when the correct API key is provided', async () => {
    const request = makeRequest(VALID_KEY);
    const reply = makeReply();
    await apiKeyMiddleware(request, reply as unknown as FastifyReply, VALID_KEY);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('should reject with 401 when API key is missing', async () => {
    const request = makeRequest();
    const reply = makeReply();
    await apiKeyMiddleware(request, reply as unknown as FastifyReply, VALID_KEY);
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, error: 'Unauthorized' }),
    );
  });

  it('should reject with 401 when API key is incorrect', async () => {
    const request = makeRequest('wrong-key');
    const reply = makeReply();
    await apiKeyMiddleware(request, reply as unknown as FastifyReply, VALID_KEY);
    expect(reply.status).toHaveBeenCalledWith(401);
  });
});
