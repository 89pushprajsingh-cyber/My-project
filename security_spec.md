# Security Specification & Threat Model

## Data Invariants

1. **Identity Integrity**: Users can only read or write their own `/users/{userId}` document and `/providers/{providerId}/private/kyc` document.
2. **PII Isolation**: Raw 12-digit Aadhaar numbers and KYC documents live strictly in `/providers/{providerId}/private/kyc` and are never exposed in public `/services/{providerId}` documents.
3. **Atomicity Guarantee**: A `/services/{providerId}` document can only be created with `aadhaarVerified == true` when `/providers/{providerId}/private/kyc` exists or is created in the same atomic batch (`existsAfter`).
4. **Chat Participant Isolation**: Only `seekerId` or `providerId` on a `/chats/{chatId}` thread can read or list that thread, send messages, or list messages inside `/chats/{chatId}/messages`.
5. **Appointment State Integrity**: Appointments start in `pending`, must reference an existing `/services/{providerId}` and `/chats/{chatId}`, and cannot be modified once reaching a terminal state (`declined`, `cancelled`, `completed`).
6. **Review Authenticity & Atomic Rating Integrity**: Reviews under `/services/{providerId}/reviews/{reviewId}` are keyed by a verified completed appointment or paid bill ID belonging to the submitting seeker and target provider, and must atomically increment `ratingSum` and `ratingCount` on `/services/{providerId}` in the same batch.
7. **Billing & Receipt Integrity**: Bills under `/bills/{billId}` reference an existing `/services/{providerId}`, isolate read/list access strictly to `seekerId` or `providerId`, lock line items and totals against tampering after creation, and lock terminal `paymentStatus == 'paid'` receipts against modification.
8. **Temporal Integrity**: All `createdAt`, `updatedAt`, `verifiedAt`, `paidAt`, and `lastMessageAt` timestamps must equal `request.time`.

## Dirty Dozen Adversarial Payloads

1. **Spoofed User UID on Profile Create**: `{ uid: "other_user", displayName: "Attacker", email: "a@b.com", role: "seeker" }` -> `PERMISSION_DENIED`
2. **Oversized Display Name**: `{ uid: "<auth_uid>", displayName: "<1000 chars>", ... }` -> `PERMISSION_DENIED`
3. **Unverified Service Without Aadhaar KYC**: Creating `/services/{uid}` without `/providers/{uid}/private/kyc` -> `PERMISSION_DENIED`
4. **Invalid Aadhaar Format**: Creating `/providers/{uid}/private/kyc` with `aadhaarNumber: "12345"` -> `PERMISSION_DENIED`
5. **Shadow Ghost Field Injection on Service**: Creating `/services/{uid}` with extra field `featuredRank: 999` -> `PERMISSION_DENIED`
6. **Reading Another Provider's Private KYC**: `get(/providers/otherUid/private/kyc)` -> `PERMISSION_DENIED`
7. **Unauthorized Image Scheme (`javascript:` / `data:`)**: Creating `/services/{uid}` with `photoUrls: ["javascript:alert(1)"]` -> `PERMISSION_DENIED`
8. **Blanket List Query on Chats**: Listing `/chats` without participant filter -> `PERMISSION_DENIED`
9. **Spoofed Sender in Chat Message**: Creating `/chats/{chatId}/messages/{id}` with `senderId: "victimUid"` -> `PERMISSION_DENIED`
10. **Non-Participant Chat Injection**: Posting message to a chat where `request.auth.uid` is neither `seekerId` nor `providerId` -> `PERMISSION_DENIED`
11. **Appointment Status Bypass on Create**: Creating `/appointments/{id}` with `status: "confirmed"` -> `PERMISSION_DENIED`
12. **Terminal Appointment Tampering**: Updating an appointment whose existing status is `"cancelled"` or `"completed"` -> `PERMISSION_DENIED`
13. **Paid Bill Amount Tampering**: Updating `totalAmount` on an existing `/bills/{billId}` or updating a bill whose `paymentStatus` is already `"paid"` -> `PERMISSION_DENIED`
14. **Counter Bill Confirmation Spoofing**: Seeker attempting to mark a `counter` payment bill as `"paid"` without switching to `in_app` payment -> `PERMISSION_DENIED`
