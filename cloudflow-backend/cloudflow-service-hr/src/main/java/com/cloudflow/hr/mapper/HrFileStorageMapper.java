package com.cloudflow.hr.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Map;

/**
 * HR 模块对 sys_file 公共文件表的读写。
 * sys_file 属公共库（01.cloudflow-common.sql），HR 域内只用到落地与回读两个能力。
 */
@Mapper
public interface HrFileStorageMapper {

    /**
     * 落库 sys_file 行，使用 useGeneratedKeys 把自增主键回填到 record["fileId"]。
     * record 字段：tenantId / fileName / filePath / url / fileSize / fileType / createBy
     */
    int insertSysFile(@Param("r") Map<String, Object> record);

    /**
     * 按 fileId 查询本地文件物理路径。
     */
    String selectFilePathById(@Param("fileId") Long fileId);
}
