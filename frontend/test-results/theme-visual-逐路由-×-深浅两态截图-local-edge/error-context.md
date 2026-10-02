# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: theme-visual.spec.js >> 逐路由 × 深浅两态截图
- Location: tests\theme-visual.spec.js:33:1

# Error details

```
AggregateError: apiRequestContext.post: connect ECONNREFUSED ::1:8080
connect ECONNREFUSED 127.0.0.1:8080
Call log:
  - → POST http://localhost:8080/api/auth/register
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36 Edg/153.0.8010.12
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 77

```