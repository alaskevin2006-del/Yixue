import { queryOptions } from "@tanstack/react-query";
import { api, ApiError } from "./client";

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: ({ signal }) => api.session(signal),
  retry: false,
  staleTime: 60_000,
});

export const catalogQuery = queryOptions({
  queryKey: ["catalog"],
  queryFn: ({ signal }) => api.catalog(signal),
  staleTime: 5 * 60_000,
});

export function resourcesQuery(params: string) {
  return queryOptions({
    queryKey: ["resources", params],
    queryFn: ({ signal }) => api.resources(params, signal),
  });
}

export function requestsQuery(params: string) {
  return queryOptions({
    queryKey: ["requests", params],
    queryFn: ({ signal }) => api.requests(params, signal),
  });
}

export function requestDetailsQuery(id: string) {
  return queryOptions({
    queryKey: ["request", id],
    queryFn: ({ signal }) => api.requestDetails(id, signal),
    enabled: Boolean(id),
  });
}

export function retryQuery(failureCount: number, error: Error) {
  return (
    (!(error instanceof ApiError) || error.status >= 500) && failureCount < 1
  );
}
