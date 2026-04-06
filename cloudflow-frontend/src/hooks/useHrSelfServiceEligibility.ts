import { useEffect, useState } from 'react';
import {
  getHrSelfServiceRestrictionMessage,
  HrEmployee,
  isHrSelfServiceCreatableEmployee,
  resolveCurrentEmployee,
} from '@/services/api/hr';

export const useHrSelfServiceEligibility = () => {
  const [currentEmployee, setCurrentEmployee] = useState<HrEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [restrictionMessage, setRestrictionMessage] = useState('');

  useEffect(() => {
    let active = true;

    const loadCurrentEmployee = async () => {
      setLoading(true);
      try {
        const employee = await resolveCurrentEmployee();
        if (!active) {
          return;
        }
        setCurrentEmployee(employee);
        setRestrictionMessage(getHrSelfServiceRestrictionMessage(employee));
      } catch (error) {
        if (!active) {
          return;
        }
        setCurrentEmployee(null);
        setRestrictionMessage(error instanceof Error ? error.message : '当前员工状态校验失败，请稍后重试');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    // 统一在页面初始化时同步当前 HR 员工档案，避免每个自助页各自拼状态判断。
    void loadCurrentEmployee();

    return () => {
      active = false;
    };
  }, []);

  return {
    currentEmployee,
    loading,
    canStartSelfService: !loading && isHrSelfServiceCreatableEmployee(currentEmployee) && !restrictionMessage,
    restrictionMessage,
  };
};
