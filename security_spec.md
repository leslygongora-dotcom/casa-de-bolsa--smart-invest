# Security Specification — Smart Invest Firestore Rules

## 1. Data Invariants
1. **Strict Ownership**: A document at `/investorProfiles/{userId}` can only be read, created, or updated by the verified authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **No Public / Blanket Listing**: Listing `/investorProfiles` is strictly denied (`allow list: if false;`) to prevent cross-user enumeration.
3. **Strict Schema & Bounds**:
   - `answers` MUST be a list of exact length `8` with integer elements in `1..4`.
   - `safetyNotes` MUST be a list of `<= 6` strings.
   - `riskProfileKey` and `initialProfileKey` MUST be one of `['conservador', 'moderado', 'crecimiento', 'agresivo']`.
   - `issWeights` MUST contain only `v, c, b, d, s` numbers in `[0, 1]`.
   - `tastingSnapshot` MUST contain only bounded keys (`initialCapitalMxn`, `currency`, `firstSavedVersion`).
4. **Temporal & Identity Immutability**:
   - `uid` and `createdAt` cannot change on update.
   - `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
5. **No Ghost Fields**: `keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` on update block arbitrary shadow properties.

## 2. The "Dirty Dozen" Adversarial Payloads
1. Unauthenticated read/create on `/investorProfiles/user123` -> `PERMISSION_DENIED`.
2. Authenticated user `userA` reading `/investorProfiles/userB` -> `PERMISSION_DENIED`.
3. Authenticated user `userA` listing `/investorProfiles` -> `PERMISSION_DENIED`.
4. Unverified email (`email_verified: false`) writing `/investorProfiles/userA` -> `PERMISSION_DENIED`.
5. Identity spoofing (`userId = "userA"`, payload `uid: "userB"`) -> `PERMISSION_DENIED`.
6. Shadow/Ghost field injection (`isAdmin: true`) on create -> `PERMISSION_DENIED`.
7. Shadow/Ghost field injection (`isAdmin: true`) on update -> `PERMISSION_DENIED`.
8. Forged client `createdAt` timestamp not equal to `request.time` -> `PERMISSION_DENIED`.
9. Mutating immutable `uid` or `createdAt` during update -> `PERMISSION_DENIED`.
10. Array overflow (`answers` length 9 or `safetyNotes` length 20) -> `PERMISSION_DENIED`.
11. Invalid `riskProfileKey: "super_admin"` outside enum allowlist -> `PERMISSION_DENIED`.
12. Path ID poisoning (`userId` > 128 chars or containing invalid symbols) -> `PERMISSION_DENIED`.
