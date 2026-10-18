package com.cloudflow.auth.im;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImBindingFlow {
    private final ImBindingIdentity identities;
    private final ImBindingProofs proofs;
    private final ImBindingAccounts accounts;
    private final ImLoginRequests requests;
    private final ImLoginRedirects redirects;
    private final ImLoginAuthorization authorization;
    private final ImLoginChallenges challenges;
    private final ImBindingMembers members;
    private final ImIdentityProvider provider;

    public ImLoginAuthorization.Grant begin(HttpServletRequest request, HttpServletResponse response) {
        HttpServletRequest normalized = requests.begin(request, false);
        ImBindingIdentity.Verification local = identities.requireRecent(ImBindingAction.BIND);
        requests.account(local.actor().tenantId(), local.actor().userId());
        WeComCredentials credentials = accounts.configuration(local.actor());
        ImLoginChallenges.Context context = new ImLoginChallenges.Context(credentials.tenantId(), credentials.configId(), credentials.version(),
                credentials.corpId(), credentials.agentId(), redirects.bindingCallbackUrl(), ImLoginRedirects.BINDING_PATH, ImLoginChallenges.Purpose.BIND,
                null, local.actor().userId(), local.identity().userVersion(), local.identity().sessionDigest(), local.identity().credentialStamp(), local.ticket().proof().nonce());
        return authorization.begin(credentials, context, ImLoginBrowser.begin(normalized, response));
    }

    public String callback(String state, String code, HttpServletRequest request) {
        HttpServletRequest normalized = requests.begin(request, true);
        String browser = ImLoginBrowser.require(normalized);
        ImLoginChallenges.Context context = challenges.consume(state, browser, ImLoginChallenges.Purpose.BIND);
        requests.account(context.tenantId(), context.ownerUserId());
        ImBindingProofs.Ticket local = localProof(context);
        WeComCredentials credentials = accounts.configuration(context);
        ImIdentityProvider.Member member = provider.identify(credentials, code);
        accounts.configuration(context);
        localProof(context);
        requests.recheck(normalized);
        return members.issue(context, member, browser, local.proof().expiresAt());
    }

    public Pending pending(String token, HttpServletRequest request) {
        HttpServletRequest normalized = requests.begin(request, false);
        ImBindingIdentity.Verification local = identities.requireRecent(ImBindingAction.BIND);
        ImBindingMembers.Ticket external = members.read(token, ImLoginBrowser.require(normalized));
        verifyOwner(external.proof().context(), local);
        accounts.configuration(external.proof().context());
        return new Pending(external.proof().member().externalUserId(), external.expiresAt());
    }

    @HighRiskAction
    @Audit(name = "绑定本人企业微信账号", highRisk = true)
    public ImBindingAccounts.Summary bind(String token, HttpServletRequest request) {
        HttpServletRequest normalized = requests.begin(request, false);
        ImBindingIdentity.Verification local = identities.requireRecent(ImBindingAction.BIND);
        requests.account(local.actor().tenantId(), local.actor().userId());
        ImBindingMembers.Ticket external = members.read(token, ImLoginBrowser.require(normalized));
        verifyOwner(external.proof().context(), local);
        return accounts.bind(local, external.proof(), () -> {
            requests.recheck(normalized);
            verifyOwner(external.proof().context(), identities.requireRecent(ImBindingAction.BIND));
            members.consume(external);
            identities.consume(local);
            return null;
        });
    }

    @HighRiskAction
    @Audit(name = "解除本人企业微信绑定", highRisk = true)
    public void unbind(ImBindingAccounts.Selection selection, HttpServletRequest request) {
        HttpServletRequest normalized = requests.begin(request, false);
        ImBindingIdentity.Verification local = identities.requireRecent(ImBindingAction.UNBIND);
        requests.account(local.actor().tenantId(), local.actor().userId());
        accounts.unbind(local, selection, () -> {
            requests.recheck(normalized);
            identities.consume(local);
            return null;
        });
    }

    private ImBindingProofs.Ticket localProof(ImLoginChallenges.Context context) {
        ImBindingProofs.Identity identity = new ImBindingProofs.Identity(context.tenantId(), context.ownerUserId(), context.ownerVersion(),
                context.ownerSessionDigest(), context.ownerCredentialStamp(), ImBindingAction.BIND);
        ImBindingProofs.Ticket ticket = proofs.read(identity);
        if (!ImLoginChallenges.equal(context.ownerProofNonce(), ticket.proof().nonce())) throw ImFailure.bindingVerification();
        return ticket;
    }

    static void verifyOwner(ImLoginChallenges.Context context, ImBindingIdentity.Verification local) {
        if (context == null || context.purpose() != ImLoginChallenges.Purpose.BIND || local == null
                || local.identity().action() != ImBindingAction.BIND || context.tenantId() != local.actor().tenantId()
                || context.ownerUserId() != local.actor().userId() || context.ownerVersion() != local.identity().userVersion()
                || !ImLoginChallenges.equal(context.ownerSessionDigest(), local.identity().sessionDigest())
                || !ImLoginChallenges.equal(context.ownerCredentialStamp(), local.identity().credentialStamp())
                || !ImLoginChallenges.equal(context.ownerProofNonce(), local.ticket().proof().nonce())) throw ImFailure.bindingVerification();
    }

    public record Pending(String externalAccount, long expiresAt) {
        @Override public String toString() { return "ImBindingFlow.Pending[redacted]"; }
    }
}
