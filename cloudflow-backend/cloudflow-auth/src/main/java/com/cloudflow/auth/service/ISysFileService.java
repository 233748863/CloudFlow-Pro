package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import org.springframework.web.multipart.MultipartFile;

public interface ISysFileService {
    /**
     * 上传文件
     */
    SysFile uploadFile(MultipartFile file);

    /**
     * 查询文件列表
     */
    PageResult<SysFile> selectFileList(SysFile sysFile, PageQuery pageQuery);

    /**
     * 删除文件
     */
    void deleteFileByIds(Long[] fileIds);
}
