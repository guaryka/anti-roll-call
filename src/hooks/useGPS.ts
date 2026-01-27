import { useState, useCallback } from 'react';

interface GPSResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface UseGPSReturn {
  getAveragePosition: () => Promise<GPSResult>;
  isLoading: boolean;
  error: string | null;
}

// Calculate distance between two GPS coordinates in meters (Haversine formula)
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const useGPS = (): UseGPSReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSinglePosition = (): Promise<GPSResult> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Trình duyệt không hỗ trợ GPS'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (err) => {
          switch (err.code) {
            case err.PERMISSION_DENIED:
              reject(new Error('Bạn đã từ chối quyền truy cập vị trí. Vui lòng bật GPS và cho phép truy cập.'));
              break;
            case err.POSITION_UNAVAILABLE:
              reject(new Error('Không thể lấy vị trí. Vui lòng đảm bảo GPS đang bật.'));
              break;
            case err.TIMEOUT:
              reject(new Error('Hết thời gian lấy vị trí. Vui lòng thử lại.'));
              break;
            default:
              reject(new Error('Có lỗi khi lấy vị trí.'));
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Get 4 GPS readings in 1 second, remove the furthest outlier, average the remaining 3
  const getAveragePosition = useCallback(async (): Promise<GPSResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const readings: GPSResult[] = [];
      const numReadings = 4; // Take 4 readings
      const delayBetweenReadings = 250; // ~1 second total for 4 readings (250ms * 4 = 1s)

      // Get 4 readings quickly (within ~1 second)
      for (let i = 0; i < numReadings; i++) {
        try {
          const position = await getSinglePosition();
          readings.push(position);
          
          // Wait 250ms between readings (except for the last one)
          if (i < numReadings - 1) {
            await delay(delayBetweenReadings);
          }
        } catch (err) {
          // If we have at least 2 readings, continue
          if (readings.length >= 2) break;
          throw err;
        }
      }

      if (readings.length === 0) {
        throw new Error('Không thể lấy vị trí GPS');
      }

      // If we have less than 3 readings, just average what we have
      if (readings.length < 3) {
        const avgLatitude =
          readings.reduce((sum, r) => sum + r.latitude, 0) / readings.length;
        const avgLongitude =
          readings.reduce((sum, r) => sum + r.longitude, 0) / readings.length;
        const avgAccuracy =
          readings.reduce((sum, r) => sum + r.accuracy, 0) / readings.length;

        return {
          latitude: avgLatitude,
          longitude: avgLongitude,
          accuracy: avgAccuracy,
        };
      }

      // Calculate centroid of all readings
      const centroidLat = readings.reduce((sum, r) => sum + r.latitude, 0) / readings.length;
      const centroidLon = readings.reduce((sum, r) => sum + r.longitude, 0) / readings.length;

      // Find the reading furthest from centroid (the outlier)
      let maxDistanceIndex = 0;
      let maxDistance = 0;

      for (let i = 0; i < readings.length; i++) {
        const distance = calculateDistance(
          readings[i].latitude,
          readings[i].longitude,
          centroidLat,
          centroidLon
        );
        if (distance > maxDistance) {
          maxDistance = distance;
          maxDistanceIndex = i;
        }
      }

      // Remove the outlier (the reading furthest from centroid)
      const filteredReadings = readings.filter((_, index) => index !== maxDistanceIndex);

      // Calculate average of remaining readings (3 readings)
      const avgLatitude =
        filteredReadings.reduce((sum, r) => sum + r.latitude, 0) / filteredReadings.length;
      const avgLongitude =
        filteredReadings.reduce((sum, r) => sum + r.longitude, 0) / filteredReadings.length;
      const avgAccuracy =
        filteredReadings.reduce((sum, r) => sum + r.accuracy, 0) / filteredReadings.length;

      return {
        latitude: avgLatitude,
        longitude: avgLongitude,
        accuracy: avgAccuracy,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Có lỗi khi lấy vị trí';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { getAveragePosition, isLoading, error };
};

export default useGPS;
