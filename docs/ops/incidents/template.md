# Incident Post-Mortem — INC-XXX

> Template — copy and rename to `INC-<number>-<short-title>.md`

---

## Incident Summary

| Field            | Value                         |
|------------------|-------------------------------|
| **Incident ID**  | INC-XXX                       |
| **Severity**     | P1 / P2 / P3                  |
| **Status**       | Resolved / In Progress        |
| **Start time**   | 2026-MM-DD HH:MM UTC          |
| **End time**     | 2026-MM-DD HH:MM UTC          |
| **Duration**     | X hours Y minutes             |
| **Affected**     | API / web-customer / payments |
| **Impact**       | ~X users affected             |
| **Incident commander** | @name                   |
| **Responders**   | @name1, @name2                |

---

## Timeline

| Time (UTC)  | Event                                         |
|-------------|-----------------------------------------------|
| HH:MM       | Alert triggered: "Ziza Uptime SLA Alert"      |
| HH:MM       | On-call notified via PagerDuty                |
| HH:MM       | Investigation started                         |
| HH:MM       | Root cause identified: [description]          |
| HH:MM       | Fix deployed to production                    |
| HH:MM       | Service confirmed healthy                     |
| HH:MM       | Incident resolved                             |

---

## Root Cause

_Describe what caused the incident. Be specific — include file names, SQL queries, configuration values, etc._

Example:
> The `create_async_engine` pool was exhausted because a long-running trip query held connections without timeout, causing subsequent requests to queue and eventually return HTTP 503.

---

## Impact

- **Users affected**: approximately X passengers, Y drivers
- **Requests failed**: ~X HTTP 5xx responses during the window
- **Functionality degraded**: [list specific features]
- **Revenue impact**: estimated ~X XOF in lost trips

---

## What Went Well

- [ ] Alert fired within 2 minutes of the outage starting
- [ ] On-call responded quickly
- [ ] Rollback procedure worked as documented

---

## What Went Poorly

- [ ] [thing that could have been better]
- [ ] [another gap]

---

## Action Items

| Action                                        | Owner    | Due Date   | Ticket  |
|-----------------------------------------------|----------|------------|---------|
| Add query timeout to long-running DB queries  | @dev     | YYYY-MM-DD | #XXX    |
| Add integration test for pool exhaustion      | @qa      | YYYY-MM-DD | #XXX    |
| Update runbook with new rollback step         | @sre     | YYYY-MM-DD | #XXX    |

---

## Lessons Learned

_1-3 key takeaways for the team._

1. [Lesson 1]
2. [Lesson 2]

---

*Written by: @incident-commander*  
*Review deadline: 5 business days after incident close*
