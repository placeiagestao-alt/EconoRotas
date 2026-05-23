/**
 * Route optimization algorithms for TSP (Traveling Salesman Problem)
 * Implements Nearest Neighbor heuristic for efficient route optimization
 */

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  notes?: string;
}

export interface OptimizedRoute {
  sequence: number[];
  totalDistance: number;
  totalTime: number;
  waypoints: Array<Location & { sequence: number }>;
}

export interface RouteOptimizationOptions {
  startLocation?: Location;
  endLocation?: Location;
}

/**
 * Calculate great-circle distance between two points using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(loc1: Location, loc2: Location): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(loc2.latitude - loc1.latitude);
  const dLon = toRad(loc2.longitude - loc1.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(loc1.latitude)) *
      Math.cos(toRad(loc2.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 */
function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Estimate travel time between two locations
 * Assumes average speed of 40 km/h in urban areas, 60 km/h in highways
 * Returns time in minutes
 */
export function estimateTravelTime(distance: number): number {
  // Average speed: 40 km/h urban, 60 km/h highway
  // Weighted average: 50 km/h
  const avgSpeed = 50;
  return Math.round((distance / avgSpeed) * 60);
}

/**
 * Nearest Neighbor algorithm for TSP optimization
 * Starts from the first location and greedily selects the nearest unvisited location
 * Time complexity: O(n²)
 * Good for moderate number of stops (< 100)
 */
export function optimizeRouteNearestNeighbor(
  locations: Location[],
  startIndex: number = 0,
  options: RouteOptimizationOptions = {}
): OptimizedRoute {
  if (locations.length === 0) {
    if (options.startLocation && options.endLocation) {
      const distance = calculateDistance(options.startLocation, options.endLocation);
      return {
        sequence: [],
        totalDistance: Math.round(distance * 100) / 100,
        totalTime: estimateTravelTime(distance),
        waypoints: [],
      };
    }

    return {
      sequence: [],
      totalDistance: 0,
      totalTime: 0,
      waypoints: [],
    };
  }

  if (options.startLocation || options.endLocation) {
    const n = locations.length;
    const visited = new Array(n).fill(false);
    const sequence: number[] = [];
    let totalDistance = 0;
    let totalTime = 0;
    let currentLocation = options.startLocation ?? locations[startIndex];

    if (!options.startLocation) {
      visited[startIndex] = true;
      sequence.push(startIndex);
    }

    while (sequence.length < n) {
      let nearestIndex = -1;
      let nearestDistance = Infinity;

      for (let i = 0; i < n; i++) {
        if (visited[i]) continue;

        const distance = calculateDistance(currentLocation, locations[i]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      if (nearestIndex === -1) {
        break;
      }

      visited[nearestIndex] = true;
      sequence.push(nearestIndex);
      totalDistance += nearestDistance;
      totalTime += estimateTravelTime(nearestDistance);
      currentLocation = locations[nearestIndex];
    }

    if (options.endLocation) {
      const distanceToEnd = calculateDistance(currentLocation, options.endLocation);
      totalDistance += distanceToEnd;
      totalTime += estimateTravelTime(distanceToEnd);
    }

    const waypoints = sequence.map((idx, seq) => ({
      ...locations[idx],
      sequence: seq,
    }));

    return {
      sequence,
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalTime,
      waypoints,
    };
  }

  if (locations.length === 1) {
    return {
      sequence: [0],
      totalDistance: 0,
      totalTime: 0,
      waypoints: [{ ...locations[0], sequence: 0 }],
    };
  }

  const n = locations.length;
  const visited = new Array(n).fill(false);
  const sequence: number[] = [];
  let currentIndex = startIndex;
  let totalDistance = 0;
  let totalTime = 0;

  visited[currentIndex] = true;
  sequence.push(currentIndex);

  for (let i = 1; i < n; i++) {
    let nearestIndex = -1;
    let nearestDistance = Infinity;

    // Find nearest unvisited location
    for (let j = 0; j < n; j++) {
      if (!visited[j]) {
        const distance = calculateDistance(locations[currentIndex], locations[j]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = j;
        }
      }
    }

    if (nearestIndex !== -1) {
      visited[nearestIndex] = true;
      sequence.push(nearestIndex);
      totalDistance += nearestDistance;
      totalTime += estimateTravelTime(nearestDistance);
      currentIndex = nearestIndex;
    }
  }

  // Build waypoints with sequence information
  const waypoints = sequence.map((idx, seq) => ({
    ...locations[idx],
    sequence: seq,
  }));

  return {
    sequence,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalTime,
    waypoints,
  };
}

/**
 * Optimize route based on mode
 * - shortest_distance: Minimize total distance
 * - shortest_time: Minimize total time (currently same as distance)
 * - balanced: Balance between distance and time
 */
export function optimizeRoute(
  locations: Location[],
  mode: "shortest_distance" | "shortest_time" | "balanced" = "balanced",
  startIndex: number = 0,
  options: RouteOptimizationOptions = {}
): OptimizedRoute {
  // All modes currently use Nearest Neighbor
  // In production, could implement different algorithms for different modes
  return optimizeRouteNearestNeighbor(locations, startIndex, options);
}

/**
 * Calculate total distance for a given sequence
 */
export function calculateTotalDistance(locations: Location[], sequence: number[]): number {
  let total = 0;
  for (let i = 0; i < sequence.length - 1; i++) {
    total += calculateDistance(locations[sequence[i]], locations[sequence[i + 1]]);
  }
  return Math.round(total * 100) / 100;
}

/**
 * Calculate total time for a given sequence
 */
export function calculateTotalTime(locations: Location[], sequence: number[]): number {
  let total = 0;
  for (let i = 0; i < sequence.length - 1; i++) {
    const distance = calculateDistance(locations[sequence[i]], locations[sequence[i + 1]]);
    total += estimateTravelTime(distance);
  }
  return total;
}

/**
 * Validate locations for optimization
 */
export function validateLocations(locations: Location[]): { valid: boolean; error?: string } {
  if (!locations || locations.length === 0) {
    return { valid: false, error: "No locations provided" };
  }

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number") {
      return { valid: false, error: `Invalid coordinates at location ${i}` };
    }
    if (loc.latitude < -90 || loc.latitude > 90) {
      return { valid: false, error: `Invalid latitude at location ${i}` };
    }
    if (loc.longitude < -180 || loc.longitude > 180) {
      return { valid: false, error: `Invalid longitude at location ${i}` };
    }
  }

  return { valid: true };
}
