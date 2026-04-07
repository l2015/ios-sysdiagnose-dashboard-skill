"""Basic tests for iphone-sysdiagnose."""
import sys
import os
import json
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from extract import bundle_display_name, parse_crashes, parse_vpn_extensions
from report import generate_report, fmt_bytes, fmt_seconds


class TestBundleDisplayName:
    def test_apple_app(self):
        assert bundle_display_name("com.apple.mobilesafari") == "mobilesafari"

    def test_third_party(self):
        assert bundle_display_name("com.tencent.xin") == "xin"

    def test_empty(self):
        assert bundle_display_name("") == "unknown"

    def test_none(self):
        assert bundle_display_name(None) == "unknown"


class TestFmtBytes:
    def test_zero(self):
        assert fmt_bytes(0) == "0 B"

    def test_kb(self):
        assert "KB" in fmt_bytes(1024)

    def test_mb(self):
        assert "MB" in fmt_bytes(1024 * 1024)

    def test_gb(self):
        assert "GB" in fmt_bytes(1024 * 1024 * 1024)


class TestFmtSeconds:
    def test_seconds(self):
        assert fmt_seconds(30) == "30s"

    def test_minutes(self):
        assert fmt_seconds(90) == "1m 30s"

    def test_hours(self):
        assert fmt_seconds(3661) == "1h 1m"

    def test_days(self):
        assert fmt_seconds(90000) == "1d 1h"


class TestParseCrashes:
    def test_missing_dir(self):
        result = parse_crashes("/nonexistent")
        assert result == {"total": 0}

    def test_with_data(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            crash_file = os.path.join(tmpdir, "crashlogs.jsonl")
            with open(crash_file, "w") as f:
                f.write('{"data": {"name": "JetsamEvent-xxx"}}\n')
                f.write('{"data": {"name": "ExcUserFault_MobileSafari"}}\n')
                f.write('{"data": {"name": "com.foo.diskwrites_resource"}}\n')

            result = parse_crashes(tmpdir)
            assert result["total"] == 3
            assert result["jetsam"] == 1
            assert result["safari"] == 1
            assert result["disk_writes"] == 1


class TestReportGeneration:
    def test_minimal_report(self):
        data = {
            "battery": {"health_pct": 95, "cycle_count": 100, "design_capacity_mah": 3000,
                        "current_max_capacity_mah": 2850, "temperature_c": 30, "voltage_mv": 3800},
            "nand_smart": {"percent_used": 10, "host_writes_sectors": 1000000, "host_reads_sectors": 5000000},
            "crashes": {"total": 0},
            "app_nand_writers": [],
            "app_screen_time": [],
        }
        html = generate_report(data)
        assert "<!DOCTYPE html>" in html
        assert "95%" in html
        assert "Battery Health" in html
