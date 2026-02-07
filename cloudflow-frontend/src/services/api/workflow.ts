import request from './request';

// Helper to extract records from PageResult or return array
const getList = (res: any) => {
    if (res && Array.isArray(res.records)) {
        return res.records;
    }
    return Array.isArray(res) ? res : [];
};

export const startProcess = (data: any) => {
  return request.post('/workflow/start', data);
};

export const getTodoTasks = (userId?: string) => {
    // userId is ignored by backend (uses context), kept for compat or if we want to support admin viewing others later
  return request.get('/workflow/todo').then(getList);
};

export const completeTask = (data: any) => {
  return request.post('/workflow/complete', data);
};

export const getProcessInstance = (instanceId: string) => {
  return request.get(`/workflow/instance/${instanceId}`) as Promise<any>;
};

export const getProcessTrace = (instanceId: string) => {
  return request.get(`/workflow/instance/${instanceId}/trace`) as Promise<any>;
};

export const getProcessDefinitions = () => {
  return request.get('/workflow/definitions').then(getList);
};

export const getFormDefinition = (formId: string) => {
  return request.get(`/workflow/form/${formId}`);
};

export const getFormDefinitions = () => {
  return request.get('/workflow/forms').then(getList);
};

export const getMyInstances = (userId?: string) => {
  return request.get('/workflow/my-instances').then(getList);
};

export const saveProcessDefinition = (data: any) => {
  return request.post('/workflow/definition/save', data);
};

export const saveFormDefinition = (data: any) => {
  return request.post('/workflow/form/save', data);
};

export const deployProcessDefinition = (definitionId: string) => {
  return request.post(`/workflow/definition/deploy/${definitionId}`);
};

export const readTask = (taskId: string) => {
  return request.post(`/workflow/task/read/${taskId}`);
};

export const urgeTask = (taskId: string, reason: string) => {
  return request.post('/workflow/task/urge', { taskId, reason });
};
