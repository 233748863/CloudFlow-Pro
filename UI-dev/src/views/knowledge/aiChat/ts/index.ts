export interface Dataset {
	id: string;
	name?: string;
	avatarUrl?: string;
	welcomeMsg?: string;
	description?: string;
	placeholder?: string;
	dataId?: string;
	mcpId?: string;
	timestamp?: number;
}

export interface ChatMessage {
	modelName?: string;
	conversationId?: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	path?: string;
	time?: string | null;
	datasetId?: string | null;
	extLinks?: ExtLink[] | null;
	websearch?: boolean | null;
	extDetails?: ExtDetails | null;
	reasoning_content?: string | null;
	thinking_time?: string | null;
	chartId?: string | null;
	chartType?: string | null;
}

export interface ExtLink {
	name: string;
	url: string;
	distance: number;
}

export interface ExtDetails {
	funcName?: string;
	mcpId?: string;
	dataId?: string;
	table?: Table;
	files?: File[] | FileBase64[];
	images?: File[] | FileBase64[];
}

export interface FileBase64 {
	name: string;
	type: string;
	size: number;
	base64?: string;
	url: string;
}

export interface Table {
	dsName: string;
	tableNames: string[];
}
