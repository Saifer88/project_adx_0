/**
 * Behavior scan result types.
 */

export interface BehaviorApi {
  /** Whether a `setup` export exists (required for a usable component). */
  hasSetup: boolean;
  /** Event handler export names (`on<Event>`), sorted. */
  events: string[];
  /** Computed value export names (`get<Name>`), sorted. */
  computed: string[];
  /** Lifecycle hook export names (onMounted/onUnmounted/onUpdated), sorted. */
  lifecycle: string[];
  /** Exports not matching any known convention, sorted. */
  other: string[];
  /** Every exported name found, sorted. */
  all: string[];
}
