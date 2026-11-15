import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import {
  finishProductBulkJob,
  processProductBulkJobBatch,
  type ProductBulkJobEnv,
  type ProductBulkJobParams
} from './product-bulk-jobs';

export class ProductBulkWorkflow extends WorkflowEntrypoint<ProductBulkJobEnv, ProductBulkJobParams> {
  async run(event: WorkflowEvent<ProductBulkJobParams>, step: WorkflowStep): Promise<void> {
    const id = event.payload.jobId;
    await step.do('start', async () => {
      await this.env.ONFRAME_DB.prepare(
        `UPDATE product_bulk_jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued'`
      )
        .bind(Date.now(), id)
        .run();
    });
    for (let index = 0; ; index += 1) {
      const processed = await step.do(`batch-${index}`, async () => processProductBulkJobBatch(this.env, id));
      if (!processed) break;
    }
    await step.do('finish', async () => finishProductBulkJob(this.env, id));
  }
}
