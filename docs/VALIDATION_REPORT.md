# Validation Report

Content version: 0.3.0-predev  
Phase: **0.5 complete** (election-math IRV/STV; Phase 0 hardened; Phase 0b next)

Validated 48 countries, 21 admin units, 48 constituencies, 30 top-level figures  
Assembly constituencies crossing province boundaries by design: 34/48  

**STATUS: PASS** (TypeScript `pnpm validate:content`)

Notes:
- Presidential eligibility is approved/authoritative (`data/terena_presidential_eligibility.json`; runtime evaluates it from KernelWorld).
- R/RT IDs are canonical geography IDs but not required on `terena_game_map.svg`.
- Python validator retained; CI runs `python3 scripts/validate_content.py`.
