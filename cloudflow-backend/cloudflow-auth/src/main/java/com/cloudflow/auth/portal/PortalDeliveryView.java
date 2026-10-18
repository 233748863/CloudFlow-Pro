package com.cloudflow.auth.portal;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PortalDeliveryView {
    private String sendStatus;
    private String skipReason;
    private String errorMsg;
}
