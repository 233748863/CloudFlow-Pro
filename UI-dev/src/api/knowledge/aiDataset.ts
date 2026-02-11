import request from '/@/utils/request';

export function fetchDataList(query?: Object) {
	return request({
		url: '/knowledge/aiDataset/list',
		method: 'get',
		params: query,
	});
}

export function fetchList(query?: Object) {
	return request({
		url: '/knowledge/aiDataset/page',
		method: 'get',
		params: query,
	});
}

export function addObj(obj: AiDataset) {
	return request({
		url: '/knowledge/aiDataset',
		method: 'post',
		data: obj,
	});
}

export function getDetails(obj?: Object) {
	return request({
		url: '/knowledge/aiDataset/details',
		method: 'get',
		params: obj,
	});
}

export function delObjs(ids?: Object) {
	return request({
		url: '/knowledge/aiDataset',
		method: 'delete',
		data: ids,
	});
}

export function putObj(obj: AiDataset) {
	return request({
		url: '/knowledge/aiDataset',
		method: 'put',
		data: obj,
	});
}

export function validateName(rule: any, value: any, callback: any, isEdit: boolean) {
	if (isEdit) {
		return callback();
	}

	getDetails({ name: value }).then((response) => {
		const result = response.data;
		if (result !== null) {
			callback(new Error('名称已经存在'));
		} else {
			callback();
		}
	});
}

interface AiDataset {
	// ... existing fields ...
	embeddingModel: string;
	summaryModel: string;
}
