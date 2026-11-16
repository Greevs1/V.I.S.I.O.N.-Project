# V.I.S.I.O.N. Architecture Constitution Check™

**The Mandatory Pre-Implementation Review for Every Future Feature**

**Date:** 2026-08-10
**Status:** FROZEN — Mandatory
**Authority:** V.I.S.I.O.N. Constitution (Article XIII — The Constitution Is Supreme)

---

## Purpose

Every future Base44 implementation MUST perform this Architecture Constitution Check BEFORE writing code. This is not optional. This is not a suggestion. This is the law.

If ANY answer indicates duplication or bypassing, **STOP IMPLEMENTATION** and recommend the certified extension point instead.

---

## The 13-Question Constitution Check

Before writing any code, answer every question honestly. Document the answers. If any answer reveals a violation, implementation stops.

### Question 1: Does this already exist?

**Check:** Search the Engine Registry, Ownership Matrix, and Canonical Fact Registry.

- ✅ PASS: This capability does not exist yet.
- ❌ FAIL: This capability already exists. → Use the existing system. Do not rebuild.

### Question 2: Who owns this business concept?

**Check:** Consult the Ownership Matrix.

- ✅ PASS: The concept has one declared owner (or I am declaring a new owner for a new concept).
- ❌ FAIL: The concept already has an owner, and it's not me. → Read from the owner. Do not duplicate.

### Question 3: Am I duplicating an engine?

**Check:** Search the Engine Registry for engines with similar responsibilities.

- ✅ PASS: No existing engine does what I'm building.
- ❌ FAIL: An existing engine already does this. → Call the existing engine. Do not create a new one. (Article III)

### Question 4: Am I duplicating a calculation?

**Check:** Search the Ownership Matrix for the metric I'm calculating.

- ✅ PASS: No existing engine calculates this metric.
- ❌ FAIL: An existing engine already calculates this. → Read from the owner. Do not recalculate. (Article II, Article IX)

### Question 5: Am I duplicating synchronization?

**Check:** Am I building my own refresh trigger, propagation logic, or event system?

- ✅ PASS: I am using CBSS for all synchronization.
- ❌ FAIL: I'm building my own sync. → Use CBSS. Do not build a parallel sync system. (Article III, Article X)

### Question 6: Am I bypassing Canonical Facts?

**Check:** Am I reading a raw source (extracted_fields, assessment answers) directly instead of resolving through the Canonical Fact Resolver?

- ✅ PASS: I am reading canonical facts first, with legacy as fallback.
- ❌ FAIL: I'm reading a raw source directly. → Use the Consumer Adapter. Resolve canonically. (Article VIII)

### Question 7: Am I bypassing CBSS?

**Check:** Am I writing directly to a consumer table or triggering a refresh without going through CBSS?

- ✅ PASS: All propagation goes through CBSS.
- ❌ FAIL: I'm writing directly or bypassing CBSS. → Route through CBSS. (Article III, Article X)

### Question 8: Am I bypassing IDO?

**Check:** Am I hardcoding dependency resolution instead of using the Intelligence Dependency Orchestrator?

- ✅ PASS: I am using IDO for dependency resolution.
- ❌ FAIL: I'm hardcoding dependencies. → Use IDO. Declare dependencies in the Derived Fact Framework. (Article III)

### Question 9: Am I bypassing advisor governance?

**Check:** Am I auto-publishing, auto-promoting, or auto-approving without advisor review?

- ✅ PASS: AI proposes; advisor decides.
- ❌ FAIL: I'm auto-publishing or auto-promoting. → Route to advisor review. (Article V)

### Question 10: Am I violating the Ownership Matrix?

**Check:** Am I assigning ownership of a concept to a system that doesn't own it?

- ✅ PASS: I am reading from the declared owner.
- ❌ FAIL: I'm assigning ownership to the wrong system. → Read from the correct owner. (Article II)

### Question 11: Can this be implemented as an extension?

**Check:** Can I register a new fact, consumer, capability, or method instead of building a new system?

- ✅ PASS: I am extending an existing registry.
- ❌ FAIL: I'm building a parallel system. → Register into the existing system. (Article VII)

### Question 12: Can I reuse an existing certified engine?

**Check:** Is there a certified engine that already produces what I need?

- ✅ PASS: I am reusing a certified engine (or no engine produces this yet).
- ❌ FAIL: An engine already produces this, and I'm rebuilding it. → Call the existing engine. (Article III, Article IX)

### Question 13: Does this violate the Constitution?

**Check:** Review all 13 Articles. Does this implementation violate any Article?

- ✅ PASS: This implementation violates no Article.
- ❌ FAIL: This implementation violates Article(s) [specify]. → Redesign to comply. (Article XIII)

---

## Decision Matrix

| All 13 Answers PASS | → PROCEED with implementation |
| Any Answer FAILS | → STOP IMPLEMENTATION |
| | → Recommend the certified extension point |
| | → Redesign to comply with the Constitution |

---

## Stop Protocol

If ANY answer indicates duplication or bypassing:

```
1. STOP IMPLEMENTATION
   - Do not write code that violates the Constitution.

2. IDENTIFY THE VIOLATION
   - Which Article is violated?
   - Which existing system already owns this?

3. RECOMMEND THE EXTENSION POINT
   - Register a new fact in the Canonical Fact Registry
   - Register a new consumer in the Subscription Registry
   - Register a new capability in the Capability Registry
   - Register a new method in the Methodology Registry
   - Register a new derived fact in the Derived Fact Framework
   - Register a new orchestration rule in IDO

4. REDESIGN
   - Compose existing engines instead of duplicating
   - Extend existing registries instead of building parallel systems
   - Route through CBSS/IDO/Canonical Resolver instead of bypassing

5. RE-RUN THE CONSTITUTION CHECK
   - All 13 answers must PASS before implementation proceeds.
```

---

## Certification

Every implementation must document its Constitution Check results:

```yaml
implementation:
  name: "<feature name>"
  date: "<date>"
  constitution_check:
    q1_already_exists: PASS | FAIL
    q2_ownership_declared: PASS | FAIL
    q3_no_duplicate_engine: PASS | FAIL
    q4_no_duplicate_calculation: PASS | FAIL
    q5_no_duplicate_sync: PASS | FAIL
    q6_canonical_first: PASS | FAIL
    q7_no_bypass_cbss: PASS | FAIL
    q8_no_bypass_ido: PASS | FAIL
    q9_advisor_governance: PASS | FAIL
    q10_ownership_matrix: PASS | FAIL
    q11_extension_first: PASS | FAIL
    q12_reuse_engine: PASS | FAIL
    q13_no_constitution_violation: PASS | FAIL
  result: PROCEED | STOP
  violations: [list any failures and resolutions]
```

---

## The Rule

**No code is written until all 13 answers are PASS.**

This is the Constitution. This is the law. This is how V.I.S.I.O.N. grows for years without accumulating architectural debt.

---

## READY FOR CONSTITUTION REVIEW