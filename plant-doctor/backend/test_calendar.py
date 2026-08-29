import unittest

from crop_calendar import preview_planting
from groq_client import CROPS


class CalendarTests(unittest.TestCase):
    def test_rice_harvest_window_from_15_june(self):
        result = preview_planting("rice", "2026-06-15", today="2026-08-29")
        self.assertEqual(result["expected_harvest_start"], "2026-10-13")
        self.assertEqual(result["expected_harvest_end"], "2026-11-02")
        self.assertEqual(result["days_grown"], 75)
        self.assertEqual(result["season_year"], 2026)
        self.assertEqual(result["stage"]["id"], "flowering")

    def test_chili_shorter_duration(self):
        result = preview_planting("chili", "2026-02-02", today="2026-05-07")
        self.assertEqual(result["expected_harvest_start"], "2026-05-03")
        self.assertEqual(result["expected_harvest_end"], "2026-05-23")
        self.assertEqual(result["stage"]["id"], "harvest")

    def test_harvest_reminder_when_window_near(self):
        result = preview_planting("green_gram", "2026-06-15", today="2026-08-10")
        kinds = {item["id"] for item in result["reminders"]}
        self.assertIn("harvest_soon", kinds)

    def test_every_crop_has_calendar_fields(self):
        for crop in CROPS.values():
            self.assertGreater(crop["min_days"], 0)
            self.assertGreaterEqual(crop["max_days"], crop["min_days"])
            self.assertTrue(crop["stages"])
            self.assertAlmostEqual(crop["stages"][0]["start"], 0)
            self.assertAlmostEqual(crop["stages"][-1]["end"], 1)

    def test_look_ahead_moves_the_stage_forward(self):
        result = preview_planting("rice", "2026-06-15", today="2026-08-29", ahead_days=30)
        ahead = result["look_ahead"]
        self.assertEqual(ahead["date"], "2026-09-28")
        self.assertEqual(ahead["days_grown"], 105)
        self.assertEqual(result["stage"]["id"], "flowering")
        self.assertEqual(ahead["stage"]["id"], "grain")
        self.assertTrue(ahead["stage_changed"])
        self.assertEqual(ahead["harvest_status"], "growing")
        self.assertEqual(ahead["days_to_harvest"], 15)

    def test_look_ahead_reaches_harvest_window(self):
        result = preview_planting("green_gram", "2026-06-15", today="2026-07-20", ahead_days=30)
        ahead = result["look_ahead"]
        self.assertEqual(ahead["harvest_status"], "ready")
        self.assertEqual(ahead["days_to_harvest"], 0)

    def test_look_ahead_flags_a_closed_window(self):
        result = preview_planting("green_gram", "2026-06-15", today="2026-08-20", ahead_days=30)
        self.assertEqual(result["look_ahead"]["harvest_status"], "overdue")

    def test_look_ahead_lists_only_tasks_inside_the_window(self):
        result = preview_planting("rice", "2026-06-15", today="2026-06-20", ahead_days=30)
        due = {task["id"] for task in result["look_ahead"]["tasks"]}
        # weeding lands on day 21, fertilising on day 40 — only weeding is inside.
        self.assertEqual(due, {"weed"})

    def test_look_ahead_headline_is_bilingual(self):
        ahead = preview_planting("rice", "2026-06-15", today="2026-08-29")["look_ahead"]
        self.assertTrue(ahead["headline"]["en"])
        self.assertTrue(ahead["headline"]["mm"])
        self.assertEqual(ahead["ahead_days"], 30)

    def test_unknown_crop_raises(self):
        with self.assertRaises(KeyError):
            preview_planting("banana", "2026-06-15")


if __name__ == "__main__":
    unittest.main()
