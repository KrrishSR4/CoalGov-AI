import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
export default function MapView({
  features,
  mineId = "",
  mines = [],
}: {
  features: any;
  mineId?: string;
  mines?: any[];
}) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!node.current) return;
    const map = L.map(node.current, { scrollWheelZoom: false }).setView(
      [22.31, 82.62],
      12,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    const visible = {
      type: "FeatureCollection",
      features: (features?.features || []).filter(
        (f: any) => !mineId || f.properties.mine_id === mineId,
      ),
    };
    const layer = L.geoJSON(visible as any, {
      style: { color: "#127466", weight: 2, fillOpacity: 0.1 },
      pointToLayer: (f: any, ll) =>
        L.circleMarker(ll, {
          radius: f.properties.layer === "assets" ? 6 : 9,
          weight: 3,
          color: "#fff",
          fillOpacity: 1,
          fillColor:
            f.properties.layer === "assets"
              ? "#23758b"
              : f.properties.risk_score >= 70
                ? "#d25746"
                : "#d89820",
        }),
      onEachFeature: (f: any, l) => {
        const box = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = f.properties.name || f.properties.title;
        box.appendChild(name);
        const p = document.createElement("p");
        p.textContent =
          f.properties.layer === "observations"
            ? `Risk ${f.properties.risk_score} · ${f.properties.status.replaceAll("_", " ")}`
            : f.properties.kind || "Illustrative mine boundary";
        box.appendChild(p);
        l.bindPopup(box);
      },
    }).addTo(map);
    if (layer.getLayers().length)
      map.fitBounds(layer.getBounds(), { padding: [35, 35], maxZoom: 14 });
    else {
      const m = mines.find((x) => x.id === mineId) || mines[0];
      if (m) map.setView([m.latitude, m.longitude], 12);
    }
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [features, mineId, mines]);
  return (
    <div
      ref={node}
      className="map-view"
      aria-label="Map of mine boundaries, assets, and observations"
    />
  );
}
