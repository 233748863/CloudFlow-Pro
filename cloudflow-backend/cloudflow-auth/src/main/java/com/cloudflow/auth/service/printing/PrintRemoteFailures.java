package com.cloudflow.auth.service.printing;

import com.cloudflow.common.core.exception.ServiceException;
import feign.FeignException;

/** Preserve safe business statuses even when the circuit breaker wraps Feign. */
final class PrintRemoteFailures {
    private PrintRemoteFailures() { }

    static ServiceException translate(Throwable failure, String message) {
        Throwable current = failure;
        for (int depth = 0; current != null && depth < 20; depth++) {
            if (current instanceof FeignException remote) {
                return new ServiceException(message, status(remote.status()));
            }
            current = current.getCause();
        }
        return new ServiceException(message, 503);
    }

    static int status(int status) {
        return switch (status) {
            case 400, 403, 404, 409 -> status;
            default -> 503;
        };
    }
}
