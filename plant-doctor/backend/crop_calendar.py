"""Harvest windows, growth stages, and in-app care reminders for plantings."""

from datetime import date, timedelta

from groq_client import CROPS

HARVEST_REMIND_DAYS = 14


def _parse_iso(value: str) -> date:
    return date.fromisoformat(value)


def _iso(value: date) -> str:
    return value.isoformat()


def typical_days(crop: dict) -> int:
    return (int(crop["min_days"]) + int(crop["max_days"])) // 2


def harvest_window(crop: dict, planted_on: date) -> dict:
    return {
        "expected_harvest_start": planted_on + timedelta(days=int(crop["min_days"])),
        "expected_harvest_end": planted_on + timedelta(days=int(crop["max_days"])),
    }


def days_grown(planted_on: date, today: date) -> int:
    return max(0, (today - planted_on).days)


def progress_ratio(crop: dict, planted_on: date, today: date) -> float:
    grown = days_grown(planted_on, today)
    typical = typical_days(crop)
    if typical <= 0:
        return 0.0
    return max(0.0, min(1.0, grown / typical))


def current_stage(crop: dict, planted_on: date, today: date) -> dict:
    ratio = progress_ratio(crop, planted_on, today)
    stages = crop.get("stages") or []
    if not stages:
        return {"id": "unknown", "en": "Growing", "mm": "ကြီးထွားနေသည်", "start": 0, "end": 1}
    for stage in stages:
        start = float(stage["start"])
        end = float(stage["end"])
        if start <= ratio < end:
            return stage
        if end == 1 and ratio >= start:
            return stage
    return stages[-1]


def reminders(crop: dict, planted_on: date, today: date, harvested: bool) -> list:
    if harvested:
        return []
    items = []
    window = harvest_window(crop, planted_on)
    harvest_start = window["expected_harvest_start"]
    harvest_end = window["expected_harvest_end"]
    remind_from = harvest_start - timedelta(days=HARVEST_REMIND_DAYS)

    if today > harvest_end:
        items.append(
            {
                "id": "harvest_overdue",
                "kind": "harvest",
                "date": _iso(harvest_end),
                "en": "Harvest window has passed. Mark harvested when you finish.",
                "mm": "ရိတ်သိမ်းချိန် ကျော်လွန်ပါပြီ။ ရိတ်ပြီးလျှင် ရိတ်သိမ်းပြီးဟု မှတ်ပါ။",
            }
        )
    elif today >= remind_from:
        items.append(
            {
                "id": "harvest_soon",
                "kind": "harvest",
                "date": _iso(harvest_start),
                "en": "Harvest window is near. Prepare to harvest.",
                "mm": "ရိတ်သိမ်းချိန် နီးလာပါပြီ။ ရိတ်သိမ်းရန် ပြင်ဆင်ပါ။",
            }
        )

    for task in crop.get("care") or []:
        due = planted_on + timedelta(days=int(task["day"]))
        if today < due - timedelta(days=7):
            continue
        if today > due + timedelta(days=7):
            continue
        items.append(
            {
                "id": task["id"],
                "kind": "care",
                "date": _iso(due),
                "en": task["en"],
                "mm": task["mm"],
            }
        )
    return items


def preview_planting(crop_id: str, planted_on: str, today: str | None = None) -> dict:
    """Server-side harvest calc used by POST /calendar/preview."""
    if crop_id not in CROPS:
        raise KeyError(crop_id)
    crop = CROPS[crop_id]
    planted = _parse_iso(planted_on)
    now = _parse_iso(today) if today else date.today()
    window = harvest_window(crop, planted)
    stage = current_stage(crop, planted, now)
    ratio = progress_ratio(crop, planted, now)
    return {
        "crop": crop_id,
        "planted_on": _iso(planted),
        "season_year": planted.year,
        "expected_harvest_start": _iso(window["expected_harvest_start"]),
        "expected_harvest_end": _iso(window["expected_harvest_end"]),
        "typical_days": typical_days(crop),
        "days_grown": days_grown(planted, now),
        "progress": round(ratio, 3),
        "stage": {"id": stage["id"], "en": stage["en"], "mm": stage["mm"]},
        "stages": crop.get("stages", []),
        "reminders": reminders(crop, planted, now, harvested=False),
        "min_days": crop["min_days"],
        "max_days": crop["max_days"],
    }


def crop_catalog_entry(crop: dict) -> dict:
    return {
        "id": crop["id"],
        "name": crop["name"],
        "icon": crop["icon"],
        "min_days": crop.get("min_days"),
        "max_days": crop.get("max_days"),
        "stages": crop.get("stages", []),
        "care": crop.get("care", []),
    }
