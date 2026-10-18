package com.cloudflow.oa.service.impl;

import cn.hutool.crypto.digest.BCrypt;
import cn.hutool.crypto.digest.DigestUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Map;

public class OaConsumableIdentityChecks {
    public static void main(String[] arguments) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode inputs = mapper.readTree(System.in);
            if (!inputs.isArray() || inputs.size() > 22) throw new IllegalArgumentException();
            ArrayList<Map<String, Object>> results = new ArrayList<Map<String, Object>>();
            for (JsonNode input : inputs) {
                String role = input.path("role").asText();
                String password = input.path("password").asText();
                String hash = input.path("hash").asText();
                if (!role.matches("[1-9]|10|11") || password.isBlank() || hash.isBlank()) throw new IllegalArgumentException();
                boolean matches = BCrypt.checkpw(DigestUtil.sha256Hex(password), hash) || BCrypt.checkpw(password, hash);
                results.add(Map.of("role", role, "matches", matches));
            }
            System.out.println(mapper.writeValueAsString(results));
        } catch (Exception exception) {
            System.err.println("OA_IDENTITY_OFFLINE_CHECK_FAILED");
            System.exit(1);
        }
    }
}
