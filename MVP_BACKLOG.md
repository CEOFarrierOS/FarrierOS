# FarrierOS MVP Backlog

## Prototype 0

- Create local-first React PWA shell.
- Seed realistic sample data.
- Build Today, Calendar, Clients and Barns, Horses, Prep Tomorrow, and Finish Job screens.
- Support required Fluffy workflow.
- Store updates in local storage.
- Save a verified setup.
- Mock route, notification, and owner summary behavior.
- Make UI responsive for desktop and mobile browsers.

## MVP Must-Haves

- Offline app shell.
- Local data persistence.
- Horse profile with four-foot records.
- Verified setup history.
- Service records.
- Appointment list and route order.
- Prep Tomorrow workflow.
- Finish Job workflow.
- Barn access information.
- Due-date calculation from service interval.
- Large field-friendly controls.

## MVP Should-Haves

- IndexedDB storage.
- Installable PWA manifest and service worker.
- Better photo placeholder management.
- Search and filter across horses.
- Calendar rescheduling with recurring interval handling.
- Exportable owner summary draft.
- More complete sample dataset.

## MVP Could-Haves

- Voice-note recording placeholder UI.
- Offline status indicator.
- Mock team sharing panel for apprentice/business-partner schedule pings.
- Data import/export JSON.
- Print-friendly prep sheet.
- Basic revenue and unpaid invoice placeholders without payment processing.

## Not In MVP

- Real cloud sync.
- Real SMS.
- Client portal.
- Vet portal.
- AI diagnosis.
- Route optimization.
- Payments.
- Hardware integration.
- Hoof outline capture.
- Shoe-shape files.

## Acceptance Tests

- User can complete Today -> Fluffy -> Horse Profile -> RF Foot History -> Prep Tomorrow -> Finish Job -> Save Verified Setup.
- User can refresh the browser and keep saved local changes.
- User can view app on desktop and mobile width without broken layout.
- Common actions use large tap targets.
- Prep Tomorrow shows prior verified setup and visual placeholders.
- Finish Job calculates the next due date.
