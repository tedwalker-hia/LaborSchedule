# RBAC

Role-based access control for the labor-schedule app. Defines roles, scope assignments, and the permission-check API enforced in route handlers.

Source: `lib/auth/rbac.ts`. Tests: `tests/unit/rbac/matrix.test.ts`.

---

## Roles

Four-tier hierarchy (highest → lowest privilege):

| Role | Hotelier mapping | Privilege rank |
|------|------------------|----------------|
| `SuperAdmin` | Platform operator | 4 |
| `CompanyAdmin` | Group / portfolio operator | 3 |
| `HotelAdmin` | General Manager (single property) **or** Regional/Area Manager (multi-property via multiple hotel rows) | 2 |
| `DeptAdmin` | Department head (Front Office, Housekeeping, F&B, etc.) | 1 |

`SuperAdmin` short-circuits every check — no scope rows required.

`HotelAdmin` is the same role whether assigned to one hotel or many. Multi-property managers are modeled by multiple `UserHotel` rows, not a distinct role.

---

## Scope assignments

A user's scope lives in three join tables (Prisma model → SQL table):

- `UserTenant` (`HIALaborSchedulesUserTenants`) — tenant-wide access.
- `UserHotel` (`HIALaborSchedulesUserHotels`) — single hotel under a tenant.
- `UserDept` (`HIALaborSchedulesUserDepts`) — single department within a hotel.

Each row carries denormalized `tenant` so scope checks do not need to resolve hotel → tenant from another table.

Typical assignments by role:

| Role | Expected rows |
|------|---------------|
| `SuperAdmin` | None. |
| `CompanyAdmin` | One or more `UserTenant` rows. May also have `UserHotel` rows for hotels outside their tenant scope. |
| `HotelAdmin` | One or more `UserHotel` rows. No `UserTenant` rows (cannot grant tenant-level scope). |
| `DeptAdmin` | One or more `UserDept` rows. |

Roles are not strictly enforced against assignment shape at the schema level — `canManageUser` enforces that admins do not grant scope they do not themselves hold.

### CompanyAdmin scope asymmetry

A CompanyAdmin with `UserHotel` rows in tenant-X but no `UserTenant` row for tenant-X is in a hybrid state:

- **Schedule access**: granted to that hotel via the direct-hotel branch in `hasScheduleAccess`.
- **User management**: NOT granted at tenant-X level — `canManageUser` only counts `UserTenant` rows.
- **User-list visibility**: tenant-X users do not appear — `getManagedTenants` does not include tenant-X.

This is intentional: schedule access tracks "where can this user operate" while user management tracks "where are they authoritative." If a CompanyAdmin needs to administer cross-tenant hotels, model them as a HotelAdmin for those hotels (separate user) or extend the scope schema.

---

## Permission API — `PermissionChecker`

Construct via `getUserPermissions(userId)`. The checker loads the user's role and all three scope tables once.

### `isSuperAdmin(): boolean`
Identity check. Other checker methods short-circuit when true, but routes still call this directly when the unscoped path differs structurally from the scoped path — e.g. returning the global tenant/hotel list, or skipping a scope-intersection helper. Used in `app/api/tenants`, `app/api/hotels/[tenant]`, `app/api/users`, `app/api/users/[id]`.

### `canManageRole(targetRole): boolean`
Strict hierarchy compare — `actor.rank > target.rank`. Currently unused at runtime; kept as a primitive for future role-only checks. `canManageUser` enforces a different rule (allows HA→HA and DA→DA peer management) so it does not call this.

### `canManageUser(targetRole, targetScope): boolean`
Authoritative gate for create / edit / delete of users. Two checks:

1. **Role gate.** Actor must be allowed to manage that role (peers permitted: HA→HA, DA→DA; CA cannot manage another CA).
2. **Scope subset.** Target's tenants/hotels/departments must all sit inside the actor's own scope:
   - `CompanyAdmin`: every target tenant — direct, plus the `tenant` column on each target hotel/dept — must appear in the actor's `UserTenant` rows.
   - `HotelAdmin`: target's `tenants` array must be empty (HA cannot grant tenant scope). Target hotels and dept-hotels must appear in the actor's `UserHotel` rows.
   - `DeptAdmin`: target's `tenants` and `hotels` must be empty. Target departments must each match a row in the actor's `UserDept`.

`SuperAdmin` bypasses both checks.

### `hasScheduleAccess({ hotel?, tenant?, dept? }): boolean`
Authoritative gate for schedule data routes.

- No `hotel` provided → allow if the user has any active scope row. Used by routes that operate across the user's full scope (lock, clear, delete, employee placement update).
- `hotel` provided:
  - `CompanyAdmin`: allow if the hotel is directly assigned **or** the supplied `tenant` is in the actor's `UserTenant` rows. Tenant must be passed in by the caller — there is no cross-table lookup. Routes whose body schemas include `tenant` (`schedule/save|add|generate`, `employees/refresh|refresh-preview`, `payroll/seed`) pass it through. Form/query-param routes (`schedule/import`, `schedule/import/preview`, `schedule/export`) read `tenant` from the request.
  - `HotelAdmin`: allow if the hotel is in the actor's `UserHotel` rows.
  - `DeptAdmin`: requires `dept`; allow only if the `(hotel, dept)` pair matches a `UserDept` row.

### `getAccessibleTenants(): TenantScope`
Display helper. Returns the union of tenants across `UserTenant + UserHotel + UserDept`. Use for dropdowns and visibility filters where "any presence in tenant X" is the right semantic. **Do not** use for write-scope decisions — see `getManagedTenants`.

### `getManagedTenants(): TenantScope`
Strict — only direct `UserTenant` rows. Use when deciding what tenants the user is authoritative over (user-list filtering for `CompanyAdmin`, future tenant-level mutations). A user with hotels in tenant-X but no `UserTenant` row for tenant-X is **not** considered to manage tenant-X.

### `getAccessibleHotels(): HotelScope`
Returns the user's `UserHotel` rows verbatim (`tenant`, `hotelName`, `usrSystemCompanyId`, `branchId`). `unlimited: true` for `SuperAdmin`.

### `getAccessibleDepts(): DeptScope`
Returns the user's `UserDept` rows projected to `{ hotelName, deptName }` — the `tenant` column is dropped. `unlimited: true` for `SuperAdmin`.

---

## Route enforcement pattern

Every protected route follows the same shape:

```ts
const user = getCurrentUser(request);
if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

const perms = await getUserPermissions(user.userId);
if (!perms || !perms.hasScheduleAccess({ hotel, tenant, dept })) {
  return NextResponse.json({ error: 'forbidden', missingScope: { hotel } }, { status: 403 });
}
```

User-management routes pass the parsed body or the existing user record into `canManageUser`:

```ts
if (!perms.canManageUser(role, { tenants, hotels, departments })) { ... 403 ... }
```

`getCurrentUser` reads the `x-user-id` / `x-user-role` / `x-user-email` headers set by middleware after JWT verification. `getUserPermissions` re-loads the user from the DB on every request — assignment changes take effect on the next request, no token refresh needed.

---

## User-list scoping (`GET /api/users`)

Built off the actor's scope:

- `SuperAdmin` → `{ type: 'all' }`.
- `CompanyAdmin` → `{ type: 'byTenants', tenants: getManagedTenants().allowed }`. CA only sees users in tenants they directly manage. Hotels assigned outside those tenants do not widen the user list (use a separate hotel-scope flow if cross-tenant hotel admins are needed).
- `HotelAdmin` → `{ type: 'byHotels', hotels: [own hotel names] }`.
- `DeptAdmin` → `{ type: 'byDepts', departments: [own (hotel, dept) pairs] }`.

`canCurrentUserSeeTarget` (single-user GET) uses union semantics — it allows visibility if the target shares any scope tuple with the actor. Read access is deliberately broader than write access.

---

## Adding a new permission check

1. If the check is per-row (e.g. "can edit this schedule row"), add a method to `PermissionChecker` that takes the row's identifying fields. Keep checks explicit — do not rely on scope-resolution helpers.
2. Pass any required context (tenant, hotel, dept) into the method. Do **not** look it up from the DB inside the checker — callers already have the data and a DB hop adds latency to every request.
3. Add a matrix test in `tests/unit/rbac/matrix.test.ts` covering each role × in-scope / out-of-scope.
4. If the check feeds a route, follow the existing pattern: 401 if `getCurrentUser` returns null, 403 if the checker denies, otherwise proceed.

---

## Parity script

`scripts/rbac-parity.ts` re-implements `hasScheduleAccess` and diffs computed scope tuples against the legacy Flask backend. Keep this in sync with `lib/auth/rbac.ts` when changing scope semantics — drift here means false positives or missed regressions in parity runs.
