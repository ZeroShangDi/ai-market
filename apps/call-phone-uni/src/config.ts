// Preview data is available only during development; release builds always use the customer data plane.
export const mockEnabled = import.meta.env.DEV && import.meta.env.VITE_MOBILE_MOCK === 'true'
export const apiBaseUrl = (import.meta.env.VITE_CUSTOMER_API_BASE_URL || '').replace(/\/$/, '')
export const dispatchPollMs = 15000
