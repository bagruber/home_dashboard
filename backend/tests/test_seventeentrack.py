"""Mapping tests: 17TRACK v2.4 track_info -> our parcel fields."""
from app.seventeentrack import simplify


def test_simplify_full_payload():
    info = {
        "latest_status": {"status": "InTransit", "sub_status": "InTransit_PickedUp"},
        "latest_event": {
            "time_iso": "2026-07-12T09:31:00+02:00",
            "description": "Sendung im Paketzentrum bearbeitet",
            "location": "Feucht, DE",
        },
        "time_metrics": {"estimated_delivery_date": {"source": "Carrier", "from": "2026-07-14", "to": None}},
    }
    out = simplify(info)
    assert out["status"] == "in_transit"
    assert out["estimatedDelivery"] == "2026-07-14"
    assert out["lastEvent"] == {
        "timestamp": "2026-07-12T09:31:00+02:00",
        "location": "Feucht, DE",
        "text": "Sendung im Paketzentrum bearbeitet",
    }


def test_simplify_status_mapping():
    def status_of(s: str) -> str:
        return simplify({"latest_status": {"status": s}})["status"]

    assert status_of("Delivered") == "delivered"
    assert status_of("OutForDelivery") == "out_for_delivery"
    assert status_of("AvailableForPickup") == "available_for_pickup"
    assert status_of("InfoReceived") == "in_transit"
    assert status_of("DeliveryFailure") == "exception"
    assert status_of("Exception") == "exception"
    assert status_of("NotFound") == "unknown"
    assert status_of("Expired") == "unknown"
    assert status_of("") == "unknown"


def test_simplify_dict_location_and_missing_event():
    info = {
        "latest_status": {"status": "Delivered"},
        "latest_event": {
            "time_iso": "2026-07-12T11:02:00+02:00",
            "description": "Zugestellt",
            "location": {"city": "Moosburg", "country": "DE"},
        },
    }
    out = simplify(info)
    assert out["lastEvent"]["location"] == "Moosburg"
    assert out["estimatedDelivery"] is None

    empty = simplify({})
    assert empty == {"status": "unknown", "lastEvent": None, "estimatedDelivery": None}
