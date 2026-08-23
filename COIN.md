# COIN — Client Onboard Information Form

## Purpose

COIN gives a farrier a secure link to send to a new horse owner. The owner completes their contact, property, access, and horse information without needing a FarrierOS membership. Submitting the form creates a reviewable intake inside the sending farrier's workspace, reducing duplicate entry and onboarding calls.

## Farrier Flow

1. Open Clients and choose **Create COIN Link**.
2. Set an expiration date and optionally prefill the owner's name or phone number.
3. Copy the link or open a prefilled text message.
4. Track link state: Draft, Sent, Opened, Submitted, Imported, Expired, or Revoked.
5. Review the submission for duplicates and accuracy.
6. Approve it to create or update the client, barn/property, horses, and onboarding notes.

Submission must never silently overwrite an existing record. The farrier remains the final reviewer.

## Owner Form

- Owner name, phone, email, and preferred contact method
- Billing/mailing address if needed
- Barn or property name and service address
- Barn manager contact
- Gate, parking, access, and appointment instructions
- Messaging consent and consent timestamp
- One or more horses: name, breed, color, age, temperament, safety notes, service interval, current hoof-care summary, and optional photos/documents
- Accuracy confirmation and privacy acknowledgment

The owner can add multiple horses in one submission. Shoe setup and verified farrier records are not owner-editable.

## Hosted Architecture

Each link contains a long, random, single-purpose token tied to one farrier workspace. The database stores only a hash of the token. Links expire, can be revoked, are rate-limited, and reveal no existing client records. Files upload to a quarantine area until the farrier approves the submission.

The hosted backend validates and stores the submission, then notifies the correct farrier. Account-level row security prevents other farriers from reading it. Imported submissions retain their source, submission time, review time, and reviewer.

## Prototype Boundary

COIN cannot safely auto-update the current local-only app because a public owner link needs hosting, a secure database, token validation, file storage, and a farrier account to receive it. It belongs in the upcoming hosting/accounts/cloud-records milestone and should be included in the first private beta.
