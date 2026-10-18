package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysCodegenTable;
import com.cloudflow.auth.domain.dto.CodegenImportDTO;
import com.cloudflow.auth.domain.dto.CodegenSaveDTO;
import com.cloudflow.auth.domain.dto.CodegenWriteDTO;
import com.cloudflow.auth.domain.vo.CodegenDetailVO;
import com.cloudflow.auth.domain.vo.CodegenOptionsVO;
import com.cloudflow.auth.domain.vo.CodegenWriteResultVO;
import com.cloudflow.auth.domain.vo.DbTableVO;
import com.cloudflow.common.core.domain.PageResult;
import jakarta.servlet.http.HttpServletResponse;

import java.util.List;
import java.util.Map;

/**
 * 代码生成器服务。
 */
public interface ISysCodegenService {

    PageResult<DbTableVO> selectDatabaseTablePage(String tableName, String tableComment,
                                                  int pageNum, int pageSize);

    PageResult<SysCodegenTable> selectImportedTablePage(SysCodegenTable query, int pageNum, int pageSize);

    CodegenDetailVO getDetail(Long tableId);

    CodegenOptionsVO getOptions();

    void importTables(CodegenImportDTO dto);

    void saveConfiguration(CodegenSaveDTO dto);

    void syncTable(Long tableId);

    Map<String, String> preview(Long tableId);

    void download(Long tableId, HttpServletResponse response);

    CodegenWriteResultVO writeToDisk(Long tableId, CodegenWriteDTO dto);

    void remove(List<Long> tableIds);
}
