import { OpenStackClient } from "../core/OpenStackClient";

/**
 * Abstract base class for all OpenStack resource services.
 *
 * Services only map REST responses to our types and let errors propagate;
 * caching and error toasts are handled by the useFetchWithCache hook, so a
 * failed refresh never replaces good cached data with an empty list.
 */
export abstract class BaseService {
  constructor(protected readonly client: OpenStackClient) {}
}
