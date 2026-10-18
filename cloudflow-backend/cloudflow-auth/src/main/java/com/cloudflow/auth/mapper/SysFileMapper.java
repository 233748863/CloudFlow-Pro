package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysFile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.Collection;
import java.util.List;
import java.util.Map;

@Mapper
public interface SysFileMapper extends BaseMapper<SysFile> {
    Long lockReusableId(@Param("tenantId") Long tenantId, @Param("hash") String hash, @Param("size") long size,
                        @Param("storageType") String storageType, @Param("configId") Long configId);
    SysFile portalUpload(@Param("tenantId") Long tenantId, @Param("portalUserId") Long portalUserId, @Param("requestKey") String requestKey);
    SysFile lockPortalFile(@Param("tenantId") Long tenantId, @Param("fileId") Long fileId);
    SysFile portalTicketFile(@Param("tenantId") Long tenantId, @Param("ticketId") Long ticketId, @Param("fileId") Long fileId);
    List<Map<String, Object>> countPhysicalStorage(@Param("tenantIds") Collection<Long> tenantIds);
    int updateReferenceCount(@Param("file") SysFile file, @Param("count") int count);
    long countReferences(@Param("file") SysFile file);
    SysFile selectOwnedUnboundReference(@Param("tenantId") Long tenantId, @Param("username") String username,
                                      @Param("reference") String reference, @Param("privateTypes") List<String> privateTypes);
    SysFile selectPreviewReference(@Param("tenantId") Long tenantId, @Param("reference") String reference,
                                   @Param("fileId") Long fileId);
}
