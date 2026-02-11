import request from "/@/utils/request"

export function fetchList(query?: Object) {
  return request({
    url: '/knowledge/aiChatRecord/page',
    method: 'get',
    params: query
  })
}

export function addObj(obj?: Object) {
  return request({
    url: '/knowledge/aiChatRecord',
    method: 'post',
    data: obj
  })
}

export function getObj(id?: string) {
  return request({
    url: '/knowledge/aiChatRecord/' + id,
    method: 'get'
  })
}

export function delObjs(ids?: Object) {
  return request({
    url: '/knowledge/aiChatRecord',
    method: 'delete',
    data: ids
  })
}

export function putObj(obj?: Object) {
  return request({
    url: '/knowledge/aiChatRecord',
    method: 'put',
    data: obj
  })
}

