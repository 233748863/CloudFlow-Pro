package com.cloudflow.common.security.portal;

import com.cloudflow.common.core.utils.IpUtils;
import java.net.InetAddress;

public final class PortalClientAddress {
    private PortalClientAddress() { }

    public static String resolve(String remote, String forwarded) {
        String current = numeric(remote);
        if (current == null) return "unknown";
        if (!IpUtils.isTrustedProxy(current) || forwarded == null || forwarded.length() > 1024) return current;
        String[] hops = forwarded.split(",", -1);
        if (hops.length > 20) return current;
        for (int index = hops.length - 1; index >= 0 && IpUtils.isTrustedProxy(current); index--) {
            String candidate = numeric(hops[index].trim());
            if (candidate == null) return numeric(remote);
            current = candidate;
        }
        return current;
    }

    private static String numeric(String value) {
        if (value == null || !value.matches("[0-9a-fA-F:.]{2,45}")) return null;
        try {
            return IpUtils.normalizeIpAddress(InetAddress.getByName(value).getHostAddress());
        } catch (java.net.UnknownHostException invalid) {
            return null;
        }
    }
}
