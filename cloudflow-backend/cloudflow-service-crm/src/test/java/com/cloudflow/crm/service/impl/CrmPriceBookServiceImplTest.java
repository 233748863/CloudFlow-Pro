package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmPriceBook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;

@ExtendWith(MockitoExtension.class)
class CrmPriceBookServiceImplTest {

    private CrmPriceBookServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(2001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(100000L);
        service = spy(new CrmPriceBookServiceImpl());
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void createPriceBook_fillsDefaultsFromContext() {
        CrmPriceBook priceBook = new CrmPriceBook();
        priceBook.setPriceBookName("2026 标准价目表");

        doReturn(true).when(service).save(any(CrmPriceBook.class));

        boolean result = service.createPriceBook(priceBook);

        assertTrue(result);
        assertNotNull(priceBook.getPriceBookNo());
        assertEquals("CNY", priceBook.getCurrency());
        assertEquals(CrmConstants.PriceBookStatus.ACTIVE, priceBook.getStatus());
        assertEquals(2001L, priceBook.getOwnerId());
        assertEquals("tester", priceBook.getOwnerName());
        assertEquals(100000L, priceBook.getTenantId());
        assertEquals(CrmConstants.DelFlag.NORMAL, priceBook.getDeleted());
    }

    @Test
    void updatePriceBook_keepsPersistedIdentityFields() {
        CrmPriceBook input = new CrmPriceBook();
        input.setPriceBookId(1L);
        input.setPriceBookName("2026 标准价目表");

        CrmPriceBook persisted = new CrmPriceBook();
        persisted.setPriceBookId(1L);
        persisted.setTenantId(100000L);
        persisted.setPriceBookNo("JM-2026-001");
        persisted.setOwnerId(2001L);
        persisted.setOwnerName("tester");

        service = spy(new CrmPriceBookServiceImpl());
        doReturn(persisted).when(service).getById(1L);
        doReturn(true).when(service).updateById(any(CrmPriceBook.class));

        boolean result = service.updatePriceBook(input);

        assertTrue(result);
        assertEquals(100000L, input.getTenantId());
        assertEquals("JM-2026-001", input.getPriceBookNo());
        assertEquals(2001L, input.getOwnerId());
        assertEquals("tester", input.getOwnerName());
        assertEquals("tester", input.getUpdateBy());
    }
}
