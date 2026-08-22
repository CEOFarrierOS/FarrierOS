# FarrierOS Product Plan

## Product Thesis

FarrierOS is a local-first business operating system for working farriers. Its core value is not scheduling, invoicing, or generic customer management. Its core value is helping a farrier open tomorrow's route, see each horse's last verified shoeing setup and visual foot history, and pre-shape shoes before arriving at the barn.

The product should feel like a reliable field tool: fast, simple, tough, offline-capable, and usable with one hand or dirty hands.

## Primary User

Independent professional farriers and small farrier practices who manage recurring horse care across barns, private properties, and routes.

## Product Principles

- Field-first: common work must be possible in the truck, at the anvil, or beside the horse.
- Offline-first: the app must remain useful without service.
- Minimal typing: favor taps, presets, defaults, voice-note placeholders, and reusable setup history.
- Horse-centered: scheduling and business records exist to support the horse's hoof-care history.
- Verified setup is sacred: each horse should have a trusted latest setup that can be used for future prep.
- Fast job closeout: finishing a job should take less than a minute when nothing unusual changed.
- No corporate CRM feel: avoid dense dashboards, sales language, pipeline concepts, and clutter.

## MVP Product Shape

FarrierOS MVP is a responsive Progressive Web App for desktop and mobile browsers. It stores realistic sample data locally and supports the key farrier workflow:

Today -> Horse -> Foot History -> Prep Tomorrow -> Finish Job -> Save Verified Setup

## Core Records

- Farrier business profile
- Client portfolio
- Barn/property portfolio
- Locations
- Horse profiles
- Four-foot records: LF, RF, LH, RH
- Shoe setup history
- Service records
- Appointments
- Photos, documents, and X-ray placeholders
- Notes
- Scheduling intervals

## MVP Sections

### Today

Shows today's appointments, barn/location, horse list, route order, and fast actions: Start Job, Navigate, On My Way, and Mark Complete.

### Calendar

Shows day, week, and month views with recurring 4-8 week schedules, due and overdue horses, and simple rescheduling.

### Clients and Barns

Manages clients, barns/properties, horse assignments, access instructions, gate codes, parking notes, barn manager details, browser geolocation, and manual address fallback.

### Horses

Provides a searchable horse list, horse profiles, four large foot buttons, photo/document timeline, last verified shoe setup, and previous notes.

### Prep Tomorrow

The differentiator. Shows tomorrow's route, each horse's prior verified setup, trimmed-foot photo, finished-shoe photo, shoe size/model, fit notes, cycle-change notes, and a fast Shoes Prepped status.

### Finish Job

Optimized for field speed. Select service type, update setup, add photos or notes, mark setup Verified, auto-set next due date, save job, and prepare a mock owner summary.

## Explicit Non-Goals For Prototype 0

- Native iPhone app
- Real payment processing
- Real SMS sending
- Real cloud sync
- Client logins
- Vet logins
- AI diagnosis
- Hardware integration
- Real client data

## Team Sharing Direction

Prototype 0 may show mock apprentice/business-partner sharing and local notification pings. This represents the future workflow where approved team members can see live schedule changes, horse removals, reschedules, prep notes, and completed work updates. Real-time sync, real push notifications, accounts, permissions, and audit trails remain future work.

## Success Criteria For Prototype 0

- A farrier can understand tomorrow's shoe prep in under 30 seconds.
- A horse's four feet are visually prominent and easy to open.
- The RF foot history is reachable in the required flow.
- A verified setup can be saved locally after finishing a job.
- The app works on desktop and narrow mobile browser widths.
- All demo data is realistic but fictional.
