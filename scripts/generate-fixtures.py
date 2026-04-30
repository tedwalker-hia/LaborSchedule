"""
Generates 20 synthetic Excel (.xlsx) schedule fixtures for tests/fixtures/excel/.
Uses Python stdlib only (zipfile + xml) — no openpyxl required.

Run: python3 scripts/generate-fixtures.py

The xlsx format expected by lib/excel/parser.ts:
  Row 1: Name | Code | Dept | Position | Total | [DateHdr every 3 cols]
  Row 2: sub-headers In | Out | Hrs per date group
  Row 3+: employee rows
  Times use "H:MM AM/PM" (e.g. "8:00 AM", "4:00 PM")
"""

import zipfile
import io
import os
from typing import Optional
from datetime import date, timedelta

# ---------------------------------------------------------------------------
# xlsx XML templates
# ---------------------------------------------------------------------------

CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'

PKG_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'

WORKBOOK = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Schedule" sheetId="1" r:id="rId1"/></sheets></workbook>'

WB_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'

STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>'

MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def col_name(n: int) -> str:
    """1-based column index to Excel letter(s): 1→A, 26→Z, 27→AA."""
    s = ''
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s

def fmt_date_header(d: date) -> str:
    return f'{MONTH_ABBR[d.month - 1]} {d.day:02d}'

def xml_escape(s: str) -> str:
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

# ---------------------------------------------------------------------------
# xlsx writer
# ---------------------------------------------------------------------------

class XlsxWriter:
    def __init__(self):
        self._strings: list[str] = []
        self._str_index: dict[str, int] = {}
        # rows: list of list of (value: str|float|None, is_string: bool)
        self._rows: list[list[tuple]] = []

    def _str_idx(self, s: str) -> int:
        if s not in self._str_index:
            self._str_index[s] = len(self._strings)
            self._strings.append(s)
        return self._str_index[s]

    def add_row(self, cells: list):
        """cells: list of str | float | int | None per column (1-indexed by position)."""
        row = []
        for c in cells:
            if c is None:
                row.append((None, False))
            elif isinstance(c, str):
                row.append((self._str_idx(c), True))
            else:
                row.append((float(c), False))
        self._rows.append(row)

    def _build_sheet(self) -> str:
        parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                 '<sheetData>']
        for ri, row in enumerate(self._rows):
            row_num = ri + 1
            has_data = any(v is not None for v, _ in row)
            if not has_data:
                continue
            parts.append(f'<row r="{row_num}">')
            for ci, (val, is_str) in enumerate(row):
                if val is None:
                    continue
                col = col_name(ci + 1)
                ref = f'{col}{row_num}'
                if is_str:
                    parts.append(f'<c r="{ref}" t="s"><v>{val}</v></c>')
                else:
                    # Format numbers: omit decimal if whole
                    v_str = str(int(val)) if val == int(val) else str(val)
                    parts.append(f'<c r="{ref}"><v>{v_str}</v></c>')
            parts.append('</row>')
        parts.append('</sheetData></worksheet>')
        return ''.join(parts)

    def _build_shared_strings(self) -> str:
        count = len(self._strings)
        parts = [f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                 f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                 f'count="{count}" uniqueCount="{count}">']
        for s in self._strings:
            parts.append(f'<si><t xml:space="preserve">{xml_escape(s)}</t></si>')
        parts.append('</sst>')
        return ''.join(parts)

    def write(self, path: str):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('[Content_Types].xml', CONTENT_TYPES)
            zf.writestr('_rels/.rels', PKG_RELS)
            zf.writestr('xl/workbook.xml', WORKBOOK)
            zf.writestr('xl/_rels/workbook.xml.rels', WB_RELS)
            zf.writestr('xl/styles.xml', STYLES)
            zf.writestr('xl/worksheets/sheet1.xml', self._build_sheet())
            zf.writestr('xl/sharedStrings.xml', self._build_shared_strings())
        with open(path, 'wb') as f:
            f.write(buf.getvalue())

# ---------------------------------------------------------------------------
# Shift presets  (clockIn, clockOut, hours)
# ---------------------------------------------------------------------------

class Shift:
    def __init__(self, ci: str, co: str, hrs: float):
        self.clock_in = ci
        self.clock_out = co
        self.hours = hrs

S_STD      = Shift('8:00 AM',  '4:00 PM',  8.0)
S_MORNING  = Shift('6:00 AM',  '2:00 PM',  8.0)
S_EVENING  = Shift('2:00 PM',  '10:00 PM', 8.0)
S_OVERNIGHT= Shift('10:00 PM', '6:00 AM',  8.0)
S_PARTTIME = Shift('9:00 AM',  '1:00 PM',  4.0)
S_BRUNCH   = Shift('10:00 AM', '4:00 PM',  6.0)
S_LONG     = Shift('7:00 AM',  '7:00 PM',  12.0)
S_AUDIT    = Shift('11:00 PM', '7:00 AM',  8.0)

def weekdays(s: Shift) -> list:
    return [s, s, s, s, s, None, None]

def all_week(s: Shift) -> list:
    return [s] * 7

def rot_a(s: Shift) -> list:   # off Mon
    return [None, s, s, s, s, s, s]

def rot_b(s: Shift) -> list:   # off Mon-Tue
    return [None, None, s, s, s, s, s]

def six_day(s: Shift) -> list:  # off Sun
    return [s, s, s, s, s, s, None]

def sparse(s: Shift) -> list:   # Mon, Wed, Fri
    return [s, None, s, None, s, None, None]

def weekend_only(s: Shift) -> list:   # Fri-Sun
    return [None, None, None, None, s, s, s]

def five_days(s: Shift) -> list:
    return [s] * 5

# ---------------------------------------------------------------------------
# Employee spec
# ---------------------------------------------------------------------------

class Emp:
    def __init__(self, code: str, name: str, dept: str, pos: str, shifts: list):
        self.code = code
        self.name = name
        self.dept = dept
        self.pos = pos
        self.shifts = shifts  # list of Shift|None, len == num_days

# ---------------------------------------------------------------------------
# Fixture specs
# ---------------------------------------------------------------------------

def d(year: int, month: int, day: int) -> date:
    return date(year, month, day)

def alpha_fnb(shifts8: list) -> list:
    names = [
        ('ALPHA-001', 'Smith, John',         'F&B',          'Server'),
        ('ALPHA-002', 'Johnson, Mary',       'F&B',          'Bartender'),
        ('ALPHA-003', 'Williams, Robert',    'F&B',          'Host'),
        ('ALPHA-004', 'Brown, Patricia',     'F&B',          'Busser'),
        ('ALPHA-005', 'Jones, Michael',      'Housekeeping', 'Room Attendant'),
        ('ALPHA-006', 'Garcia, Linda',       'Housekeeping', 'Laundry'),
        ('ALPHA-007', 'Martinez, David',     'Maintenance',  'Engineer'),
        ('ALPHA-008', 'Rodriguez, Barbara',  'F&B',          'Server'),
    ]
    return [Emp(c, n, dept, pos, s) for (c, n, dept, pos), s in zip(names, shifts8)]

def beta_fd(shifts6: list) -> list:
    names = [
        ('BETA-001', 'Wilson, Richard',  'Front Desk',   'Agent'),
        ('BETA-002', 'Anderson, Maria',  'Front Desk',   'Supervisor'),
        ('BETA-003', 'Taylor, Charles',  'Concierge',    'Concierge'),
        ('BETA-004', 'Thomas, Susan',    'Front Desk',   'Agent'),
        ('BETA-005', 'Jackson, Joseph',  'Front Desk',   'Night Audit'),
        ('BETA-006', 'White, Karen',     'Housekeeping', 'Inspector'),
    ]
    return [Emp(c, n, dept, pos, s) for (c, n, dept, pos), s in zip(names, shifts6)]

SPECS = [
    # WB01
    dict(filename='wb-2026-w02-alpha-fnb.xlsx', hotel='Alpha Hotel', tenant='ALPHA-CORP',
         week_start=d(2026,1,6), num_days=7,
         employees=alpha_fnb([weekdays(S_STD), weekdays(S_STD), six_day(S_STD), weekdays(S_STD),
                               weekdays(S_MORNING), weekdays(S_MORNING), weekdays(S_STD), rot_a(S_STD)])),
    # WB02
    dict(filename='wb-2026-w03-alpha-fnb.xlsx', hotel='Alpha Hotel', tenant='ALPHA-CORP',
         week_start=d(2026,1,13), num_days=7,
         employees=alpha_fnb([weekdays(S_STD), rot_a(S_STD), all_week(S_STD), weekdays(S_STD),
                               rot_b(S_MORNING), six_day(S_MORNING), weekdays(S_STD), all_week(S_EVENING)])),
    # WB03
    dict(filename='wb-2026-w04-beta-frontdesk.xlsx', hotel='Beta Hotel', tenant='BETA-CORP',
         week_start=d(2026,1,20), num_days=7,
         employees=beta_fd([weekdays(S_STD), six_day(S_STD), all_week(S_STD), weekdays(S_STD),
                             all_week(S_AUDIT), rot_b(S_STD)])),
    # WB04
    dict(filename='wb-2026-w05-beta-frontdesk.xlsx', hotel='Beta Hotel', tenant='BETA-CORP',
         week_start=d(2026,1,27), num_days=7,
         employees=beta_fd([all_week(S_STD), weekdays(S_STD), six_day(S_STD), rot_a(S_STD),
                             all_week(S_OVERNIGHT), weekdays(S_STD)])),
    # WB05
    dict(filename='wb-2026-w06-gamma-multi.xlsx', hotel='Gamma Resort', tenant='GAMMA-RESORTS',
         week_start=d(2026,2,3), num_days=7,
         employees=[
             Emp('GAMMA-001','Thompson, Kevin',  'F&B',          'Server',         weekdays(S_STD)),
             Emp('GAMMA-002','Garcia, Nancy',    'F&B',          'Bartender',      rot_a(S_STD)),
             Emp('GAMMA-003','Martinez, Brian',  'Housekeeping', 'Room Attendant', weekdays(S_MORNING)),
             Emp('GAMMA-004','Robinson, Dorothy','F&B',          'Host',           six_day(S_STD)),
             Emp('GAMMA-005','Clark, Edward',    'Maintenance',  'Engineer',       weekdays(S_STD)),
             Emp('GAMMA-006','Rodriguez, Ashley','Housekeeping', 'Laundry',        weekdays(S_MORNING)),
             Emp('GAMMA-007','Lewis, Daniel',    'F&B',          'Server',         all_week(S_EVENING)),
             Emp('GAMMA-008','Lee, Jessica',     'F&B',          'Busser',         weekdays(S_STD)),
             Emp('GAMMA-009','Walker, Ryan',     'Maintenance',  'Engineer',       weekdays(S_STD)),
             Emp('GAMMA-010','Hall, Sarah',      'F&B',          'Bartender',      rot_b(S_EVENING)),
         ]),
    # WB06
    dict(filename='wb-2026-w07-alpha-overnight.xlsx', hotel='Alpha Hotel', tenant='ALPHA-CORP',
         week_start=d(2026,2,10), num_days=7,
         employees=[
             Emp('ALPHA-001','Smith, John',      'F&B',          'Server',         weekdays(S_STD)),
             Emp('ALPHA-002','Johnson, Mary',    'F&B',          'Bartender',      weekdays(S_EVENING)),
             Emp('ALPHA-003','Williams, Robert', 'F&B',          'Host',           all_week(S_OVERNIGHT)),
             Emp('ALPHA-005','Jones, Michael',   'Housekeeping', 'Room Attendant', weekdays(S_MORNING)),
             Emp('ALPHA-007','Martinez, David',  'Maintenance',  'Engineer',       weekdays(S_STD)),
         ]),
    # WB07
    dict(filename='wb-2026-w08-alpha-fnb.xlsx', hotel='Alpha Hotel', tenant='ALPHA-CORP',
         week_start=d(2026,2,17), num_days=7,
         employees=alpha_fnb([all_week(S_STD), weekdays(S_STD), six_day(S_BRUNCH), all_week(S_STD),
                               weekdays(S_MORNING), rot_a(S_MORNING), weekdays(S_STD), all_week(S_EVENING)])),
    # WB08
    dict(filename='wb-2026-w09-beta-housekeeping.xlsx', hotel='Beta Hotel', tenant='BETA-CORP',
         week_start=d(2026,2,24), num_days=7,
         employees=[
             Emp('BETA-006','White, Karen',    'Housekeeping','Inspector',      weekdays(S_MORNING)),
             Emp('BETA-007','Harris, Thomas',  'Housekeeping','Room Attendant', sparse(S_MORNING)),
             Emp('BETA-008','Martin, Sandra',  'Housekeeping','Room Attendant', rot_b(S_MORNING)),
             Emp('BETA-001','Wilson, Richard', 'Front Desk',  'Agent',          weekdays(S_STD)),
             Emp('BETA-002','Anderson, Maria', 'Front Desk',  'Supervisor',     weekdays(S_STD)),
             Emp('BETA-005','Jackson, Joseph', 'Front Desk',  'Night Audit',    all_week(S_AUDIT)),
             Emp('BETA-004','Thomas, Susan',   'Front Desk',  'Agent',          sparse(S_STD)),
         ]),
    # WB09
    dict(filename='wb-2026-w10-gamma-large.xlsx', hotel='Gamma Resort', tenant='GAMMA-RESORTS',
         week_start=d(2026,3,3), num_days=7,
         employees=[
             Emp('GAMMA-001','Thompson, Kevin',  'F&B',          'Server',         weekdays(S_STD)),
             Emp('GAMMA-002','Garcia, Nancy',    'F&B',          'Bartender',      all_week(S_EVENING)),
             Emp('GAMMA-003','Martinez, Brian',  'Housekeeping', 'Room Attendant', weekdays(S_MORNING)),
             Emp('GAMMA-004','Robinson, Dorothy','F&B',          'Host',           six_day(S_STD)),
             Emp('GAMMA-005','Clark, Edward',    'Maintenance',  'Engineer',       weekdays(S_STD)),
             Emp('GAMMA-006','Rodriguez, Ashley','Housekeeping', 'Laundry',        weekdays(S_MORNING)),
             Emp('GAMMA-007','Lewis, Daniel',    'F&B',          'Server',         rot_a(S_STD)),
             Emp('GAMMA-008','Lee, Jessica',     'F&B',          'Busser',         all_week(S_STD)),
             Emp('GAMMA-009','Walker, Ryan',     'Maintenance',  'Engineer',       weekdays(S_STD)),
             Emp('GAMMA-010','Hall, Sarah',      'F&B',          'Bartender',      weekend_only(S_EVENING)),
             Emp('GAMMA-011','Allen, James',     'Housekeeping', 'Inspector',      weekdays(S_MORNING)),
             Emp('GAMMA-012','Young, Emily',     'F&B',          'Server',         weekdays(S_EVENING)),
         ]),
    # WB10
    dict(filename='wb-2026-w11-alpha-parttime.xlsx', hotel='Alpha Hotel', tenant='ALPHA-CORP',
         week_start=d(2026,3,10), num_days=7,
         employees=[
             Emp('ALPHA-PT1','Evans, Carol',    'F&B',          'Server',         weekdays(S_PARTTIME)),
             Emp('ALPHA-PT2','Turner, James',   'F&B',          'Busser',         sparse(S_PARTTIME)),
             Emp('ALPHA-PT3','Phillips, Lisa',  'Housekeeping', 'Room Attendant', weekdays(S_PARTTIME)),
             Emp('ALPHA-PT4','Campbell, Mark',  'F&B',          'Host',           weekend_only(S_PARTTIME)),
         ]),
    # WB11
    dict(filename='wb-2026-w12-beta-morning.xlsx', hotel='Beta Hotel', tenant='BETA-CORP',
         week_start=d(2026,3,17), num_days=7,
         employees=beta_fd([all_week(S_MORNING), weekdays(S_MORNING), six_day(S_MORNING), rot_a(S_MORNING),
                             all_week(S_AUDIT), rot_b(S_MORNING)])),
    # WB12
    dict(filename='wb-2026-w13-gamma-evening.xlsx', hotel='Gamma Resort', tenant='GAMMA-RESORTS',
         week_start=d(2026,3,24), num_days=7,
         employees=[
             Emp('GAMMA-001','Thompson, Kevin',  'F&B',          'Server',         all_week(S_EVENING)),
             Emp('GAMMA-002','Garcia, Nancy',    'F&B',          'Bartender',      all_week(S_EVENING)),
             Emp('GAMMA-004','Robinson, Dorothy','F&B',          'Host',           weekdays(S_EVENING)),
             Emp('GAMMA-007','Lewis, Daniel',    'F&B',          'Server',         rot_a(S_EVENING)),
             Emp('GAMMA-008','Lee, Jessica',     'F&B',          'Busser',         six_day(S_EVENING)),
             Emp('GAMMA-010','Hall, Sarah',      'F&B',          'Bartender',      all_week(S_EVENING)),
             Emp('GAMMA-012','Young, Emily',     'F&B',          'Server',         weekdays(S_EVENING)),
             Emp('GAMMA-003','Martinez, Brian',  'Housekeeping', 'Room Attendant', weekdays(S_MORNING)),
             Emp('GAMMA-006','Rodriguez, Ashley','Housekeeping', 'Laundry',        rot_b(S_MORNING)),
         ]),
    # WB13 - multi-position
    dict(filename='wb-2026-w14-alpha-multipos.xlsx', hotel='Alpha Hotel', tenant='ALPHA-CORP',
         week_start=d(2026,3,31), num_days=7,
         employees=[
             Emp('ALPHA-001','Smith, John',      'F&B','Server',
                 [S_STD,S_STD,S_STD,None,None,None,None]),
             Emp('ALPHA-001','Smith, John',      'F&B','Bartender',
                 [None,None,None,S_STD,S_STD,S_STD,None]),
             Emp('ALPHA-002','Johnson, Mary',    'F&B','Bartender',     weekdays(S_STD)),
             Emp('ALPHA-003','Williams, Robert', 'F&B','Host',          six_day(S_STD)),
             Emp('ALPHA-006','Garcia, Linda',    'Housekeeping','Room Attendant',
                 [S_MORNING,S_MORNING,S_MORNING,None,None,None,None]),
             Emp('ALPHA-006','Garcia, Linda',    'Maintenance','Engineer',
                 [None,None,None,S_STD,S_STD,None,None]),
             Emp('ALPHA-007','Martinez, David',  'Maintenance','Engineer',weekdays(S_STD)),
         ]),
    # WB14 - dense
    dict(filename='wb-2026-w15-delta-dense.xlsx', hotel='Delta Inn', tenant='DELTA-HOSPITALITY',
         week_start=d(2026,4,7), num_days=7,
         employees=[
             Emp('DELTA-001','Hernandez, Christopher','F&B',          'Server',         all_week(S_STD)),
             Emp('DELTA-002','King, Amanda',           'F&B',          'Bartender',      all_week(S_EVENING)),
             Emp('DELTA-003','Wright, Matthew',        'Front Desk',   'Agent',          weekdays(S_STD)),
             Emp('DELTA-004','Lopez, Stephanie',       'Housekeeping', 'Room Attendant', weekdays(S_MORNING)),
             Emp('DELTA-005','Hill, Anthony',          'F&B',          'Host',           six_day(S_STD)),
             Emp('DELTA-006','Scott, Dorothy',         'F&B',          'Busser',         all_week(S_STD)),
             Emp('DELTA-007','Green, Mark',            'Maintenance',  'Engineer',       weekdays(S_STD)),
             Emp('DELTA-008','Adams, Rebecca',         'Front Desk',   'Supervisor',     weekdays(S_STD)),
             Emp('DELTA-009','Baker, Donald',          'F&B',          'Server',         rot_a(S_STD)),
             Emp('DELTA-010','Gonzalez, Sharon',       'Housekeeping', 'Room Attendant', rot_b(S_MORNING)),
             Emp('DELTA-011','Nelson, Joshua',         'F&B',          'Bartender',      weekend_only(S_EVENING)),
             Emp('DELTA-012','Carter, Amy',            'Front Desk',   'Agent',          all_week(S_AUDIT)),
             Emp('DELTA-013','Mitchell, Kenneth',      'Maintenance',  'Engineer',       weekdays(S_STD)),
             Emp('DELTA-014','Perez, Anna',            'F&B',          'Server',         all_week(S_EVENING)),
             Emp('DELTA-015','Roberts, Scott',         'Housekeeping', 'Inspector',      weekdays(S_MORNING)),
         ]),
    # WB15 - lean
    dict(filename='wb-2026-w16-delta-lean.xlsx', hotel='Delta Inn', tenant='DELTA-HOSPITALITY',
         week_start=d(2026,4,14), num_days=5,
         employees=[
             Emp('DELTA-003','Wright, Matthew', 'Front Desk', 'Agent',     five_days(S_STD)),
             Emp('DELTA-007','Green, Mark',     'Maintenance','Engineer',  five_days(S_STD)),
             Emp('DELTA-008','Adams, Rebecca',  'Front Desk', 'Supervisor',[S_STD,None,S_STD,None,S_STD]),
         ]),
    # WB16 - Thanksgiving
    dict(filename='wb-2025-w48-alpha-thanksgiving.xlsx', hotel='Alpha Hotel', tenant='ALPHA-CORP',
         week_start=d(2025,11,24), num_days=7,
         employees=alpha_fnb([all_week(S_STD), all_week(S_STD), all_week(S_BRUNCH), all_week(S_STD),
                               all_week(S_MORNING), rot_a(S_MORNING), weekdays(S_STD), all_week(S_LONG)])),
    # WB17
    dict(filename='wb-2025-w49-beta-frontdesk.xlsx', hotel='Beta Hotel', tenant='BETA-CORP',
         week_start=d(2025,12,1), num_days=7,
         employees=beta_fd([weekdays(S_STD), six_day(S_STD), all_week(S_STD), weekdays(S_STD),
                             all_week(S_OVERNIGHT), weekdays(S_MORNING)])),
    # WB18
    dict(filename='wb-2025-w50-gamma-multi.xlsx', hotel='Gamma Resort', tenant='GAMMA-RESORTS',
         week_start=d(2025,12,8), num_days=7,
         employees=[
             Emp('GAMMA-001','Thompson, Kevin',  'F&B',          'Server',         all_week(S_STD)),
             Emp('GAMMA-002','Garcia, Nancy',    'F&B',          'Bartender',      all_week(S_EVENING)),
             Emp('GAMMA-003','Martinez, Brian',  'Housekeeping', 'Room Attendant', weekdays(S_MORNING)),
             Emp('GAMMA-004','Robinson, Dorothy','F&B',          'Host',           six_day(S_STD)),
             Emp('GAMMA-005','Clark, Edward',    'Maintenance',  'Engineer',       weekdays(S_STD)),
             Emp('GAMMA-006','Rodriguez, Ashley','Housekeeping', 'Laundry',        weekdays(S_MORNING)),
             Emp('GAMMA-007','Lewis, Daniel',    'F&B',          'Server',         rot_a(S_STD)),
             Emp('GAMMA-008','Lee, Jessica',     'F&B',          'Busser',         weekdays(S_STD)),
             Emp('GAMMA-009','Walker, Ryan',     'Maintenance',  'Engineer',       sparse(S_STD)),
             Emp('GAMMA-010','Hall, Sarah',      'F&B',          'Bartender',      weekend_only(S_EVENING)),
         ]),
    # WB19 - holiday dense
    dict(filename='wb-2025-w52-delta-holiday.xlsx', hotel='Delta Inn', tenant='DELTA-HOSPITALITY',
         week_start=d(2025,12,22), num_days=7,
         employees=[
             Emp('DELTA-001','Hernandez, Christopher','F&B',          'Server',         all_week(S_STD)),
             Emp('DELTA-002','King, Amanda',           'F&B',          'Bartender',      all_week(S_EVENING)),
             Emp('DELTA-003','Wright, Matthew',        'Front Desk',   'Agent',          all_week(S_STD)),
             Emp('DELTA-004','Lopez, Stephanie',       'Housekeeping', 'Room Attendant', all_week(S_MORNING)),
             Emp('DELTA-005','Hill, Anthony',          'F&B',          'Host',           all_week(S_STD)),
             Emp('DELTA-006','Scott, Dorothy',         'F&B',          'Busser',         all_week(S_STD)),
             Emp('DELTA-007','Green, Mark',            'Maintenance',  'Engineer',       all_week(S_STD)),
             Emp('DELTA-008','Adams, Rebecca',         'Front Desk',   'Supervisor',     all_week(S_STD)),
             Emp('DELTA-009','Baker, Donald',          'F&B',          'Server',         all_week(S_STD)),
             Emp('DELTA-010','Gonzalez, Sharon',       'Housekeeping', 'Room Attendant', all_week(S_MORNING)),
             Emp('DELTA-011','Nelson, Joshua',         'F&B',          'Bartender',      all_week(S_EVENING)),
             Emp('DELTA-012','Carter, Amy',            'Front Desk',   'Agent',          all_week(S_AUDIT)),
         ]),
    # WB20 - year boundary
    dict(filename='wb-2025-w53-alpha-yearboundary.xlsx', hotel='Alpha Hotel', tenant='ALPHA-CORP',
         week_start=d(2025,12,29), num_days=7,
         employees=[
             Emp('ALPHA-001','Smith, John',      'F&B',          'Server',         all_week(S_STD)),
             Emp('ALPHA-002','Johnson, Mary',    'F&B',          'Bartender',      all_week(S_EVENING)),
             Emp('ALPHA-003','Williams, Robert', 'F&B',          'Host',           all_week(S_OVERNIGHT)),
             Emp('ALPHA-005','Jones, Michael',   'Housekeeping', 'Room Attendant', six_day(S_MORNING)),
             Emp('ALPHA-007','Martinez, David',  'Maintenance',  'Engineer',       weekdays(S_STD)),
         ]),
]

# ---------------------------------------------------------------------------
# Build and write each workbook
# ---------------------------------------------------------------------------

def build_workbook(spec: dict) -> XlsxWriter:
    xw = XlsxWriter()
    employees = spec['employees']
    num_days = spec['num_days']
    week_start = spec['week_start']

    # Row 1: fixed headers + date headers
    dates = [week_start + timedelta(days=i) for i in range(num_days)]
    row1: list = ['Name', 'Code', 'Dept', 'Position', 'Total']
    for dt in dates:
        row1.append(fmt_date_header(dt))
        row1.append(None)
        row1.append(None)
    xw.add_row(row1)

    # Row 2: sub-headers
    row2: list = [None, None, None, None, None]
    for _ in dates:
        row2.extend(['In', 'Out', 'Hrs'])
    xw.add_row(row2)

    # Employee rows
    for emp in employees:
        total = sum(sh.hours for sh in emp.shifts if sh is not None)
        row: list = [emp.name, emp.code, emp.dept, emp.pos, total if total > 0 else None]
        for sh in emp.shifts:
            if sh:
                row.extend([sh.clock_in, sh.clock_out, sh.hours])
            else:
                row.extend([None, None, None])
        xw.add_row(row)

    return xw


def main():
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'excel')
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(os.path.join(out_dir, 'baselines'), exist_ok=True)

    print(f'Generating {len(SPECS)} fixture workbooks → {os.path.abspath(out_dir)}')
    for spec in SPECS:
        xw = build_workbook(spec)
        path = os.path.join(out_dir, spec['filename'])
        xw.write(path)
        n_emp = len(spec['employees'])
        n_days = spec['num_days']
        print(f"  written: {spec['filename']} ({n_emp} employees, {n_days} days)")
    print('Done.')


if __name__ == '__main__':
    main()
