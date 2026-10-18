package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.multipart.MultipartFile;

public interface ISysFileService {
    /**
     * 上传文件
     */
    SysFile uploadFile(MultipartFile file);

    /** 仅由打印模板维护服务在校验模板权限后释放其旧私有附件。 */
    void removePrintTemplateFile(Long templateId, Long fileId);

    SysFile uploadPortalFile(MultipartFile file, String requestKey);

    SysFile portalUpload(String requestKey);

    void removePortalUpload(Long fileId);

    void copyPortalTicketFile(Long ticketId, Long fileId, HttpServletResponse response);

    SysFile uploadWorkflowFormFile(MultipartFile file, String definitionId, String instanceId, String fieldPath);

    void copyWorkflowFormFile(Long fileId, HttpServletResponse response);

    SysFile uploadMeetingRoomPhoto(MultipartFile file, Long roomId);

    SysFile uploadFinanceFile(MultipartFile file, String kind, Long recordId);

    void copyMeetingRoomPhoto(Long roomId, Long fileId, HttpServletResponse response);

    /**
     * 查询文件列表
     */
    PageResult<SysFile> selectFileList(SysFile sysFile, PageQuery pageQuery);

    /**
     * 删除文件
     */
    void deleteFileByIds(Long[] fileIds);

    /**
     * 访问文件
     */
    void accessFile(String reference, HttpServletResponse response);

    void accessFileById(Long fileId, HttpServletResponse response);

    SysFile getPublicPreviewFile(Long fileId, String reference);
}
