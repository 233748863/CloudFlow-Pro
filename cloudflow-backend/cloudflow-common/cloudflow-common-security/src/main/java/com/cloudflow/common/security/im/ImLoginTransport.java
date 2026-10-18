package com.cloudflow.common.security.im;

import com.cloudflow.common.core.utils.IpUtils;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

public final class ImLoginTransport {
    private ImLoginTransport() { }

    public static String single(List<String> values) {
        if (values == null || values.isEmpty()) return null;
        if (values.size() != 1) throw invalid();
        String value = values.get(0);
        if (value == null || value.length() > 1024 || value.codePoints().anyMatch(Character::isISOControl)) throw invalid();
        return value;
    }

    public static boolean secure(boolean secure, String remote, String forwardedProto) {
        return secure || IpUtils.isTrustedProxy(literal(remote)) && "https".equalsIgnoreCase(forwardedProto);
    }

    public static String address(String remote, String forwarded) {
        String current = literal(remote);
        if (!IpUtils.isTrustedProxy(current) || forwarded == null) return current;
        if (forwarded.length() > 1024) throw invalid();
        String[] hops = forwarded.split(",", -1);
        if (hops.length > 20) throw invalid();
        for (int index = hops.length - 1; index >= 0 && IpUtils.isTrustedProxy(current); index--) current = literal(hops[index].trim());
        return current;
    }

    public static byte[] numeric(String value) {
        if (value == null || value.length() > 45) throw invalid();
        if (!value.contains(":")) {
            String[] parts = value.split("\\.", -1);
            if (parts.length != 4) throw invalid();
            byte[] bytes = new byte[4];
            for (int index = 0; index < parts.length; index++) {
                if (!parts[index].matches("0|[1-9][0-9]{0,2}")) throw invalid();
                int octet = Integer.parseInt(parts[index]);
                if (octet > 255) throw invalid();
                bytes[index] = (byte) octet;
            }
            return bytes;
        }
        if (!value.matches("[0-9a-fA-F:.]{2,45}")) throw invalid();
        try { return InetAddress.getByName(value).getAddress(); }
        catch (UnknownHostException failure) { throw invalid(); }
    }

    private static String literal(String value) {
        try { return InetAddress.getByAddress(numeric(value)).getHostAddress(); }
        catch (UnknownHostException failure) { throw invalid(); }
    }

    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Invalid enterprise login transport"); }
}
