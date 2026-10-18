import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.domain.SysConfig;
import com.cloudflow.auth.service.impl.SysConfigServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import org.apache.ibatis.builder.MapperBuilderAssistant;

public final class ConfigTenantUniquenessChecks {
    private static int checks;

    public static void main(String[] arguments) {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "config-scope-checks"), SysConfig.class);
        ConfigTenantUniquenessChecks.ConfigService service = new ConfigService();
        UserContext.setTenantId(100000L);
        try {
            SysConfig create = input(null, null);
            verify(service.checkConfigKeyUnique(create), "new same-tenant configuration");
            verify(Long.valueOf(100000L).equals(create.getTenantId()), "tenant defaults to authenticated tenant");
            verify(!service.checkConfigKeyUnique(input(null, 100001L)), "create cannot override authenticated tenant");
            verify(!service.checkConfigKeyUnique(input(999L, null)), "unknown configuration rejected");
            verify(!service.checkConfigKeyUnique(input(212L, 100001L)), "update cannot change persisted tenant");
            verify(service.checkConfigKeyUnique(input(212L, null)), "update resolves persisted tenant before uniqueness query");
            service.duplicate = true;
            verify(!service.checkConfigKeyUnique(input(212L, null)), "same-tenant duplicate rejected");
            UserContext.clear();
            verify(!service.checkConfigKeyUnique(input(null, null)), "tenantless create rejected");
            System.out.println("PASS: " + checks + " tenant configuration uniqueness checks");
        } finally {
            UserContext.clear();
        }
    }

    private static SysConfig input(Long id, Long tenantId) {
        SysConfig value = new SysConfig();
        value.setConfigId(id);
        value.setTenantId(tenantId);
        value.setConfigKey("sys.oa.consumable.approverUserId");
        return value;
    }

    private static void verify(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }

    private static final class ConfigService extends SysConfigServiceImpl {
        private boolean duplicate;

        private ConfigService() {
            super(null, null);
        }

        @Override
        public SysConfig getById(java.io.Serializable id) {
            return Long.valueOf(212L).equals(id) ? input(212L, 100000L) : null;
        }

        @Override
        public long count(Wrapper<SysConfig> wrapper) {
            LambdaQueryWrapper<SysConfig> query = (LambdaQueryWrapper<SysConfig>) wrapper;
            verify(query.getSqlSegment().contains("tenant_id"), "explicit tenant predicate is present");
            verify(query.getParamNameValuePairs().containsValue(100000L), "uniqueness uses intended tenant");
            return duplicate ? 1 : 0;
        }
    }
}
