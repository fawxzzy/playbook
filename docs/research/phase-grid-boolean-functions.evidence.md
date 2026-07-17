# Phase-Grid Boolean Functions: Evidence Ledger

## Purpose

This memo records the evidence standard for the phase-grid Boolean functions research lane.

It is intentionally separate from the math-core memo so representation claims, hardware claims, and application claims can be evaluated independently.

## Scope

This ledger is paired with the planned math memo at `docs/research/phase-grid-boolean-functions.math.md`.

Its job is not to restate every derivation. Its job is to classify claims, define what counts as evidence for each class, and mark which boundaries remain unproven.

## Hard Boundary

Representational framework != hardware superiority claim.

An exact phase-grid continuation result can justify a mathematical representation claim. It does not by itself justify a claim that optical, spin-wave, oscillator, analog, or other non-CMOS hardware is faster, cheaper, more scalable, or more practical than standard digital implementations.

## Mathematical Representation Claims

| Claim class | What the claim means | Minimum evidence standard | Current status |
| --- | --- | --- | --- |
| Boolean-to-phase embedding | A Boolean function in `+/-1` encoding can be embedded on the phase grid `{0, pi}^n` | definition plus worked example | evidence required per claim |
| Walsh/Fourier continuation | The Walsh expansion induces an exact continuation on the Boolean phase grid | theorem plus proof or standard reference | evidence required per claim |
| Exact grid recovery | The continuation recovers the original function at every grid point | proof, derivation, or standard reference | evidence required per claim |
| Threshold comparison | Majority-like functions admit a threshold view while parity-like functions admit a spectral view | worked example plus explicit derivation | evidence required per claim |
| Off-grid interpretation | Off-grid behavior is an interpolation choice, not automatic physical semantics | explicit limitation statement plus supporting reference if a stronger claim is made | evidence required per claim |

For this category, acceptable evidence is one of:

- a formal definition
- a theorem
- a proof
- a worked example
- a standard reference

## Hardware-Architecture Claims

| Claim class | What the claim means | Minimum evidence standard | Current status |
| --- | --- | --- | --- |
| Implementability | A hardware family can realize part of the representation or continuation | device demo or implementation reference | evidence required per claim |
| Performance | A hardware family improves latency, throughput, energy, area, or noise tolerance | benchmark with stated baseline and conditions | unproven by default |
| Integration | A hardware family can participate in a realistic stack with inputs, outputs, control, and error handling | integration evidence or explicit architecture study | unproven by default |
| Scalability | A hardware family continues to work under larger fan-in, composition depth, or routing load | scaling evidence or explicit limitation statement | unproven by default |
| Robustness | A hardware family tolerates noise, calibration drift, fabrication variance, or synchronization error | measured evidence or explicit limitation statement | unproven by default |

For this category, acceptable evidence is one of:

- a device demo
- a benchmark
- integration evidence
- an explicit limitation

## Applications and Research-Agenda Claims

| Claim class | What the claim means | Minimum evidence standard | Current status |
| --- | --- | --- | --- |
| Use case | The framework may clarify or simplify a concrete problem class | use case writeup with bounded scope | exploratory |
| Hypothesis | The framework may suggest a new optimization or architecture experiment | explicit hypothesis with falsifiable prediction | exploratory |
| Related work link | The framework overlaps with spectral logic, threshold logic, optical logic, or analog computation literature | related-work citation with stated connection and difference | evidence required per claim |
| Research agenda | The framework motivates next experiments, proofs, or comparative studies | open-question framing with required evidence listed | exploratory |

For this category, acceptable evidence is one of:

- a use case
- a hypothesis
- related work
- an open question

## Citation Policy

Citation placeholders are never publishable references.

Before publication or doctrine promotion:

- replace every placeholder with a real source
- keep mathematical references separate from hardware references
- keep hardware references separate from application or agenda references
- cite the narrowest claim that the source actually supports
- mark conjecture, extrapolation, and open questions explicitly

Pattern: separate representation claims, hardware claims, and application claims before assigning evidence.

Rule: citation placeholders are never publishable references.

Failure Mode: treating gate-level optical, spin-wave, or oscillator demos as proof of stack-level computational advantage.

## Unproven Boundaries

The following statements should be treated as unproven unless dedicated evidence is added:

- the phase-grid representation yields hardware superiority
- off-grid continuations define a unique physical computation model
- oscillator, optical, or spin-wave realizations inherit the same benefits at system scale
- exact Boolean-grid recovery implies practical advantage under noise, routing, memory, or I/O constraints
- majority and parity examples generalize to broad application wins without comparative evidence

## Evidence Intake Checklist

For each future claim added to this lane:

1. Classify it as mathematical, hardware-architecture, or application/research-agenda.
2. State the exact claim in one sentence.
3. Attach the minimum evidence type required for that class.
4. Record whether the claim is proven, supported, exploratory, limited, or unproven.
5. Add explicit limitation language when the source does not establish system-level advantage.
