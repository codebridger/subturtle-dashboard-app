export function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

export function getQueryParam(key: string) {
  return getQueryParams().get(key);
}
