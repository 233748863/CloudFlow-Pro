package com.cloudflow.auth.im;

import com.cloudflow.common.job.security.JobRequestSignature;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

final class ImJobSigningFixture {
    private ImJobSigningFixture() { }

    static JobRequestSignature auth() {
        Map<String, String> keys = new LinkedHashMap<>();
        SecureRandom random = new SecureRandom();
        for (String service : JobRequestSignature.SERVICES) {
            byte[] key = new byte[32];
            random.nextBytes(key);
            keys.put(service, Base64.getEncoder().encodeToString(key));
        }
        return new JobRequestSignature("cloudflow-auth", keys, Clock.systemUTC());
    }
}
