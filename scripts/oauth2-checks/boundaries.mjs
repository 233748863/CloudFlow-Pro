import { prepareOauthActors } from './fixtures.mjs';
import { verifyOauthProtocol } from './protocol.mjs';
import { verifyOauthLifecycle } from './lifecycle.mjs';
import { verifyOauthResources } from './resources.mjs';
import { verifyOauthUserRace } from './race.mjs';
import { verifyOauthLimits } from './limits.mjs';

export async function verifyOauth2Boundaries(context) {
  const { check, client, tokens, tokenRequest, rememberTokens, denied, resource } = context;
  const rotated = rememberTokens(await tokenRequest(client, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token }), '刷新令牌真实一次轮换');
  check('刷新后得到不同的不透明令牌', rotated.access_token !== tokens.access_token && rotated.refresh_token !== tokens.refresh_token);
  denied(await tokenRequest(client, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token }), 400, 'invalid_grant', '旧刷新令牌再次使用被拒绝');
  denied(await resource(rotated.access_token), 401, 'invalid_token', '刷新重放立即撤销整个令牌族');
  const actors = await prepareOauthActors(context);
  await verifyOauthProtocol({ ...context, actors });
  await verifyOauthLifecycle({ ...context, actors });
  await verifyOauthResources({ ...context, actors });
  await verifyOauthUserRace({ ...context, actors });
  await verifyOauthLimits({ ...context, actors });
}
