import { JobsService } from '../src/services/jobs.service';

describe('JobsService', () => {
  let service: JobsService;

  beforeEach(() => {
    service = new JobsService();
  });

  it('should create a new job and return its UUID', () => {
    const id = service.createJob();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should return the created job with pending status', () => {
    const id = service.createJob();
    const job = service.getJob(id);
    expect(job).toBeDefined();
    expect(job?.status).toBe('pending');
    expect(job?.id).toBe(id);
  });

  it('should update job status to completed with result', () => {
    const id = service.createJob();
    const result = { records: 42 };
    service.updateJobStatus(id, 'completed', result);
    const job = service.getJob(id);
    expect(job?.status).toBe('completed');
    expect(job?.result).toEqual(result);
  });

  it('should update job status to failed with error message', () => {
    const id = service.createJob();
    service.updateJobStatus(id, 'failed', undefined, 'Timeout');
    const job = service.getJob(id);
    expect(job?.status).toBe('failed');
    expect(job?.error).toBe('Timeout');
  });

  it('should return undefined for an unknown job ID', () => {
    const job = service.getJob('nonexistent-id');
    expect(job).toBeUndefined();
  });

  it('should update updatedAt timestamp on status change', async () => {
    const id = service.createJob();
    const before = service.getJob(id)?.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    service.updateJobStatus(id, 'running');
    const after = service.getJob(id)?.updatedAt;
    expect(after?.getTime()).toBeGreaterThan(before?.getTime() ?? 0);
  });
});
