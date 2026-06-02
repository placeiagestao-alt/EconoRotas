import { getLoginUrl } from "@/const";
import { clearAuthSessionToken } from "@/lib/authSession";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

const AUTH_CACHE_KEY = "routing-pwa:last-auth-user";

function readCachedUser() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearCachedUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_CACHE_KEY);
}

function clearAuthState() {
  clearCachedUser();
  clearAuthSessionToken();
}

function isUnauthorizedError(error: unknown) {
  return (
    error instanceof TRPCClientError &&
    (error.data?.code === "UNAUTHORIZED" ||
      error.message === "Please login (10001)")
  );
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const cachedUser = useMemo(() => readCachedUser(), []);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error)) return false;
      return failureCount < 2;
    },
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
      clearAuthState();
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      clearAuthState();
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    if (isUnauthorizedError(meQuery.error)) {
      clearAuthState();
    }

    if (typeof window !== "undefined" && meQuery.data) {
      window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(meQuery.data));
    }

    const hasNetworkLikeError =
      meQuery.error instanceof Error &&
      !isUnauthorizedError(meQuery.error);
    const fallbackUser = hasNetworkLikeError ? cachedUser : null;
    const resolvedUser = meQuery.data ?? fallbackUser ?? null;

    return {
      user: resolvedUser,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(resolvedUser),
      degradedAuth: !meQuery.data && Boolean(fallbackUser),
    };
  }, [
    cachedUser,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (meQuery.error && !isUnauthorizedError(meQuery.error)) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.error,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
