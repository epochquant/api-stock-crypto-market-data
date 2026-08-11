import { type FastifyInstance } from 'fastify';
import { apiKeyMiddleware } from '../middleware/api-key.middleware';
import { type JobsService } from '../services/jobs.service';

interface JobsRouteOptions {
  apiKey: string;
  jobsService: JobsService;
}

export async function jobsRoutes(
  fastify: FastifyInstance,
  opts: JobsRouteOptions,
): Promise<void> {
  const { apiKey, jobsService } = opts;
  const withApiKey = (req: Parameters<typeof apiKeyMiddleware>[0], reply: Parameters<typeof apiKeyMiddleware>[1]) =>
    apiKeyMiddleware(req, reply, apiKey);

  // ── GET /api/jobs/status/:id ────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/api/jobs/status/:id',
    {
      preHandler: withApiKey,
      schema: {
        tags: ['Jobs'],
        summary: 'Get job status by ID',
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const job = jobsService.getJob(request.params.id);
      if (!job) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'Not Found', message: `Job ${request.params.id} not found` });
      }
      return reply.send(job);
    },
  );
}
