"""
Captures Python baseline for import parity harness.

Derives expected HIALaborSchedules rows directly from the same fixture specs
used by generate-fixtures.py. No DB or container required — synthetic fixtures
have fully deterministic, known expected output.

Mirrors the canonicalization logic in scripts/import-parity.ts so that the
generated JSON is byte-for-byte comparable after JSON.parse + JSON.stringify.

Run:
  python3 scripts/capture-python-baseline.py

Writes:
  tests/fixtures/excel/baselines/<workbook>.json  (one per fixture)
"""

import importlib.util
import json
import os
import re
from datetime import timedelta

# ---------------------------------------------------------------------------
# Load fixture specs from generate-fixtures.py (hyphen prevents direct import)
# ---------------------------------------------------------------------------

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.join(_SCRIPT_DIR, "..")


def _load_generate_fixtures():
    path = os.path.join(_SCRIPT_DIR, "generate-fixtures.py")
    spec = importlib.util.spec_from_file_location("generate_fixtures", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_gf = _load_generate_fixtures()
SPECS = _gf.SPECS

# ---------------------------------------------------------------------------
# Replicate TypeScript calcHours (lib/domain/rules.ts)
# ---------------------------------------------------------------------------


def _parse_time_to_minutes(time_str: str):
    m = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)$", time_str.strip(), re.IGNORECASE)
    if not m:
        return None
    hour, minute, period = int(m.group(1)), int(m.group(2)), m.group(3).upper()
    if hour < 1 or hour > 12 or minute < 0 or minute > 59:
        return None
    if period == "AM":
        if hour == 12:
            hour = 0
    else:
        if hour != 12:
            hour += 12
    return hour * 60 + minute


def calc_hours(clock_in: str, clock_out: str):
    """Mirrors calcHours from lib/domain/rules.ts (overnight-safe)."""
    in_min = _parse_time_to_minutes(clock_in)
    out_min = _parse_time_to_minutes(clock_out)
    if in_min is None or out_min is None:
        return None
    diff = out_min - in_min
    if diff < 0:
        diff += 1440  # wrap past midnight
    return round((diff / 60) * 100) / 100


# ---------------------------------------------------------------------------
# Name parsing — mirrors lib/excel/parser.ts
# ---------------------------------------------------------------------------


def parse_name(full_name: str):
    """Return (firstName, lastName). 'Smith, John' → ('John', 'Smith')."""
    if "," in full_name:
        parts = full_name.split(",", 1)
        return parts[1].strip(), parts[0].strip()
    return "", full_name.strip()


# ---------------------------------------------------------------------------
# usrSystemCompanyId — mirrors workbookCompanyId() in import-parity.ts
# ---------------------------------------------------------------------------


def workbook_company_id(filename: str) -> str:
    stem = os.path.basename(filename)
    if stem.lower().endswith(".xlsx"):
        stem = stem[:-5]
    return f"PARITY_{stem}"[:100]


# ---------------------------------------------------------------------------
# Build canonical rows from a fixture spec
# ---------------------------------------------------------------------------


def spec_to_rows(spec: dict) -> list:
    """
    Return canonicalized rows in the same key order and sort order as
    import-parity.ts canonicalizeRows():
      sort by (employeeCode, scheduleDate, positionName)
    """
    rows = []
    week_start = spec["week_start"]
    employees = spec["employees"]
    num_days = spec["num_days"]

    dates = [week_start + timedelta(days=i) for i in range(num_days)]

    for emp in employees:
        first_name, last_name = parse_name(emp.name)
        for di, sh in enumerate(emp.shifts):
            if sh is None:
                continue
            schedule_date = dates[di]
            hours = calc_hours(sh.clock_in, sh.clock_out)
            # Key order must match canonicalizeRows() in import-parity.ts exactly
            rows.append({
                "employeeCode": emp.code,
                "scheduleDate": schedule_date.strftime("%Y-%m-%d"),
                "positionName": emp.pos,
                "clockIn": sh.clock_in,
                "clockOut": sh.clock_out,
                "hours": f"{hours:.2f}" if hours is not None else None,
                "deptName": emp.dept,
                "firstName": first_name or None,
                "lastName": last_name or None,
                "hotelName": None,
                "tenant": None,
                "branchId": None,
                "locked": False,
            })

    # Sort mirrors canonicalizeRows sort: (employeeCode, scheduleDate, positionName)
    rows.sort(key=lambda r: (
        r["employeeCode"],
        r["scheduleDate"],
        r["positionName"] or "",
    ))
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    baselines_dir = os.path.abspath(
        os.path.join(_ROOT, "tests", "fixtures", "excel", "baselines")
    )
    os.makedirs(baselines_dir, exist_ok=True)

    print(f"Capturing Python baselines for {len(SPECS)} workbooks → {baselines_dir}")
    for spec in SPECS:
        filename = spec["filename"]
        usr_id = workbook_company_id(filename)
        rows = spec_to_rows(spec)

        baseline = {
            "workbook": filename,
            "usrSystemCompanyId": usr_id,
            "rows": rows,
        }

        out_path = os.path.join(baselines_dir, filename.replace(".xlsx", ".json"))
        with open(out_path, "w") as f:
            json.dump(baseline, f, indent=2)
            f.write("\n")

        print(f"  {filename.replace('.xlsx', '.json')} ({len(rows)} rows)")

    print(f"Done. {len(SPECS)} baselines written.")


if __name__ == "__main__":
    main()
