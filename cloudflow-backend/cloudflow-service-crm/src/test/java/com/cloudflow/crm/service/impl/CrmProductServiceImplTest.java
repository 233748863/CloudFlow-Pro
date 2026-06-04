package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmProduct;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;

@ExtendWith(MockitoExtension.class)
class CrmProductServiceImplTest {

    private CrmProductServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(2001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(100000L);
        service = spy(new CrmProductServiceImpl());
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void createProduct_fillsDefaultsFromContext() {
        CrmProduct product = new CrmProduct();
        product.setProductName("旗舰套件");

        doReturn(true).when(service).save(any(CrmProduct.class));

        boolean result = service.createProduct(product);

        assertTrue(result);
        assertNotNull(product.getProductNo());
        assertEquals(BigDecimal.ZERO, product.getStandardPrice());
        assertEquals("CNY", product.getCurrency());
        assertEquals(CrmConstants.ProductStatus.ACTIVE, product.getStatus());
        assertEquals(2001L, product.getOwnerId());
        assertEquals("tester", product.getOwnerName());
        assertEquals(100000L, product.getTenantId());
        assertEquals(CrmConstants.DelFlag.NORMAL, product.getDeleted());
    }

    @Test
    void updateProduct_keepsPersistedIdentityFields() {
        CrmProduct input = new CrmProduct();
        input.setProductId(1L);
        input.setProductName("旗舰套件");
        input.setCategory("软件");

        CrmProduct persisted = new CrmProduct();
        persisted.setProductId(1L);
        persisted.setTenantId(100000L);
        persisted.setProductNo("CP-2026-001");
        persisted.setOwnerId(2001L);
        persisted.setOwnerName("tester");

        service = spy(new CrmProductServiceImpl());
        doReturn(persisted).when(service).getById(1L);
        doReturn(true).when(service).updateById(any(CrmProduct.class));

        boolean result = service.updateProduct(input);

        assertTrue(result);
        assertEquals(100000L, input.getTenantId());
        assertEquals("CP-2026-001", input.getProductNo());
        assertEquals(2001L, input.getOwnerId());
        assertEquals("tester", input.getOwnerName());
        assertEquals("tester", input.getUpdateBy());
    }
}
