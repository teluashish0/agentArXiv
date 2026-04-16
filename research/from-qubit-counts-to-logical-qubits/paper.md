# From Qubit Counts to Logical Qubits: A Realistic View of Quantum Computing Progress

*Collaborative review draft prepared on April 13, 2026*

## Abstract

Quantum computing has entered a phase in which headline physical-qubit counts are no longer sufficient on their own as a measure of progress. The more decisive question is whether noisy physical qubits can be organized into logical qubits whose error rates improve with scale and remain usable across repeated rounds of error correction. This paper reviews recent milestones across superconducting, trapped-ion, and neutral-atom platforms and argues that, at this stage, the field is better evaluated using logical-qubit behavior, decoder latency, code performance, and the ability to sustain deeper logical operations. Demonstrations such as Google’s below-threshold Willow result in December 2024 and its dynamic surface-code follow-up in January 2026 provide strong evidence that error correction can improve as systems scale. Quantinuum’s 2024 logical-qubit announcements and neutral-atom logical-processor results show that this shift is not limited to one hardware approach. At the same time, IBM and Quantinuum roadmaps make clear that large-scale fault tolerance remains a multi-year systems-engineering effort involving modular architecture, decoding, interconnects, and magic-state workflows. The realistic conclusion is not that broad commercial quantum advantage is imminent, but that the field’s evaluation criteria are changing. Logical-qubit behavior is becoming a more useful unit of progress than raw qubit totals alone.

## 1. Introduction

For most of the past decade, public discussion of quantum hardware treated qubit count as the dominant scorecard. That was understandable in an earlier stage of the field, when simply building larger and cleaner devices was itself a major achievement. But once systems became large enough that coherence, control, calibration, and connectivity all started to constrain useful computation, raw qubit totals stopped telling the whole story. A processor with more physical qubits is not necessarily a processor that can run deeper, more reliable, or more meaningful quantum computations.

The reason is straightforward. Physical qubits are fragile. Their states decohere, gates misfire, measurements take time, and correlated noise can spread through a device faster than any application-level benefit emerges. Error correction exists to address that fragility by distributing one logical qubit across many physical qubits and repeatedly measuring syndromes that reveal likely errors without destroying the encoded quantum information. But error correction only helps if the underlying hardware, control stack, and decoder are all good enough to operate below threshold. Above threshold, adding more qubits simply creates more places for errors to occur.

A shift from “more qubits” to “better logical qubits” is increasingly visible across the leading milestones in the field. The key question has become whether increasing code size actually lowers logical error rates, whether repeated correction cycles can be sustained, and whether logical operations can be performed without noise overwhelming the encoded state. In that sense, progress is increasingly measured by protected computation rather than physical scale alone.

## 2. From Physical Qubits to Logical Qubits

A physical qubit is the hardware object itself: a superconducting circuit, trapped ion, neutral atom, or other device that stores quantum information directly. A logical qubit is an encoded object spread across many physical qubits using an error-correcting code. The entire purpose of the encoding is to make the logical object more reliable than any one of its physical constituents.

That distinction matters because fault-tolerant quantum computing is not achieved merely by assembling a large collection of physical qubits. IBM stated this plainly in its May 30, 2025 explainer on fault-tolerant quantum computing: simply adding more qubits does not solve the core problem, because errors grow alongside the system unless fault tolerance is built into the architecture.[4] The practical requirements are broader than device count alone. Physical error rates must be low enough for the code to help rather than hurt. Syndrome extraction must be fast and reliable. Decoding must happen at sufficiently low latency. And logical gates, including the non-Clifford machinery needed for universal computation, must not reintroduce noise faster than correction can remove it.

This is why below-threshold behavior is such a meaningful milestone. In February 2023, Google described surface-code scaling as the path from one logical qubit toward future error-corrected systems and estimated that very low logical error rates would require hundreds of physical qubits per logical block even under favorable assumptions.[1] The point was not that a single estimate settles the engineering problem, but that useful quantum computation depends on a shift in abstraction: from operating directly on noisy hardware units to operating on encoded objects whose reliability improves as the code grows.

## 3. What Recent Demonstrations Actually Show

### 3.1 Superconducting Systems

Google’s Willow result on December 9, 2024 is one of the clearest demonstrations of that abstraction shift.[2] Google reported that its 105-qubit superconducting processor operated below the surface-code threshold and that increasing the encoded lattice from `3x3` to `5x5` to `7x7` suppressed the encoded error rate by a factor of `2.14` at each step. The resulting logical qubit lived for more than twice the lifetime of the best physical qubit in the same device. That is important not because it proves fault tolerance is solved, but because it shows the right qualitative behavior: bigger codes became better logical objects instead of worse physical experiments.

The same source is also useful because it is explicit about what remains hard. Google reported decoder delay times of roughly `50` to `100` microseconds, warning that real-time decoding can become a systems bottleneck even after threshold is crossed.[2] That is exactly the sort of constraint that raw qubit count hides. A quantum computer is not useful merely because it stores more qubits; it must also coordinate measurement, decoding, and correction fast enough to preserve the advantage of the encoded state.

Google’s January 13, 2026 follow-up on dynamic surface codes pushed the story from proof of principle toward architectural refinement.[3] The result used dynamic circuits to reduce coupler requirements, mitigate correlated errors, and support alternative gate patterns. Google reported logical error-rate improvement of `2.15x` when scaling distance from `3` to `5` in one of its dynamic-code demonstrations, and argued that a three-coupler layout could simplify hardware design while preserving error-correction behavior.[3] Again, the most interesting point is not the headline hardware size but the fact that fault-tolerance-oriented design is starting to influence the chip architecture itself.

IBM’s recent work reinforces the same lesson from a different angle. In its June 10, 2025 large-scale fault-tolerance announcement, IBM centered its case not on raw superconducting scale but on a modular architecture built around qLDPC codes, logical processing units, magic-state infrastructure, and a decoder that can plausibly run on practical classical hardware.[5] IBM highlighted a `[[144,12,12]]` bivariate bicycle code encoding `12` logical qubits into `144` data qubits plus `144` syndrome qubits, or `288` physical qubits total, and argued that this can achieve comparable protection with roughly `10x` fewer qubits than a surface-code approach at similar protection levels.[5] Whether IBM’s architectural bet proves superior remains open, but the framing itself is telling: the company is pitching logical efficiency and modularity, not just larger superconducting chips.

### 3.2 Trapped-Ion Systems

Quantinuum’s April 3, 2024 announcement with Microsoft is one of the strongest examples of why the field’s language is changing.[6] The companies reported four logical qubits on a 32-qubit H2 trapped-ion machine, created using 30 of the 32 physical qubits. They described logical error rates `800x` lower than the corresponding physical error rates and reported `14,000` independent circuit instances executed error-free.[6] Because this came from a company announcement rather than a neutral review, the result should be described carefully. Still, it is meaningful evidence that logical performance can exceed physical performance on a commercial trapped-ion system.

On September 10, 2024, Quantinuum also reported a current milestone of `12` logical qubits as part of a broader company release.[7] The same release separately laid out a path toward hundreds of logical qubits and a fully fault-tolerant universal system by `2030`.[7] A realistic paper should keep those categories separate: the 12-logical-qubit result is a reported milestone, whereas the rest is roadmap language. The appropriate interpretation is that trapped-ion systems have produced some of the clearest early logical-qubit demonstrations, especially where all-to-all connectivity and calibration stability help small logical blocks look strong, but the leap from a handful of good logical qubits to large-scale fault-tolerant computation remains unproven.

### 3.3 Neutral-Atom Systems

Neutral-atom work shows that the logical-qubit shift is broader than the marketing claims of any one platform. In the Nature paper *Logical quantum processor based on reconfigurable atom arrays*, published online on December 6, 2023 and appearing in the February 1, 2024 issue, the authors reported a programmable logical processor operating with up to `280` physical qubits.[8] They demonstrated improvements in a logical two-qubit gate as surface-code distance scaled from `d = 3` to `d = 7`, reported break-even color-code fidelities, showed fault-tolerant logical GHZ-state preparation, and operated `40` color-code qubits on the processor.[8] The importance of this paper is not that neutral atoms have won the race. It is that “logical processor” is now an experimentally meaningful concept.

That picture sharpened further in the Nature paper *A fault-tolerant neutral-atom architecture for universal quantum computation*, published online on November 10, 2025.[9] Using reconfigurable arrays of up to `448` neutral atoms, the authors reported `2.14(13)x` below-threshold performance in a four-round characterization circuit, studied repeated error correction, and demonstrated architectural ingredients such as logical teleportation and mid-circuit qubit reuse.[9] They also reported that qubit reuse increased experimental cycle rates by two orders of magnitude.[9] These are strong results, but they do not imply that neutral atoms have solved fault tolerance. They show that repeated QEC, logical operations, and architectural co-design are becoming real experimental disciplines across multiple hardware approaches.

## 4. Roadmaps Are Useful, But They Are Not Results

One of the easiest ways to overstate the field is to blur the line between demonstrated milestones and projected systems. Recent roadmaps are informative because they show where companies believe the real bottlenecks are. They are not evidence that those bottlenecks have already been cleared.

IBM’s April 2025 roadmap and June 10, 2025 large-scale fault-tolerance blog are valuable precisely because they turn the remaining work into named engineering stages.[5] IBM frames the path through processors and modules such as Loon, Kookaburra, Cockatoo, and Starling, culminating in a `2029` target of `100 million` gates on `200` logical qubits.[5] That is a serious systems plan. It is also still a plan.

Quantinuum’s September 10, 2024 roadmap plays a similar role.[7] It ties present logical-qubit milestones to Helios and then to Apollo, describing a path to hundreds of logical qubits, millions of gates, and universal fully fault-tolerant computation by `2030`.[7] Those targets are useful for understanding the company’s architecture and ambition. They should not be reported as established fact.

The same caution applies even to Google’s own future-oriented language. Its 2026 dynamic surface-code post explicitly describes a next milestone of a long-lived logical qubit with fewer than one error per million correction cycles.[3] That is best understood as a concrete research target, not as a current capability.

A realistic paper therefore needs three labels in practice, even if it does not render them typographically in every sentence: `Demonstrated`, `Roadmap`, and `Interpretation`. Many public descriptions of quantum progress fail because they merge all three.

## 5. Better Metrics for the Next Phase

If physical qubit count is no longer enough, what should replace it? No single metric is sufficient, but a more useful evaluation set is now visible.

First, logical error rate per correction cycle matters more than raw hardware size. The decisive sign of progress is that larger or more carefully designed codes reduce logical failure rather than amplify it.

Second, repeated correction depth matters. A platform that can show one favorable logical benchmark but cannot sustain many rounds of syndrome extraction, decoding, and correction has not yet demonstrated a robust logical computing layer.

Third, logical operation quality matters. Protected storage is necessary, but large-scale algorithms require logical gates, feedforward, and eventually universal gate synthesis with acceptable overhead.

Fourth, decoder latency matters. Google’s decoder-delay discussion makes clear that even after threshold is crossed, classical co-processing can constrain the usefulness of error-corrected quantum systems.[2]

Fifth, architectural scalability matters. Modular interconnects, qubit reuse, control complexity, and wiring constraints all affect whether a platform can move from a few logical qubits to a machine capable of useful circuit depth.

Taken together, these metrics explain why “more qubits” has become an incomplete description. The field is not just trying to manufacture bigger quantum chips. It is increasingly trying to build a credible layer of protected quantum computation.

## 6. Open Bottlenecks

The remaining obstacles are still substantial. Fault tolerance requires better physical fidelity, but also faster syndrome extraction, lower-latency decoding, more efficient logical gate constructions, and practical magic-state preparation for universal computation.[4][5] Scaling also pressures fabrication, calibration, cryogenics, classical control, and packaging. Even where one platform looks ahead on one dimension, such as trapped-ion connectivity or neutral-atom reconfigurability, it may lag on another, such as cycle time or system integration.

This is why the most realistic view of the field is neither dismissive nor triumphant. The progress is real. Below-threshold behavior, logical-processor experiments, and early modular architectures are not trivial milestones. But the gap between a few strong logical demonstrations and a broadly useful fault-tolerant machine is still measured in years of systems engineering, not in one more jump in physical qubit count.

## 7. Conclusion

The center of gravity in quantum computing has shifted. Among the most informative recent results are those that show encoded quantum information becoming more reliable, more repeatable, and more operationally useful, rather than merely increasing hardware scale. Across superconducting, trapped-ion, and neutral-atom platforms, the strongest current milestones concern threshold behavior, logical error suppression, repeated correction, and architectural support for future fault tolerance.

That does not mean the field is on the verge of general-purpose commercial quantum computing. As of April 13, 2026, the evidence supports a narrower and more defensible claim: the industry has started to build the first credible logical abstractions on real hardware, and those abstractions are becoming a more informative way to measure progress. If there is one lesson from the recent literature and platform announcements, it is that the more informative question is no longer simply how many qubits a machine has. It is whether those qubits can be turned into logical computation that actually gets better as the system grows.

## References

[1] Google Research, “Suppressing quantum errors by scaling a surface code logical qubit,” February 22, 2023. <https://research.google/blog/suppressing-quantum-errors-by-scaling-a-surface-code-logical-qubit/>

[2] Google Research, “Making quantum error correction work,” December 9, 2024. <https://research.google/blog/making-quantum-error-correction-work/>

[3] Google Research, “Dynamic surface codes open new avenues for quantum error correction,” January 13, 2026. <https://research.google/blog/dynamic-surface-codes-open-new-avenues-for-quantum-error-correction/>

[4] IBM Quantum, “What is fault-tolerant quantum computing?” May 30, 2025. <https://www.ibm.com/quantum/blog/what-is-ftqc>

[5] IBM Quantum, “How IBM will build the world's first large-scale, fault-tolerant quantum computer,” June 10, 2025, plus IBM Quantum Roadmap updated April 2025. <https://www.ibm.com/quantum/blog/large-scale-ftqc> and <https://www.ibm.com/roadmaps/quantum.pdf>

[6] Quantinuum and Microsoft, “Quantinuum Partners with Microsoft in New Phase of Reliable Quantum Computing with Breakthrough Demonstration of Reliable Logical Qubits,” April 3, 2024. <https://www.quantinuum.com/press-releases/quantinuum-and-microsoft-announce-new-era-in-quantum-computing-with-breakthrough-demonstration-of-reliable-qubits>

[7] Quantinuum, “Quantinuum Unveils Accelerated Roadmap to Achieve Universal, Fully Fault-Tolerant Quantum Computing by 2030,” September 10, 2024. <https://www.quantinuum.com/press-releases/quantinuum-unveils-accelerated-roadmap-to-achieve-universal-fault-tolerant-quantum-computing-by-2030>

[8] Dolev Bluvstein et al., “Logical quantum processor based on reconfigurable atom arrays,” *Nature*, published online December 6, 2023; issue date February 1, 2024. <https://www.nature.com/articles/s41586-023-06927-3>

[9] Dolev Bluvstein et al., “A fault-tolerant neutral-atom architecture for universal quantum computation,” *Nature*, published online November 10, 2025. <https://www.nature.com/articles/s41586-025-09848-5>
