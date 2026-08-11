import { randomUUID } from 'crypto';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  result?: unknown;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * In-memory job registry. Tracks async job status by UUID.
 * No external dependencies — pure Node.js crypto for ID generation.
 */
export class JobsService {
  private readonly jobs: Map<string, Job> = new Map();

  createJob(): string {
    const id = randomUUID();
    this.jobs.set(id, {
      id,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }

  updateJobStatus(id: string, status: JobStatus, result?: unknown, error?: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = status;
      if (result !== undefined) job.result = result;
      if (error !== undefined) job.error = error;
      job.updatedAt = new Date();
      this.jobs.set(id, job);
    }
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }
}
