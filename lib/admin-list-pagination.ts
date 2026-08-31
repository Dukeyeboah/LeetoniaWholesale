export const INVENTORY_LIST_PAGE = {
  mobile: 24,
  desktop: 48,
  step: 24,
} as const;

export const RECEIVAL_LIST_PAGE = {
  mobile: 25,
  desktop: 50,
  step: 25,
} as const;

export function inventoryListPageSize(isMobile: boolean) {
  return isMobile ? INVENTORY_LIST_PAGE.mobile : INVENTORY_LIST_PAGE.desktop;
}

export function receivalListPageSize(isMobile: boolean) {
  return isMobile ? RECEIVAL_LIST_PAGE.mobile : RECEIVAL_LIST_PAGE.desktop;
}
