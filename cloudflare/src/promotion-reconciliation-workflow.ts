import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import {
  markPromotionReconciliationUnconfirmed,
  reconcilePromotionOperation,
  type PromotionReconciliationParams,
  type ReconciliationOutcome,
  type RemoteRuntimeEnv
} from './remote-api';

export class PromotionReconciliationWorkflow extends WorkflowEntrypoint<RemoteRuntimeEnv, PromotionReconciliationParams> {
  async run(event: WorkflowEvent<PromotionReconciliationParams>, step: WorkflowStep): Promise<ReconciliationOutcome> {
    const reconciliationId = event.payload.reconciliationId;
    const delays = ['2 seconds', '4 seconds', '8 seconds', '15 seconds', '30 seconds', '1 minute', '2 minutes'] as const;

    for (let index = 0; index < delays.length; index += 1) {
      await step.sleep(`wait-${index + 1}`, delays[index]);
      const outcome = await step.do<ReconciliationOutcome>(
        `confirm-${index + 1}`,
        {
          retries: { limit: 2, delay: '2 seconds', backoff: 'exponential' },
          timeout: '30 seconds'
        },
        async () => reconcilePromotionOperation(this.env, reconciliationId)
      );
      if (outcome.status !== 'pending') return outcome;
    }

    return step.do<ReconciliationOutcome>('finish-unconfirmed', async () => (
      markPromotionReconciliationUnconfirmed(this.env, reconciliationId)
    ));
  }
}
