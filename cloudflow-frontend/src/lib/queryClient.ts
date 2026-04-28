import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const queryKeys = {
  users: ['users'] as const,
  roles: ['roles'] as const,
  currentUser: ['user', 'current'] as const,
  announcements: ['announcements'] as const,
  schedules: ['schedules'] as const,
  leaveApplications: ['hr', 'leaveApplications'] as const,
  overtimeApplications: ['hr', 'overtimeApplications'] as const,
  leaveQuotas: ['hr', 'leaveQuotas'] as const,
};
