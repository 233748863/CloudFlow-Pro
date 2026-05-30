package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.auth.domain.SysDictData;
import com.cloudflow.auth.domain.SysDictType;

import java.util.List;

/**
 * 字典类型 Service 接口
 *
 * @author CloudFlow
 */
public interface ISysDictTypeService extends IService<SysDictType> {

    /**
     * 查询所有字典类型
     */
    List<SysDictType> selectDictTypeAll();

    /**
     * 根据字典类型查询字典数据
     *
     * @param dictType 字典类型标识
     * @return 字典数据列表
     */
    List<SysDictData> selectDictDataByType(String dictType);

    /**
     * 校验字典类型是否唯一
     *
     * @param dictType 字典类型
     * @return true=唯一
     */
    boolean checkDictTypeUnique(SysDictType dictType);

    /**
     * 新增字典类型
     */
    boolean insertDictType(SysDictType dictType);

    /**
     * 修改字典类型
     */
    boolean updateDictType(SysDictType dictType);

    /**
     * 删除字典类型（同时删除关联的字典数据）
     */
    void deleteDictTypeByIds(Long[] dictIds);

    /**
     * 刷新指定字典类型在 Redis 中的缓存（增删改字典数据后调用）
     */
    void refreshDictCache(String dictType);
}
