import request from './request';
import { WorkflowDefinition } from '@/types';

export type AiArtifactType = 'SQL' | 'NACOS_CONFIG' | 'JAVA_ENGINE';

/**
 * 生成后端产物（SQL / Nacos 配置 / Java 代码）
 *
 * AI 调用由后端 cloudflow-service-workflow 代理，密钥只在服务端持有，
 * 前端不再直连模型服务，也不再持有任何密钥。
 */
export const generateBackendArtifacts = async (
  workflow: WorkflowDefinition,
  artifactType: AiArtifactType,
): Promise<string> => {
  return request.post<string>('/workflow/ai/workflow-artifacts', {
    artifactType,
    workflow,
  });
};
