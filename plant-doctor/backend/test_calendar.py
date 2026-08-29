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

    def test_unknown_crop_raises(self):
        with self.assertRaises(KeyError):
            preview_planting("banana", "2026-06-15")


if __name__ == "__main__":
    unittest.main()
