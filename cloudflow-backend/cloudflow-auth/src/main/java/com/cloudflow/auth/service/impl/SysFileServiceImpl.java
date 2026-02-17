package com.cloudflow.auth.service.impl;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.auth.service.SysTenantService;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Arrays;
import java.util.Date;

@Slf4j
@Service
public class SysFileServiceImpl implements ISysFileService {

    @Autowired
    private SysFileMapper sysFileMapper;

    @Autowired
    private SysTenantService sysTenantService;

    @Override
    public SysFile uploadFile(MultipartFile file) {
        try {
            String originalFilename = file.getOriginalFilename();
            String contentType = file.getContentType();
            long size = file.getSize();
            
            // 将字节转换为MB（向上取整，至少1MB），用于租户存储空间计算
            long sizeMB = Math.max(1L, (size + 1024 * 1024 - 1) / (1024 * 1024));
            
            // 检查并更新租户存储空间（上传前先检查配额）
            Long tenantId = UserContext.getTenantId();
            if (tenantId != null) {
                boolean storageOk = sysTenantService.updateStorageUsed(tenantId, sizeMB);
                if (!storageOk) {
                    throw new RuntimeException("租户存储空间不足，请联系管理员扩容");
                }
            }
            
            // 上传到本地
            String fileName;
            try {
                fileName = FileUploadUtils.upload(CloudFlowConfig.getUploadPath(), file);
            } catch (Exception e) {
                // 上传失败时回滚租户存储空间
                if (tenantId != null) {
                    try {
                        sysTenantService.updateStorageUsed(tenantId, -sizeMB);
                    } catch (Exception rollbackEx) {
                        log.error("回滚租户存储空间失败，租户ID: {}, 大小: {}MB", tenantId, sizeMB, rollbackEx);
                    }
                }
                throw e;
            }
            
            // url 存的是 /upload/2026/02/17/xxx.png 这样的相对路径
            String url = fileName;

            SysFile sysFile = new SysFile();
            sysFile.setFileName(originalFilename);
            sysFile.setFilePath(fileName);
            sysFile.setUrl(url);
            sysFile.setFileSize(size);
            sysFile.setFileType(FileUtil.extName(originalFilename));
            sysFile.setCreateTime(new Date());
            sysFile.setCreateBy(UserContext.getUserName());
            sysFile.setDelFlag("0");
            
            sysFileMapper.insert(sysFile);
            log.info("文件上传成功: {}, 大小: {}字节, 租户ID: {}", originalFilename, size, tenantId);
            return sysFile;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("文件上传失败: " + e.getMessage());
        }
    }

    @Override
    public PageResult<SysFile> selectFileList(SysFile sysFile, PageQuery pageQuery) {
        Page<SysFile> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<SysFile> wrapper = new LambdaQueryWrapper<>();
        
        if (StrUtil.isNotBlank(sysFile.getFileName())) {
            wrapper.like(SysFile::getFileName, sysFile.getFileName());
        }
        if (StrUtil.isNotBlank(sysFile.getFileType())) {
            wrapper.eq(SysFile::getFileType, sysFile.getFileType());
        }
        
        wrapper.eq(SysFile::getDelFlag, "0");
        wrapper.orderByDesc(SysFile::getCreateTime);
        
        Page<SysFile> result = sysFileMapper.selectPage(page, wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal(), result.getCurrent(), result.getSize());
    }

    @Override
    public void deleteFileByIds(Long[] fileIds) {
        Long tenantId = UserContext.getTenantId();
        
        for (Long id : fileIds) {
            // 查询文件信息，用于回收存储空间
            SysFile existingFile = sysFileMapper.selectById(id);
            if (existingFile != null && "0".equals(existingFile.getDelFlag())) {
                // 逻辑删除
                SysFile updateFile = new SysFile();
                updateFile.setFileId(id);
                updateFile.setDelFlag("2");
                sysFileMapper.updateById(updateFile);
                
                // 回收租户存储空间（负数表示减少）
                if (tenantId != null && existingFile.getFileSize() != null && existingFile.getFileSize() > 0) {
                    long sizeMB = Math.max(1L, (existingFile.getFileSize() + 1024 * 1024 - 1) / (1024 * 1024));
                    try {
                        sysTenantService.updateStorageUsed(tenantId, -sizeMB);
                        log.info("回收租户存储空间: 租户ID={}, 文件ID={}, 大小={}MB", tenantId, id, sizeMB);
                    } catch (Exception e) {
                        log.error("回收租户存储空间失败: 租户ID={}, 文件ID={}", tenantId, id, e);
                    }
                }
            }
        }
    }
}
