import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import {
  applyPromotionBulkTarget,
  finishPromotionBulkJob,
  storePromotionBulkTarget,
  type PromotionBulkParams,
  type RemoteRuntimeEnv
} from './remote-api';

export class PromotionBulkWorkflow extends WorkflowEntrypoint<RemoteRuntimeEnv, PromotionBulkParams> {
  async run(event: WorkflowEvent<PromotionBulkParams>, step: WorkflowStep): Promise<void> {
    const id = event.payload.jobId;
    await step.do('start', async () => {
      await this.env.ONFRAME_DB.prepare(
        `UPDATE promotion_bulk_jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued'`
      )
        .bind(Date.now(), id)
        .run();
    });
    const items = await step.do('targets', async () => {
      const rows = await this.env.ONFRAME_DB.prepare(
        `SELECT item_id FROM promotion_bulk_job_items WHERE job_id = ? AND status = 'queued' ORDER BY item_id`
      )
        .bind(id)
        .all<{ item_id: string }>();
      return rows.results.map((row) => row.item_id);
    });
    for (const itemId of items) {
      const outcome = await step.do(
        `apply-${itemId}`,
        {
          retries: { limit: 1, delay: '2 seconds' },
          timeout: '2 minutes'
        },
        async () => applyPromotionBulkTarget(this.env, id, itemId)
      );
      await step.do(`store-${itemId}`, async () => storePromotionBulkTarget(this.env, id, itemId, outcome));
    }
    await step.do('finish', async () => finishPromotionBulkJob(this.env, id));
  }
}
