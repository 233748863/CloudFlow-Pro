import other from '/@/utils/other';
import request from '/@/utils/request';

export interface IOrchestrationScope {
	id?: string;
	username: string;
}

export enum EOrchestrationType {
	WORK_FLOW = 'WORK_FLOW',
	SIMPLE = 'SIMPLE',
}

export interface IOrchestrationItem {
	id?: string;
	name?: string;
	type?: EOrchestrationType;
	description?: string;
	isPublic?: boolean;
	publicAddress?: string;
	apiAddress?: string;
	apiBaseUrl?: string;

	fullScreenUrl?: string;
	fixedUrl?: string;

	questionLimit?: number;
	whiteListEnable?: boolean;
	whiteList?: string;
	showSource?: boolean;

	modelId?: string;

	createBy?: string;
	createTime?: string;
	updateTime?: string;

	modelSetting?: {
		prompt?: string;
		system?: string;
		noReferencesPrompt?: string;
	};
	dialogueNumber?: number;
	datasetIdList?: any[];
	datasetSetting?: {
		searchMode?: string;
		similarity?: number;
		topN?: number;
		maxParagraphCharNumber?: number;
		noReferencesSetting?: {
			status?: string;
			designatedAnswer?: string;
		};
	};
	problemOptimizationPrompt?: string;
	problemOptimization?: boolean;
	prologue?: string;
	sttModelEnable?: boolean;
	sttModelId?: string;
	ttsModelEnable?: boolean;
	ttsType?: string;
	ttsModelId?: string;
	ttsModelParamsSetting?: {};
	fileUploadSetting?: {
		audio?: boolean;
		image?: boolean;
		video?: boolean;
		document?: boolean;
		maxFiles?: number;
		fileLimit?: number;
	};
	disclaimerValue?: string;
}

export interface IOrchestrationAPIKey {
	id?: string;
	allowCrossDomain?: boolean;
	application?: string;
	createTime?: string;
	crossDomainList?: string;
	isActive?: boolean;
	secretKey?: string;
	updateTime?: string;
}

export function fetchList(query?: Object) {
	return request({
		url: '/knowledge/aiFlow/page',
		method: 'get',
		params: query,
	});
}

export function addObj(obj?: Object) {
	return request({
		url: '/knowledge/aiFlow',
		method: 'post',
		data: obj,
	});
}

export function getObj(id?: string) {
	return request({
		url: '/knowledge/aiFlow/' + id,
		method: 'get',
	});
}

export function delObjs(ids?: Object) {
	return request({
		url: '/knowledge/aiFlow',
		method: 'delete',
		data: ids,
	});
}

export function putObj(obj?: Object) {
	return request({
		url: '/knowledge/aiFlow',
		method: 'put',
		data: obj,
	});
}

export function exportFlow(id: string, name: string) {
	return other.downBlobFile(`/knowledge/aiFlow/export/${id}`, {}, `${name}.dsl`);
}

export function copyFlow(id: string) {
	return request.post(`/knowledge/aiFlow/copy/${id}`);
}

export function importFlow(data: FormData) {
	return request.post(`/knowledge/aiFlow/import`, data);
}

export interface IOrchestrationAPIKey {
	id?: string;
	allowCrossDomain?: boolean;
	application?: string;
	createTime?: string;
	crossDomainList?: string;
	isActive?: boolean;
	secretKey?: string;
	updateTime?: string;
}

/**
 * @description  : 编排 发起导入
 * @return        {any}
 */
export async function orchestrationImportContent(data: FormData) {
	return request.post(`/knowledge/orchestration/import/content`, data);
}

/**
 * @description  : 编排 发起导出
 * @return        {any}
 */
export async function orchestrationExportContent(id: string, name: string) {
	return other.downBlobFile(`/knowledge/orchestration/export/content/${id}`, {}, name);
}

/**
 * @description  : 复制 编排
 * @param         {string} originId
 * @param         {IOrchestrationItem} data
 * @return        {any}
 */
export async function orchestrationCopy(originId: string, data: IOrchestrationItem) {
	return request.post(`/knowledge/orchestration/copy/${originId}`, data);
}

/**
 * @description  : 获取 编排 详情
 * @param         {string} id
 * @return        {any}
 */
export async function fetchOrchestrationInfo(id: string) {
	return request.get(`/knowledge/orchestration/info/${id}`);
}

export async function fetchChartRecord(id: string, data: { startTime: string; endTime: string }) {
	return request.get(`/knowledge/orchestration/chart/record/${id}`, { params: data });
}

export async function fetchOrchestrationAPIKeyList(data: { id: string }) {
	return request.get(`/knowledge/orchestration/apikey/${data.id}`);
}

export async function orchestrationAPIKeyUpdate(data: any) {
	return request.put(`/knowledge/orchestration/apikey/update`, data);
}

export async function orchestrationAPIKeyAdd(id: string) {
	return request.post(`/knowledge/orchestration/apikey/${id}/add`);
}

export async function orchestrationAPIKeyRemove(id: string) {
	return request.delete(`/knowledge/orchestration/apikey/${id}/delete`);
}

/**
 * @description  : 获取模型的参数设置
 * @param         {string} orchestrationId
 * @param         {string} modelId
 * @return        {any}
 */
export async function fetchModelParamsForm(orchestrationId: string, modelId: string) {
	return request.get(`/knowledge/orchestration/${orchestrationId}/modelParamsForm/${modelId}`);
}

/**
 * @description  : 播放测试文本
 * @param         {string} id
 * @param         {any} data
 * @return        {any}
 */
export function playDemoText(id: string, data: any) {
	return request.post(`/knowledge/orchestration/playDemoText/${id}`, data, {
		responseType: 'blob',
	});
}

/**
 * @description  : 文件上传
 * @param         {String} application_id
 * @param         {String} chat_id
 * @param         {any} data
 * @return        {any}
 */
export function chatUploadFile(application_id: string, chat_id: String, data: any) {
	return request.post(`/knowledge/orchestration/uploadFile/${application_id}/${chat_id}`, data);
}

/**
 * @description  : 上传录音文件
 * @param         {string} application_id
 * @param         {any} data
 * @return        {any}
 */
export function chatPostSpeechToText(application_id: string, data: any) {
	return request.post(`/knowledge/orchestration/chatPostSpeechToText/${application_id}`, data);
}

export function executeFlow(data: { id: string; params: any; envs: any }) {
	return request.post(`/knowledge/aiFlow/execute`, data);
}
