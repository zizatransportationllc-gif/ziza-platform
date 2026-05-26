# Ziza — Service Level Agreement (SLA)

> Sprint 31 — Performance, SRE & General Availability  
> Version 1.0 — Effective 2026-06-01

---

## 1. Purpose

This SLA defines the availability, performance, and support commitments Ziza makes to its users (passengers, drivers, and enterprise clients).

---

## 2. Service Availability

### 2.1 Standard Availability

Ziza commits to **99.5% monthly availability** for its core platform services:

- Customer booking application
- Driver dispatch application
- Payment processing
- Trip tracking

### 2.2 Measurement

Availability is measured as:

```
Availability = (Total minutes - Downtime minutes) / Total minutes × 100
```

**Downtime** = any period where the service is unavailable for > 50% of users for > 5 consecutive minutes.

**Exclusions from downtime calculation**:
- Scheduled maintenance (announced ≥ 24h in advance via status.ziza.ci)
- Force majeure (natural disasters, third-party infrastructure outages beyond our control)
- User-caused issues (incorrect API usage, account suspension)

---

## 3. Performance Commitments

| Metric                        | Commitment          |
|-------------------------------|---------------------|
| Ride estimate response time   | p95 < 500ms         |
| Driver arrival ETA accuracy   | ±2 minutes (80% of trips) |
| Payment processing success    | ≥ 99% success rate  |
| Notification delivery         | ≥ 95% within 30s    |

---

## 4. Support Response Times

| Severity | Description                                    | First Response | Resolution Target |
|----------|------------------------------------------------|----------------|-------------------|
| P1 — Critical | Service down or payment failure affecting > 10% users | 15 minutes | 2 hours |
| P2 — High | Significant feature degradation | 1 hour | 8 hours |
| P3 — Medium | Non-critical bug, isolated issue | 4 hours | 48 hours |
| P4 — Low | Feature request, minor cosmetic issue | 24 hours | Next sprint |

**Support channels**: support@ziza.ci · +225 00 00 00 00 (P1 only)

---

## 5. Remedies

If Ziza fails to meet the availability SLA in a given calendar month:

| Availability Achieved | Credit |
|-----------------------|--------|
| 99.0% – 99.5%         | 5% of monthly invoice |
| 95.0% – 99.0%         | 10% of monthly invoice |
| < 95.0%               | 25% of monthly invoice |

Credits are applied to the following month's invoice and do not exceed 25% of the monthly invoice. Credits are the sole remedy for SLA breaches.

---

## 6. Exclusions

This SLA does not apply to:
- Beta features (marked with 🧪)
- Sandbox / development environments
- Ziza mobile apps (governed by separate app store policies)
- Third-party integrations (CinetPay, Orange Money, MTN MoMo, Firebase)

---

## 7. Scheduled Maintenance

- Maintenance windows: **Sundays 02:00–04:00 UTC**
- Announced via: status.ziza.ci and email to registered contacts ≥ 24h before
- Emergency maintenance: may occur with 2h notice for critical security patches

---

## 8. Incident Communication

All incidents are tracked and published at **status.ziza.ci** with:
- Real-time status updates every 30 minutes during active incidents
- Post-mortem published within 5 business days of resolution

---

## 9. Liability Limitation

Ziza's total liability under this SLA is limited to the SLA credits defined in Section 5. Ziza is not liable for indirect, consequential, or incidental damages arising from service unavailability.

---

## 10. Revision

This SLA may be revised with 30 days' notice. Continued use of the service after the effective date of changes constitutes acceptance.

---

*Version 1.0 — Sprint 31 — Effective 2026-06-01*  
*Contact: legal@ziza.ci*
