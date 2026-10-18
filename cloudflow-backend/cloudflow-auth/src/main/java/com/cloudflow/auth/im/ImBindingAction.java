package com.cloudflow.auth.im;

public enum ImBindingAction {
    BIND("system:im:binding:bind"),
    UNBIND("system:im:binding:unbind"),
    ADMIN_UNBIND("system:im:binding:manage"),
    ADMIN_RESUME("system:im:binding:manage");

    private final String permission;

    ImBindingAction(String permission) { this.permission = permission; }

    public String permission() { return permission; }

    public boolean management() { return this == ADMIN_UNBIND || this == ADMIN_RESUME; }
}
