import request from "/@/utils/request"

export function fetchList(query?: Object) {
  return request({
    url: '/knowledge/aiData/page',
    method: 'get',
    params: query
  })
}

export function addObj(obj?: Object) {
  return request({
    url: '/knowledge/aiData',
    method: 'post',
    data: obj
  })
}

export function getObj(id?: string) {
  return request({
    url: '/knowledge/aiData/' + id,
    method: 'get'
  })
}

export function delObjs(ids?: Object) {
  return request({
    url: '/knowledge/aiData',
    method: 'delete',
    data: ids
  })
}

export function putObj(obj?: Object) {
  return request({
    url: '/knowledge/aiData',
    method: 'put',
    data: obj
  })
}

