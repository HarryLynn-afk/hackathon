"""Harvest windows, growth stages, and in-app care reminders for plantings."""

from datetime import date, timedelta

from groq_client import CROPS

HARVEST_REMIND_DAYS = 14
LOOK_AHEAD_DAYS = 30
DEFAULT_GROWTH_DAYS = {
    "rice": (120, 140),
    "groundnut": (100, 120),
    "black_gram": (70, 90),
    "green_gram": (60, 75),
    "pigeon_pea": (150, 180),
    "sesame": (80, 100),
    "chili": (90, 110),
    "maize": (90, 120),
}


def _parse_iso(value: str) -> date:
    return date.fromisoformat(value[:10])


def _iso(value: date) -> str:
    return value.isoformat()


def growth_days(crop: dict) -> tuple[int, int]:
    try:
        minimum = int(crop["min_days"])
        maximum = int(crop["max_days"])
        if minimum > 0 and maximum >= minimum:
            return minimum, maximum
    except (KeyError, TypeError, ValueError):
        pass
    return DEFAULT_GROWTH_DAYS.get(crop.get("id"), (90, 120))


def typical_days(crop: dict) -> int:
    minimum, maximum = growth_days(crop)
    return (minimum + maximum) // 2


def harvest_window(crop: dict, planted_on: date) -> dict:
    minimum, maximum = growth_days(crop)
    return {
        "expected_harvest_start": planted_on + timedelta(days=minimum),
        "expected_harvest_end": planted_on + timedelta(days=maximum),
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


def look_ahead(crop: dict, planted_on: date, today: date, ahead_days: int = LOOK_AHEAD_DAYS) -> dict:
    """What this planting looks like `ahead_days` from now.

    Farmers plan work weeks in advance, so the calendar answers "what will my
    crop be doing in a month" instead of only "what is it doing today".
    """
    ahead = max(1, int(ahead_days))
    target = today + timedelta(days=ahead)
    window = harvest_window(crop, planted_on)
    harvest_start = window["expected_harvest_start"]
    harvest_end = window["expected_harvest_end"]

    now_stage = current_stage(crop, planted_on, today)
    then_stage = current_stage(crop, planted_on, target)

    if target > harvest_end:
        status = "overdue"
    elif target >= harvest_start:
        status = "ready"
    else:
        status = "growing"

    # Care tasks that fall due between now and the target date — the whole
    # point of looking ahead is to see the work coming.
    tasks = []
    for task in crop.get("care") or []:
        due = planted_on + timedelta(days=int(task["day"]))
        if today < due <= target:
            tasks.append(
                {
                    "id": task["id"],
                    "date": _iso(due),
                    "in_days": (due - today).days,
                    "en": task["en"],
                    "mm": task["mm"],
                }
            )

    days_to_harvest = max(0, (harvest_start - target).days)
    crop_en = crop["name"]["en"]
    crop_mm = crop["name"]["mm"]

    if status == "growing":
        headline = {
            "en": f"In {ahead} days your {crop_en.lower()} will be at "
            f"{then_stage['en'].lower()}, about {days_to_harvest} days short of harvest.",
            "mm": f"{ahead} ရက်အကြာမှာ {crop_mm}က {then_stage['mm']} ရောက်နေပါလိမ့်မယ်။ "
            f"ရိတ်သိမ်းဖို့ {days_to_harvest} ရက်လောက် လိုပါသေးတယ်။",
        }
    elif status == "ready":
        headline = {
            "en": f"In {ahead} days your {crop_en.lower()} should be ready to harvest "
            f"(window opens {_iso(harvest_start)}).",
            "mm": f"{ahead} ရက်အကြာမှာ {crop_mm}က ရိတ်သိမ်းလို့ ရနေပါပြီ။ "
            f"ရိတ်သိမ်းချိန် စတာက {_iso(harvest_start)} ပါ။",
        }
    else:
        headline = {
            "en": f"In {ahead} days the harvest window will have closed. "
            f"Plan to harvest before {_iso(harvest_end)}.",
            "mm": f"{ahead} ရက်အကြာဆိုရင် ရိတ်သိမ်းချိန် ကျော်သွားပါပြီ။ "
            f"{_iso(harvest_end)} မတိုင်ခင် ရိတ်ဖို့ ပြင်ထားပါနော်။",
        }

    return {
        "ahead_days": ahead,
        "date": _iso(target),
        "days_grown": days_grown(planted_on, target),
        "progress": round(progress_ratio(crop, planted_on, target), 3),
        "stage": {"id": then_stage["id"], "en": then_stage["en"], "mm": then_stage["mm"]},
        "stage_changed": then_stage["id"] != now_stage["id"],
        "harvest_status": status,
        "days_to_harvest": days_to_harvest,
        "tasks": tasks,
        "headline": headline,
    }


def preview_planting(
    crop_id: str,
    planted_on: str,
    today: str | None = None,
    ahead_days: int = LOOK_AHEAD_DAYS,
) -> dict:
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
        "look_ahead": look_ahead(crop, planted, now, ahead_days),
        "min_days": growth_days(crop)[0],
        "max_days": growth_days(crop)[1],
    }


def crop_catalog_entry(crop: dict) -> dict:
    return {
        "id": crop["id"],
        "name": crop["name"],
        "icon": crop["icon"],
        "min_days": crop.get("min_days") or growth_days(crop)[0],
        "max_days": crop.get("max_days") or growth_days(crop)[1],
        "stages": crop.get("stages", []),
        "care": crop.get("care", []),
    }
