import cv2
import numpy as np

from app.analysis_service import (
    NET_MIN_CONFIDENCE,
    OpticalFlowBoxTracker,
    TemporalDetectionFilter,
    class_confidence_indices,
    draw_tracked_boxes,
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


def test_optical_flow_tracker_moves_box_with_frame_content():
    first = np.zeros((100, 120, 3), dtype=np.uint8)
    for y in range(30, 61, 10):
        for x in range(25, 56, 10):
            cv2.circle(first, (x, y), 2, (255, 255, 255), -1)
    second = cv2.warpAffine(first, np.float32([[1, 0, 6], [0, 1, 3]]), (120, 100))
    tracker = OpticalFlowBoxTracker()
    tracker.reset(first, [{"class_id": 1, "confidence": 0.8, "box": (20.0, 25.0, 60.0, 65.0)}])

    tracked = tracker.update(second)

    x1, y1, x2, y2 = tracked[0]["box"]
    assert 25.0 <= x1 <= 27.0
    assert 27.0 <= y1 <= 29.0
    assert x2 - x1 == 40.0
    assert y2 - y1 == 40.0


def test_tracker_keeps_box_during_short_detection_gap():
    frame = np.zeros((80, 100, 3), dtype=np.uint8)
    tracker = OpticalFlowBoxTracker()
    detection = {"class_id": 1, "confidence": 0.8, "box": (20.0, 20.0, 60.0, 60.0)}

    assert len(tracker.reconcile(frame, [detection])) == 1
    for _ in range(5):
        assert len(tracker.reconcile(frame, [])) == 1
    assert tracker.reconcile(frame, []) == []


def test_tracker_refreshes_grace_period_when_detection_returns():
    frame = np.zeros((80, 100, 3), dtype=np.uint8)
    tracker = OpticalFlowBoxTracker()
    detection = {"class_id": 1, "confidence": 0.8, "box": (20.0, 20.0, 60.0, 60.0)}

    tracker.reconcile(frame, [detection])
    tracker.reconcile(frame, [])
    refreshed = tracker.reconcile(frame, [detection])

    assert len(refreshed) == 1
    assert refreshed[0]["missed_frames"] == 0


def test_draw_tracked_boxes_keeps_source_frame_unchanged():
    frame = np.zeros((80, 100, 3), dtype=np.uint8)

    annotated = draw_tracked_boxes(
        frame,
        [{"class_id": 1, "confidence": 0.8, "box": (20.0, 20.0, 60.0, 60.0)}],
        {1: "PET_Bottle"},
    )

    assert np.count_nonzero(frame) == 0
    assert np.count_nonzero(annotated) > 0
