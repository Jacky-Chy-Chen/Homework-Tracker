# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Classmates read homework, class information and shared materials, often from the WeChat group on a phone. Editors maintain homework and the timetable; administrators assign permissions.

## Product Purpose

Classboard keeps daily homework and longer-term deadlines easy to find and generates the message copied into the homeroom group.

## Operating Context

The existing app uses React, TypeScript, Vite, Supabase and hash routes. It supports desktop and mobile browsers, light and dark themes, and a local demo mode.

## Capabilities and Constraints

Preserve the existing homework calendar, personal checkboxes, posting flow and message rules. Add the approved update in phases. School-calendar events require explicit approval before inclusion in publishable code. The private reference PDF must remain local and outside Git and production assets. Production migrations, commits, pushes and deployment require separate approval.

## Brand Commitments

Preserve Classboard's existing visual style, typography, components and navigation conventions.

## Product Principles

- Homework remains the primary focus.
- Keep school dates separate from homework deadlines.
- Enforce permissions at the database and storage layers.
- Protect student information and private reference documents.

## Accessibility & Inclusion

Use readable layouts, accessible controls and responsive behavior. Avoid unnecessary dependencies.
