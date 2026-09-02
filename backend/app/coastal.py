from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path


COASTAL_DISTANCE_METERS = 3_000.0
KOREA_BOUNDS = (32.0, 124.0, 39.5, 132.5)
COASTLINE_PATH = Path(__file__).with_name("data") / "korea_coastline.geojson"


@lru_cache(maxsize=1)
def coastline_segments() -> tuple[tuple[float, float, float, float], ...]:
    data = json.loads(COASTLINE_PATH.read_text(encoding="utf-8"))
    segments: list[tuple[float, float, float, float]] = []
    for feature in data.get("features", []):
        coordinates = feature.get("geometry", {}).get("coordinates", [])
        for start, end in zip(coordinates, coordinates[1:]):
            segments.append((start[1], start[0], end[1], end[0]))
    return tuple(segments)


def _distance_to_segment_m(latitude: float, longitude: float, segment: tuple[float, float, float, float]) -> float:
    lat1, lon1, lat2, lon2 = segment
    latitude_scale = 111_320.0
    longitude_scale = latitude_scale * math.cos(math.radians(latitude))
    ax, ay = (lon1 - longitude) * longitude_scale, (lat1 - latitude) * latitude_scale
    bx, by = (lon2 - longitude) * longitude_scale, (lat2 - latitude) * latitude_scale
    dx, dy = bx - ax, by - ay
    length_squared = dx * dx + dy * dy
    ratio = 0.0 if length_squared == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length_squared))
    return math.hypot(ax + ratio * dx, ay + ratio * dy)


def classify_coastal_location(latitude: float, longitude: float) -> dict[str, float | bool | str]:
    south, west, north, east = KOREA_BOUNDS
    if not (south <= latitude <= north and west <= longitude <= east):
        return {"eligible": False, "distance_m": -1.0, "reason": "outside_korea"}
    distance = min(_distance_to_segment_m(latitude, longitude, segment) for segment in coastline_segments())
    return {
        "eligible": distance <= COASTAL_DISTANCE_METERS,
        "distance_m": round(distance, 1),
        "reason": "within_coastal_zone" if distance <= COASTAL_DISTANCE_METERS else "outside_coastal_zone",
    }
