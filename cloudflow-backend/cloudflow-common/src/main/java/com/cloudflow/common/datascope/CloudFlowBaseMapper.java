package com.cloudflow.common.datascope;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * CloudFlow扩展的BaseMapper
 * 提供支持DataScope数据权限的查询方法
 * 
 * @author CloudFlow
 * @date 2026-02-12
 * @param <T> 实体类型
 */
public interface CloudFlowBaseMapper<T> extends BaseMapper<T> {

    /**
     * 根据DataScope分页查询
     * 
     * @param page 分页参数
     * @param dataScope 数据权限参数
     * @return 分页结果
     */
    IPage<T> selectPageByScope(Page<T> page, @Param("dataScope") DataScope dataScope);

    /**
     * 根据DataScope查询列表
     * 
     * @param dataScope 数据权限参数
     * @return 结果列表
     */
    List<T> selectListByScope(@Param("dataScope") DataScope dataScope);

    /**
     * 根据DataScope统计数量
     * 
     * @param dataScope 数据权限参数
     * @return 数量
     */
    Long selectCountByScope(@Param("dataScope") DataScope dataScope);
}
