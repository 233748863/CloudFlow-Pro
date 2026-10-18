package com.cloudflow.common.message.api;

public record MessageChannelReadiness(boolean ready, String reason) { }
