import { useEffect, useRef, memo } from "react";

// Leaflet CSS — import once here, tree-shakeable from bundle
import "leaflet/dist/leaflet.css";

export interface LocationMapProps {
    adminLat: number;
    adminLng: number;
    userLat: number;
    userLng: number;
    distance: number;       // metres
    maxDistance: number;    // metres (allowed radius)
    className?: string;
}

// ── SVG icon factory (avoids Leaflet's default-marker 404 on Vite) ──────────
function makeSvgIcon(color: string, inner: string) {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 44" width="36" height="44">
      <path d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.059 27.941 0 18 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="18" y="22" text-anchor="middle" font-size="14" fill="#fff"
            font-family="sans-serif" dominant-baseline="middle">${inner}</text>
    </svg>`;
    return svg;
}

// ── Component ────────────────────────────────────────────────────────────────
const LocationMap = memo(({
    adminLat, adminLng,
    userLat, userLng,
    distance, maxDistance,
    className = "",
}: LocationMapProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        // Dynamic import keeps Leaflet out of the initial JS chunk
        import("leaflet").then((L) => {
            if (!containerRef.current || mapRef.current) return;

            const isInside = distance <= maxDistance;

            // ── Init map ──
            const map = L.default.map(containerRef.current, {
                zoomControl: true,
                attributionControl: false,   // hide attribution bar for cleaner UI
                scrollWheelZoom: false,      // avoid accidental scroll-hijack on mobile
            });
            mapRef.current = map;

            // ── Tile layer (OpenStreetMap, free) ──
            L.default.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                // keepBuffer: wider tile cache = smoother pan
                keepBuffer: 4,
            }).addTo(map);

            // ── Custom markers ──
            const makeIcon = (svgStr: string) =>
                L.default.divIcon({
                    html: svgStr,
                    className: "",             // remove leaflet's default white box
                    iconSize: [36, 44],
                    iconAnchor: [18, 44],
                    popupAnchor: [0, -44],
                });

            const adminIcon = makeIcon(makeSvgIcon("#6366f1", "🏫"));
            const userIcon = makeIcon(makeSvgIcon(isInside ? "#22c55e" : "#ef4444", "📍"));

            // ── Admin marker ──
            L.default.marker([adminLat, adminLng], { icon: adminIcon })
                .addTo(map)
                .bindPopup("<b>Vị trí lớp học</b><br>Địa điểm giảng viên đã cài đặt");

            // ── Student marker ──
            L.default.marker([userLat, userLng], { icon: userIcon })
                .addTo(map)
                .bindPopup(`<b>Vị trí của bạn</b><br>Cách lớp học: <b>${Math.round(distance)}m</b>`);

            // ── Radius circle ──
            L.default.circle([adminLat, adminLng], {
                radius: maxDistance,
                color: isInside ? "#22c55e" : "#ef4444",
                fillColor: isInside ? "#22c55e" : "#ef4444",
                fillOpacity: 0.08,
                weight: 2,
                dashArray: "6 4",
            }).addTo(map);

            // ── Line between admin & user ──
            L.default.polyline(
                [[adminLat, adminLng], [userLat, userLng]],
                { color: isInside ? "#22c55e" : "#ef4444", weight: 2, dashArray: "4 6", opacity: 0.7 }
            ).addTo(map);

            // ── Fit both markers in view ──
            const bounds = L.default.latLngBounds(
                [adminLat, adminLng],
                [userLat, userLng],
            );
            // padding so markers aren't right on the edge
            map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });

            // invalidate after a tick so container dimensions are final
            setTimeout(() => map.invalidateSize(), 0);
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // mount-only – props are stable at mount time

    return (
        <div
            ref={containerRef}
            className={`w-full rounded-xl overflow-hidden ${className}`}
            style={{ height: 280 }}
        />
    );
});

LocationMap.displayName = "LocationMap";
export default LocationMap;
