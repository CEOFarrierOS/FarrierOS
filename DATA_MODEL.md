# FarrierOS Data Model

## Storage Strategy

Prototype 0 uses browser local storage with a seeded sample dataset. The model should be shaped so it can later move to IndexedDB and, eventually, optional encrypted cloud sync without changing the product language.

## Entity Overview

### FarrierBusinessProfile

- id
- businessName
- farrierName
- phone
- email
- baseLocation
- defaultServiceIntervalWeeks
- preferences

### Client

- id
- name
- phone
- email
- notes
- horseIds
- barnIds

### BarnProperty

- id
- name
- clientIds
- address
- latitude
- longitude
- gateCode
- parkingNotes
- barnManagerName
- barnManagerPhone
- accessInstructions
- horseIds

### Location

- id
- label
- address
- latitude
- longitude
- source: manual | browser | map_pin
- notes

### Horse

- id
- name
- ownerClientId
- barnPropertyId
- temperament
- safetyNotes
- serviceIntervalWeeks
- customServiceIntervalDays
- lastServiceDate
- nextDueDate
- footRecordIds
- verifiedSetupId
- notes
- photoDocumentIds

### FootRecord

- id
- horseId
- foot: LF | RF | LH | RH
- currentSetupId
- historySetupIds
- trimmedPhotoIds
- finishedShoePhotoIds
- notes

### ShoeSetup

- id
- horseId
- foot
- serviceRecordId
- shoeBrand
- shoeModel
- shoeSize
- clips
- pads
- wedges
- borium
- modifications
- fitNotes
- verified
- verifiedAt
- changedThisCycle

### ServiceRecord

- id
- horseId
- appointmentId
- serviceDate
- serviceType: trim | fronts | hinds | full_set | therapeutic
- footSetupIds
- writtenNotes
- voiceNotePlaceholderIds
- photoDocumentIds
- verifiedSetup
- nextDueDate
- ownerSummaryPreview
- createdAt
- updatedAt

### Appointment

- id
- date
- startTime
- endTime
- barnPropertyId
- clientId
- horseIds
- status: scheduled | en_route | in_progress | complete | cancelled
- routeOrder
- notes
- recurringIntervalWeeks

### PhotoDocument

- id
- horseId
- foot
- serviceRecordId
- type: trimmed_foot | finished_shoe | xray | document | general
- title
- placeholderColor
- capturedAt
- notes
- localUri

### Note

- id
- horseId
- foot
- clientId
- barnPropertyId
- serviceRecordId
- body
- kind: safety | fit | cycle_change | access | general
- createdAt

### ClientOnboardingSubmission (COIN)

- id
- workspaceId
- tokenHash
- status: draft | sent | opened | submitted | imported | expired | revoked
- expiresAt
- ownerContact
- propertyAndAccess
- horseIntakes
- messagingConsent
- submittedAt
- reviewedAt
- reviewedBy
- importedRecordIds

## Prototype Sample Data

Must include:

- Client: Sarah Morgan
- Barn: Willow Creek Ranch
- Horse: Fluffy
- Four complete foot records
- Prior full-set shoeing record
- Several notes and photo placeholders
- Future appointment

## Future Data Design Considerations

- Records need stable IDs for sync.
- Service records should be append-only where practical.
- Verified setups should preserve history rather than overwrite old work.
- Photo/document records should be metadata-first so real file handling can come later.
- Sharing permissions must be farrier-controlled.
- Hardware and shoe-shape files should attach to verified setup records, not generic notes.
