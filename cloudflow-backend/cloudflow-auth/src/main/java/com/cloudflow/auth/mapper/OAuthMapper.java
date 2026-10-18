package com.cloudflow.auth.mapper;

import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.oauth2.OAuthAccessToken;
import com.cloudflow.auth.oauth2.OAuthApproval;
import com.cloudflow.auth.oauth2.OAuthClient;
import com.cloudflow.auth.oauth2.OAuthCode;
import com.cloudflow.auth.oauth2.OAuthRefreshToken;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OAuthMapper {
    OAuthClient clientByKey(@Param("clientKey") String clientKey);
    OAuthClient client(@Param("clientId") Long clientId);
    OAuthClient lockClient(@Param("clientId") Long clientId);
    List<OAuthClient> clients(@Param("offset") long offset, @Param("limit") int limit);
    long clientCount();
    int insertClient(OAuthClient row);
    int updateClient(OAuthClient row);
    SysUser user(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    SysUser lockUser(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    SysTenant tenant(@Param("tenantId") Long tenantId);
    List<SysRole> roles(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    List<String> permissions(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    List<SysDept> departments(@Param("tenantId") Long tenantId);
    OAuthCode request(@Param("requestHash") String requestHash);
    OAuthCode lockRequest(@Param("clientId") Long clientId, @Param("requestHash") String requestHash);
    OAuthCode lockCode(@Param("clientId") Long clientId, @Param("codeHash") String codeHash);
    OAuthCode code(@Param("clientId") Long clientId, @Param("codeHash") String codeHash);
    int insertCode(OAuthCode row);
    int updateCode(OAuthCode row);
    OAuthApproval approval(@Param("tenantId") Long tenantId, @Param("clientId") Long clientId, @Param("userId") Long userId);
    OAuthApproval approvalById(@Param("tenantId") Long tenantId, @Param("userId") Long userId, @Param("approveId") Long approveId);
    List<OAuthApproval> approvals(@Param("tenantId") Long tenantId, @Param("userId") Long userId, @Param("offset") long offset, @Param("limit") int limit);
    long approvalCount(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    int insertApproval(OAuthApproval row);
    int updateApproval(OAuthApproval row);
    OAuthAccessToken access(@Param("tokenHash") String tokenHash);
    int insertAccess(OAuthAccessToken row);
    OAuthRefreshToken refresh(@Param("tokenHash") String tokenHash);
    OAuthRefreshToken lockRefresh(@Param("clientId") Long clientId, @Param("tokenHash") String tokenHash);
    int insertRefresh(OAuthRefreshToken row);
    int updateRefresh(OAuthRefreshToken row);
    List<String> activeHashes(@Param("tenantId") Long tenantId, @Param("clientId") Long clientId, @Param("userId") Long userId, @Param("familyId") String familyId);
    List<OAuthAccessToken> userAccessPage(@Param("tenantId") long tenantId, @Param("userId") long userId, @Param("afterId") long afterId);
    int revokeAccess(@Param("tenantId") Long tenantId, @Param("clientId") Long clientId, @Param("userId") Long userId, @Param("familyId") String familyId, @Param("reason") String reason, @Param("now") LocalDateTime now);
    int revokeRefresh(@Param("tenantId") Long tenantId, @Param("clientId") Long clientId, @Param("userId") Long userId, @Param("familyId") String familyId, @Param("now") LocalDateTime now);
    int revokeAccessHash(@Param("tenantId") Long tenantId, @Param("clientId") Long clientId, @Param("tokenHash") String tokenHash, @Param("now") LocalDateTime now);
    int revokeApprovals(@Param("tenantId") Long tenantId, @Param("clientId") Long clientId, @Param("userId") Long userId, @Param("now") LocalDateTime now);
    int denyCodes(@Param("tenantId") Long tenantId, @Param("clientId") Long clientId, @Param("userId") Long userId, @Param("now") LocalDateTime now);
}
