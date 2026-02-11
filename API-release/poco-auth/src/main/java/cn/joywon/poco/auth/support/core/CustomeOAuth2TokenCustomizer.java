package cn.joywon.poco.auth.support.core;

import cn.joywon.poco.common.core.constant.SecurityConstants;
import cn.joywon.poco.common.security.service.PocoUser;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenClaimsContext;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenClaimsSet;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenCustomizer;

/**
 * token 输出增强
 *
 * @author poco
 * @date 2022/6/3
 */
public class CustomeOAuth2TokenCustomizer implements OAuth2TokenCustomizer<OAuth2TokenClaimsContext> {

	/**
	 * Customize the OAuth 2.0 Token attributes.
	 * @param context the context containing the OAuth 2.0 Token attributes
	 */
	@Override
	public void customize(OAuth2TokenClaimsContext context) {
		OAuth2TokenClaimsSet.Builder claims = context.getClaims();
		claims.claim(SecurityConstants.DETAILS_LICENSE, SecurityConstants.PIGX_LICENSE);
		String clientId = context.getAuthorizationGrant().getName();
		claims.claim(SecurityConstants.CLIENT_ID, clientId);
		claims.claim(SecurityConstants.ACTIVE, Boolean.TRUE);

		// 客户端模式不返回具体用户信息
		if (SecurityConstants.CLIENT_CREDENTIALS.equals(context.getAuthorizationGrantType().getValue())) {
			return;
		}

		PocoUser pocoUser = (PocoUser) context.getPrincipal().getPrincipal();
		claims.claim(SecurityConstants.DETAILS_USER_ID, pocoUser.getId().toString());
		claims.claim(SecurityConstants.DETAILS_USERNAME, pocoUser.getUsername());
	}

}
