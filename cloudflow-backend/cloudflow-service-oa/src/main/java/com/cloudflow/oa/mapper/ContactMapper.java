package com.cloudflow.oa.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface ContactMapper {

    int countContacts(@Param("keyword") String keyword,
                      @Param("deptId") Long deptId);

    List<Map<String, Object>> selectContacts(@Param("keyword") String keyword,
                                             @Param("deptId") Long deptId,
                                             @Param("offset") Integer offset,
                                             @Param("pageSize") Integer pageSize);

    List<Map<String, Object>> selectDeptTree();

    Map<String, Object> selectUserDetail(@Param("userId") Long userId);
}
