import request from "/@/utils/request";

export const genText = (content: object) => {
    return request({
        url: '/knowledge/chat/generate/text',
        method: 'post',
        data: content,
    });
};


export const genTts = (prompt: String) => {
    return request({
        url: '/knowledge/chat/generate/tts',
        method: 'post',
        data: {prompt},
    });
};
