# Bug log — rider app manual test pass

Temporary. Add findings as you go; we'll work through them one at a time.

Template:

```
### [B-01] Short title
- **Scenario:** BK-07
- **Steps:** 1. … 2. … 3. …
- **Expected:**
- **Actual:**
- **Evidence:** screenshot / Metro log / backend `[unhandled]` line
- **Severity:** blocker | major | minor | cosmetic
- **Status:** open
```

> For any "Something went wrong" / 500: the client is *designed* to hide the
> cause (error.middleware.ts flattens everything non-AppError). The real error
> and stack are in the **backend terminal**, on the line starting `[unhandled]`.
> Paste that — without it a 500 is not diagnosable.

---
