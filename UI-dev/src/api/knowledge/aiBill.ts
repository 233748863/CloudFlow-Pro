import request from "/@/utils/request"

export function fetchList(query?: Object) {
  return request({
    url: '/knowledge/aiBill/page',
    method: 'get',
    params: query
  })
}

export function addObj(obj?: Object) {
  return request({
    url: '/knowledge/aiBill',
    method: 'post',
    data: obj
  })
}

export function getObj(id?: string) {
  return request({
    url: '/knowledge/aiBill/' + id,
    method: 'get'
  })
}

export function delObjs(ids?: Object) {
  return request({
    url: '/knowledge/aiBill',
    method: 'delete',
    data: ids
  })
}

export function putObj(obj?: Object) {
  return request({
    url: '/knowledge/aiBill',
    method: 'put',
    data: obj
  })
}

export const getSum = (params?: Object) => {
  return request({
    url: '/knowledge/aiBill/sum',
    method: 'get',
    params,
  });
};


