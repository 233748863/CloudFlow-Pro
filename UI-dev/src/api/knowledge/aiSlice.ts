import request from "/@/utils/request"

export function fetchList(query?: Object) {
  return request({
    url: '/knowledge/aiSlice/page',
    method: 'get',
    params: query
  })
}

export function addObj(obj?: Object) {
  return request({
    url: '/knowledge/aiSlice',
    method: 'post',
    data: obj
  })
}

export function getObj(id?: string) {
  return request({
    url: '/knowledge/aiSlice/' + id,
    method: 'get'
  })
}

export function delObjs(ids?: Object) {
  return request({
    url: '/knowledge/aiSlice',
    method: 'delete',
    data: ids
  })
}

export function putObj(obj?: Object) {
  return request({
    url: '/knowledge/aiSlice',
    method: 'put',
    data: obj
  })
}

