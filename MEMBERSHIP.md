# FarrierOS Membership

## Launch Plan

FarrierOS launches with one membership:

- Plan: FarrierOS Full Access
- Price: $7.99 USD per month
- Entitlement: `farrieros.full_access`
- Access: every FarrierOS feature and service available at launch

The launch plan does not divide scheduling, horse records, verified setups, Prep Tomorrow, Finish Job, offline records, or backups into separate paid features.

## Current Implementation

The app contains the membership model, full-access entitlement gate, account and business-profile screen, offline grace-period behavior, persistence migration, and automated tests. Development access is enabled locally and does not charge a payment method.

Live billing still requires a hosted backend, authenticated accounts, a Stripe product and recurring price, Checkout session creation, signed webhook processing, an internal subscription record, and Customer Portal sessions.

## Offline Rule

An active member must retain field access during temporary connectivity loss. A server-verified membership can enter a bounded grace period stored on the device. Cancelling or payment failure must never delete local horse or service records.

## Deferred Tier

A future $19.99 monthly tier may add taxable-income tracking. It is explicitly deferred until after the $7.99 Full Access product launches and is not part of the current entitlement model.
