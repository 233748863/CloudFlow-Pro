
import { GoogleGenAI } from "@google/genai";
import { WorkflowDefinition } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("未找到 API Key，请设置 API_KEY 环境变量。");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateBackendArtifacts = async (
  workflow: WorkflowDefinition, 
  artifactType: 'SQL' | 'NACOS_CONFIG' | 'JAVA_ENGINE'
): Promise<string> => {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

  let prompt = "";
  const workflowJson = JSON.stringify(workflow, null, 2);

  if (artifactType === 'SQL') {
    prompt = `
      您是一名高级数据库架构师。请根据提供的 JSON 工作流定义，生成 Spring Cloud 项目所需的 MySQL 8.0 初始化脚本。
      
      **输入数据 (JSON):**
      ${workflowJson}

      **要求：**
      1. **动态表单支持**：生成 sys_form_def (表单定义) 和 sys_form_data (表单实例数据, JSON格式) 表。
      2. **组织架构**：生成 sys_dept, sys_post, sys_user_dept 关联表，支持树状结构。
      3. **核心工作流表**：wf_process_instance, wf_task, wf_task_log。
      4. **委托与转办**：生成 wf_delegation 表 (owner_id, delegate_id, start_time, end_time)。
      5. **SLA支持**：wf_task 表需包含 due_date (截止时间) 字段。
      6. **表名生成**：根据 key='${workflow.key}' 生成主业务表 (例如 biz_${workflow.key})。
      7. **全中文注释**。
      
      仅输出 SQL 代码块。
    `;
  } else if (artifactType === 'NACOS_CONFIG') {
    prompt = `
      您是一名 DevOps 工程师。生成 Nacos 配置文件。
      
      **要求：**
      1. Service Name: workflow-service-${workflow.key}
      2. Nacos & Mysql 配置。
      3. **Redis 配置 (重点)**: 配置 Spring Data Redis，启用 Keyspace Notifications 或 Pub/Sub (Topic: cloudflow.event.task)。
      4. 增加 Spring Task Scheduler 配置，用于处理 SLA 超时扫描。
      
      仅输出 YAML 代码块。
    `;
  } else {
    prompt = `
      您是一名资深 Java 架构师。请编写 Spring Boot 业务逻辑代码，重点实现 **Redis Pub/Sub** 和 **SLA 超时处理**。
      
      **输入工作流 (JSON):**
      ${workflowJson}

      **代码结构要求：**
      1. **WorkflowServiceImpl.java**: 
         - 创建任务时，根据节点 SLA 配置计算 due_time。
         - 使用 RedisTemplate.convertAndSend("task.events", event) 发送 "TASK_CREATED" 事件。
      2. **RedisListenerConfig.java**: 配置 RedisMessageListenerContainer。
      3. **TaskEventListener.java**: 
         - 监听 "task.events"。收到消息后，如果配置了超时，将任务ID和截止时间放入 Redis ZSet (延迟队列)。
         - 或者监听 Redis Key 过期事件来实现超时触发。
      4. **SLAJob.java**: 定时任务或 Redis 监听器，发现超时任务后，执行 'AUTO_PASS' 或 'AUTO_REJECT'。
      5. **DelegationService**: 检查当前审批人是否有有效委托，如果有，自动将任务转给受托人。
      6. **DynamicForm**: 解析 JSON 表单数据并存储。

      请将以上类合并在一个代码块中展示（用注释分隔），并添加详细中文注释解释 Redis Pub/Sub 的用法。
      
      仅输出 Java 代码块。
    `;
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return `// 生成失败: ${error instanceof Error ? error.message : '未知错误'}\n// 请确保已在环境设置中配置有效的 API Key`;
  }
};
