# Phase-Grid Boolean Functions: Math Core

## Purpose

This note defines a narrow mathematical framework connecting Boolean truth tables, Walsh/Fourier expansions, threshold forms, and trigonometric continuations on a phase grid.

It is a representational result. It is not a claim that sinusoidal, wave, optical, or oscillator hardware supersedes CMOS.

## Core thesis

For a function on the Boolean cube in `+/-1` encoding, the Walsh expansion induces a canonical trigonometric continuation that is exact on the phase grid `{0, pi}^n`.

The useful pattern is:

- `truth table -> +/-1 encoding -> Walsh spectrum -> phase-grid continuation -> exact grid recovery -> threshold or spectral realization`

## Definitions

Let

```math
f : \{-1,1\}^n \to \mathbb{R}
```

and let the Walsh characters be

```math
\chi_S(x) = \prod_{i \in S} x_i
\qquad
\text{for } S \subseteq [n].
```

Then `f` has the Walsh expansion

```math
f(x) = \sum_{S \subseteq [n]} \hat f(S)\chi_S(x).
```

Define the phase-grid embedding coordinatewise by

```math
\gamma_i(x_i) =
\begin{cases}
0 & x_i = 1 \\
\pi & x_i = -1
\end{cases}
```

so that `gamma(x) in {0, pi}^n`.

## Canonical continuation

Define the canonical complex phase continuation by

```math
T_f(\theta) = \sum_{S \subseteq [n]} \hat f(S)e^{i\sum_{j \in S}\theta_j}.
```

Define the real-valued phase continuation by

```math
R_f(\theta) = \sum_{S \subseteq [n]} \hat f(S)\cos\!\left(\sum_{j \in S}\theta_j\right).
```

## Proposition

For every Boolean-grid point `x in {-1,1}^n`,

```math
T_f(\gamma(x)) = f(x).
```

If `f` is real-valued, then also

```math
R_f(\gamma(x)) = f(x).
```

## Proof

At a grid point,

```math
e^{i\gamma_i(x_i)} = x_i.
```

Therefore

```math
e^{i\sum_{j \in S}\gamma_j(x_j)}
= \prod_{j \in S} e^{i\gamma_j(x_j)}
= \prod_{j \in S} x_j
= \chi_S(x).
```

Substituting into `T_f` recovers the Walsh expansion of `f`, hence `T_f(\gamma(x)) = f(x)`.

For the real-valued form, every phase-grid sum is an integer multiple of `pi`, so the exponential term is already real and equal to `+/-1`. Its real part is therefore the same value, which gives `R_f(\gamma(x)) = f(x)`.

## Worked example: 3-input majority

In `+/-1` encoding,

```math
\operatorname{MAJ}_3(x) = \operatorname{sign}(x_1 + x_2 + x_3).
```

Its truth table is:

| x_1 | x_2 | x_3 | majority |
| --- | --- | --- | --- |
| 1 | 1 | 1 | 1 |
| 1 | 1 | -1 | 1 |
| 1 | -1 | 1 | 1 |
| -1 | 1 | 1 | 1 |
| 1 | -1 | -1 | -1 |
| -1 | 1 | -1 | -1 |
| -1 | -1 | 1 | -1 |
| -1 | -1 | -1 | -1 |

Its Walsh expansion is

```math
\operatorname{MAJ}_3(x)
= \frac12(x_1 + x_2 + x_3 - x_1x_2x_3).
```

The induced real phase continuation is

```math
R_{\operatorname{MAJ}_3}(\theta)
= \frac12\left(
\cos\theta_1 +
\cos\theta_2 +
\cos\theta_3 -
\cos(\theta_1 + \theta_2 + \theta_3)
\right).
```

The threshold form is

```math
\operatorname{MAJ}_3(x) = \operatorname{sign}(x_1 + x_2 + x_3).
```

On the phase grid, `x_i = cos(theta_i)`, so the same function can be written as

```math
\operatorname{MAJ}_3(\theta)
= \operatorname{sign}(\cos\theta_1 + \cos\theta_2 + \cos\theta_3)
```

when `theta` is restricted to `{0, pi}^3`.

This is the basic cash-out:

- truth table
- `+/-1` encoding
- Walsh expansion
- exact phase-grid continuation
- threshold realization

## Contrast case: parity

Let

```math
\operatorname{PARITY}_3(x) = x_1x_2x_3.
```

It has a single Walsh term, so its real phase continuation is

```math
R_{\operatorname{PARITY}_3}(\theta) = \cos(\theta_1 + \theta_2 + \theta_3).
```

This contrast matters:

- majority is naturally linear-threshold realizable;
- parity is naturally spectral and phase realizable;
- both are recovered exactly on the Boolean phase grid.

## Boundary of the result

The exact statement is only about recovery on the phase grid.

Off the grid, `T_f` and `R_f` define an interpolation or continuation choice induced by the Walsh expansion. That continuation is mathematically canonical once the embedding is fixed, but it is not by itself a unique physical computation model.
