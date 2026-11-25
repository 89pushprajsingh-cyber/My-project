import { useEffect } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { LatLngPoint } from '../types';

interface MapRadiusCircleProps {
  center: LatLngPoint;
  radiusKm: number | null;
}

export function MapRadiusCircle({ center, radiusKm }: MapRadiusCircleProps) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || radiusKm === null || radiusKm <= 0) {
      return;
    }

    const circle = new mapsLib.Circle({
      map,
      center,
      radius: radiusKm * 1000,
      strokeColor: '#b48936',
      strokeOpacity: 0.85,
      strokeWeight: 2,
      fillColor: '#c8a45d',
      fillOpacity: 0.14,
      clickable: false,
    });

    const bounds = circle.getBounds();
    if (bounds) {
      map.fitBounds(bounds, 40);
    }

    return () => {
      circle.setMap(null);
    };
  }, [map, mapsLib, center.lat, center.lng, radiusKm]);

  return null;
}

interface MapCameraSyncProps {
  center: LatLngPoint;
  zoom?: number;
  triggerKey: string | number;
}

export function MapCameraSync({ center, zoom = 13, triggerKey }: MapCameraSyncProps) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo(center);
    if (zoom) {
      map.setZoom(zoom);
    }
  }, [map, center.lat, center.lng, zoom, triggerKey]);

  return null;
}
