# User Flows

Typical end-to-end flows through the Labor Schedule app. Diagrams use Mermaid.

## Roles

`SuperAdmin` → `CompanyAdmin` → `HotelAdmin` → `DeptAdmin`. Scope narrows down the chain (tenants → hotels → departments). Enforced in `lib/auth/rbac.ts` and per-route checks.

---

## 1. Authentication

Public routes: `/login`, `/change-password`, `/api/health`. Everything else gated by `middleware.ts` (verifies JWT in `auth-token` cookie, rotates on each request, issues `csrf_token` on GETs).

```mermaid
flowchart TD
    Start([User hits any URL]) --> MW{middleware.ts<br/>auth-token valid?}
    MW -- no --> Login["/login page"]
    MW -- yes --> Target[requested page]

    Login --> Submit[Submit email + password]
    Submit --> APILogin[POST /api/auth/login]
    APILogin --> Check{credentials OK?}
    Check -- no --> LoginErr[show error<br/>rate-limit by IP+email]
    LoginErr --> Login
    Check -- yes --> SetCookie[set auth-token cookie<br/>return user + mustChangePassword]
    SetCookie --> MustChange{mustChangePassword?}
    MustChange -- yes --> CP["/change-password"]
    MustChange -- no --> Schedule["/schedule"]
    CP --> CPSubmit[POST /api/auth/change-password]
    CPSubmit --> Schedule

    Target -.logout.-> Logout[POST /api/auth/logout]
    Logout --> ClearCookies[clear auth-token, auth-exp, csrf_token]
    ClearCookies --> Login
```

---

## 2. Navigation Map

```mermaid
flowchart LR
    Root["/"] --> Schedule["/schedule"]
    Login["/login"] --> Schedule
    Login --> CP["/change-password"]
    CP --> Schedule

    subgraph protected["(app) layout — AuthProvider + ThemeProvider + SelectedHotelProvider"]
      Schedule
      Users["/users"]
    end

    Schedule <-->|TopNavigation| Users
    Schedule -.->|logout| Login
    Users -.->|logout| Login
```

---

## 3. Schedule Editor — Main Flow

Page: `app/(app)/schedule/page.tsx`. State hook: `useScheduleState()`. Grid: `ScheduleGrid.tsx`. Buttons: `ActionBar.tsx`.

```mermaid
stateDiagram-v2
    [*] --> SelectFilters
    SelectFilters: Pick tenant, hotel, dates, optional dept/position
    SelectFilters --> Loading: GET /api/schedule
    Loading --> Viewing: data returned
    Loading --> Error: 4xx/5xx
    Error --> SelectFilters

    Viewing --> Editing: edit cell (recordChange)
    Editing --> Editing: more edits
    Editing --> Saving: click Save
    Editing --> Viewing: click Discard
    Saving --> Viewing: POST /api/schedule/save OK
    Saving --> Editing: save failed

    Viewing --> ModalOpen: click action button
    ModalOpen --> Viewing: cancel
    ModalOpen --> Loading: complete (reload schedule)

    Viewing --> Exporting: click Export
    Exporting --> Viewing: XLSX downloaded
```

### Load + Save sequence

```mermaid
sequenceDiagram
    actor U as User
    participant P as SchedulePage
    participant H as useScheduleState
    participant API as /api/schedule
    participant Svc as schedule-service
    participant DB as Prisma/DB

    U->>P: pick tenant/hotel/date range
    P->>H: setFilters(...)
    H->>API: GET /api/schedule?tenant=&hotel=&branchId=&usrSystemCompanyId=&department=&position=&startDate=&endDate=
    API->>Svc: fetchScheduleData(filters, permissions)
    Svc->>DB: query employees + entries
    DB-->>Svc: rows
    Svc-->>API: ScheduleData
    API-->>H: employees[], dates[], schedule{}
    H-->>P: render grid

    U->>P: edit cells
    P->>H: recordChange(empCode, date, field, value)
    U->>P: click Save
    P->>API: POST /api/schedule/save { tenant, hotel, branchId, usrSystemCompanyId, changes[] }
    API->>Svc: save(body, auditCtx)
    Svc->>DB: upsert + audit log
    DB-->>Svc: ok
    Svc-->>API: 200
    API-->>P: success → reload
```

---

## 4. ActionBar Modals

Each `ActionBar` button opens a wizard or form modal. On success the schedule reloads.

```mermaid
flowchart TD
    AB[ActionBar] --> Gen[Generate Schedule]
    AB --> Clr[Clear Schedule]
    AB --> Add[Add Record]
    AB --> Del[Delete]
    AB --> Imp[Import]
    AB --> Exp[Export]
    AB --> Ref[Refresh Employees]
    AB --> Seed[Seed from Payroll]
    AB --> Save[Save / Discard]

    Gen --> GenAPI[POST /api/schedule/generate]
    Clr --> ClrAPI[POST /api/schedule/clear]
    Add --> AddAPI[POST /api/schedule/add]
    Del --> DelAPI[POST /api/schedule/delete]
    Imp --> ImpPrev[POST /api/schedule/import/preview]
    ImpPrev --> ImpAPI[POST /api/schedule/import]
    Exp --> ExpAPI[GET /api/schedule/export → XLSX]
    Ref --> RefAPI[POST /api/employees/refresh]
    Seed --> SeedAPI[POST /api/payroll/seed]
    Save --> SaveAPI[POST /api/schedule/save]

    GenAPI --> Reload[reload schedule]
    ClrAPI --> Reload
    AddAPI --> Reload
    DelAPI --> Reload
    ImpAPI --> Reload
    RefAPI --> Reload
    SeedAPI --> Reload
    SaveAPI --> Reload
```

### Import wizard

```mermaid
sequenceDiagram
    actor U
    participant M as ImportModal
    participant API as /api/schedule/import
    participant Svc as schedule-service

    U->>M: upload XLSX
    M->>API: POST /preview (file)
    API->>Svc: parse + validate
    Svc-->>API: preview rows + warnings
    API-->>M: preview
    U->>M: confirm overwriteLocked?
    M->>API: POST /import (file, overwriteLocked)
    API->>Svc: applyImport(records, auditCtx)
    Svc-->>API: result
    API-->>M: success / errors
    M->>M: show result step
```

### Generate wizard

```mermaid
flowchart LR
    S1[Step 1<br/>date range +<br/>overwrite locked toggle] --> S2[Step 2<br/>pick employees<br/>useEmployees hook]
    S2 --> S3[Step 3<br/>confirm]
    S3 --> POST[POST /api/schedule/generate]
    POST --> S4[Step 4<br/>result]
    S4 --> Reload[reload schedule]
```

---

## 5. Export

Hook: `lib/hooks/useScheduleExport.ts`. Writer: `lib/excel/writer.ts`.

```mermaid
sequenceDiagram
    actor U
    participant AB as ActionBar
    participant Hook as useScheduleExport
    participant API as /api/schedule/export
    participant Svc as export-service
    participant XL as excel/writer

    U->>AB: click Export
    AB->>Hook: exportScheduleToExcel(filters)
    Hook->>API: GET /api/schedule/export?hotel=&...
    API->>Svc: buildExport(filters, permissions)
    Svc->>XL: write workbook
    XL-->>Svc: buffer
    Svc-->>API: XLSX blob
    API-->>Hook: file
    Hook-->>U: download Schedule_[hotel]_[start]_[end].xlsx
```

---

## 6. User Management

Page: `app/(app)/users/page.tsx`. SuperAdmin sees all; lower roles scoped.

```mermaid
flowchart TD
    UP["/users"] --> Fetch[GET /api/users]
    Fetch --> Table[UserTable]
    Table --> AddBtn[+ Add User]
    Table --> Row[click row]
    Table --> DelBtn[delete icon]

    AddBtn --> Modal[UserModal — empty]
    Row --> ModalE[UserModal — prefilled]

    Modal --> Create[POST /api/users]
    ModalE --> Update[PUT /api/users/:id]
    DelBtn --> Confirm{confirm?}
    Confirm -- yes --> Deact[DELETE /api/users/:id<br/>isActive=false]
    Confirm -- no --> Table

    Create --> Refetch[refetchUsers]
    Update --> Refetch
    Deact --> Refetch
    Refetch --> Table
```

### Role-scoped create

```mermaid
sequenceDiagram
    actor Admin
    participant M as UserModal
    participant API as /api/users
    participant RBAC as rbac.ts
    participant DB

    Admin->>M: fill form + assign tenants/hotels/depts
    M->>API: POST { firstName, lastName, email, role, tenants[], hotels[], departments[] }
    API->>RBAC: canManageUser(targetRole)
    alt allowed
      RBAC-->>API: ok
      API->>DB: insert user + scope rows
      DB-->>API: user
      API-->>M: 201
    else denied
      RBAC-->>API: deny
      API-->>M: 403
    end
```

---

## 7. Permission Enforcement

```mermaid
flowchart TD
    Req[API request] --> MW[middleware.ts<br/>verify JWT, set x-user-role]
    MW --> Handler[route handler]
    Handler --> RBAC[getUserPermissions userId]
    RBAC --> Check{action allowed<br/>for scope?}
    Check -- no --> Deny[403]
    Check -- yes --> Scope[filter query<br/>by accessible tenants/hotels/depts]
    Scope --> DB[(Prisma)]
    DB --> Resp[response]
    Handler -.write op.-> Audit[(audit log<br/>userId + source)]
```

`PermissionChecker` methods:
- `isSuperAdmin()`
- `getAccessibleTenants() / Hotels() / Depts()` → `{unlimited, allowed[]}`
- `hasScheduleAccess(hotel, dept?)`
- `canManageUser(role)`

---

## 8. Component Tree (reference)

```mermaid
flowchart TD
    RL[RootLayout] --> Pub[/login, /change-password/]
    RL --> AppL["(app) layout<br/>Auth + Theme + SelectedHotel"]
    AppL --> Top[TopNavigation]
    AppL --> Sch[SchedulePage]
    AppL --> Usr[UsersPage]

    Sch --> FB[FilterBar]
    Sch --> AB[ActionBar]
    Sch --> SG[ScheduleGrid]
    Sch --> Mods[Modals: Generate / Clear / Import /<br/>Add / Delete / Refresh / Seed]

    Usr --> UT[UserTable]
    Usr --> UM[UserModal]
```
