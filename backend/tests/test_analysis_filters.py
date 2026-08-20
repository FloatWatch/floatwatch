from app.analysis_service import (
    NET_MIN_CONFIDENCE,
    TemporalDetectionFilter,
    class_confidence_indices,
)


def test_net_uses_stricter_confidence_threshold():
    names = {0: "Net", 1: "PET_Bottle"}

    kept = class_confidence_indices([0, 0, 1], [NET_MIN_CONFIDENCE - 0.01, NET_MIN_CONFIDENCE, 0.30], names, 0.25)

    assert kept == [1, 2]


def test_user_threshold_overrides_net_minimum_when_higher():
    kept = class_confidence_indices([0], [0.70], {0: "Net"}, 0.75)

    assert kept == []


def test_temporal_filter_requires_three_consecutive_overlapping_detections():
    temporal_filter = TemporalDetectionFilter(minimum_consecutive=3, iou_threshold=0.25)
    box = (10.0, 10.0, 40.0, 40.0)

    assert temporal_filter.update([(0, 7, box)]) == []
    assert temporal_filter.update([(0, 7, (11.0, 10.0, 41.0, 40.0))]) == []
    assert temporal_filter.update([(0, 7, (12.0, 11.0, 42.0, 41.0))]) == [0]


def test_temporal_filter_resets_after_a_missing_frame():
    temporal_filter = TemporalDetectionFilter(minimum_consecutive=3, iou_threshold=0.25)
    box = (10.0, 10.0, 40.0, 40.0)

    temporal_filter.update([(0, 7, box)])
    temporal_filter.update([(0, 7, box)])
    temporal_filter.update([])

    assert temporal_filter.update([(0, 7, box)]) == []
