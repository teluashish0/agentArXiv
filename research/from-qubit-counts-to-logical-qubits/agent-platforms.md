# Platform Milestones Memo: From Qubit Counts to Logical Qubits

## Superconducting

The superconducting story is no longer about raw qubit counts alone. **Demonstrated:** Google reported on **December 9, 2024** that Willow, a **105-qubit** processor, operated **below the surface-code threshold** and showed **exponential error suppression** as code distance increased from **3x3 to 5x5 to 7x7**; the encoded error rate dropped by a factor of **2.14** at each step, and the resulting logical qubit lived at **more than twice** the lifetime of the best constituent physical qubit. Google also reported nearly **10 billion cycles** of repetition-code error correction without an observed error, but that result should be framed as a targeted bit-flip experiment rather than a general-purpose fault-tolerant computer.

**Demonstrated:** On **January 13, 2026**, Google extended the same line of work with **dynamic surface codes** on Willow. The key result was a surface-code circuit using **three couplers per qubit** instead of four, with logical error rate improvement of **2.15x** as distance scaled from **3 to 5** and a simulated **15%** improvement in the error-suppression factor. That matters because it shifts the conversation from “can we scale?” to “can the hardware layout itself become more fault-tolerant and simpler to build?”

**Demonstrated:** IBM’s superconducting program has already crossed from platform engineering into architectural decomposition. In the **2024** qLDPC memory work summarized in IBM’s **June 10, 2025** blog, the **[[144,12,12]]** bivariate bicycle code encoded **12 logical qubits** into **144 data qubits** plus **144 syndrome qubits**, for **288 physical qubits total**, and IBM claimed roughly **10x fewer qubits** than the surface code for comparable protection. IBM also reported a decoder architecture, **Relay-BP**, that reduces overhead by **5x-10x** versus other leading decoders.

**Roadmap:** IBM’s **April 2025** roadmap and **June 10, 2025** blog tie the next steps to concrete machine milestones: **Loon** in **2025** for higher connectivity and c-couplers, **Kookaburra** in **2026** as the first qLDPC memory plus LPU module, **Cockatoo** in **2027** for inter-module entanglement, **Starling** in **2028** for magic-state injection across modules, and **Starling** in **2029** for **100 million gates on 200 logical qubits**. That is a credible engineering sequence, but it is still a plan, not a result.

## Trapped-Ion

**Demonstrated:** Quantinuum and Microsoft announced on **April 3, 2024** that they created **four logical qubits** on Quantinuum’s **32-qubit H2** machine using **30 of the 32 physical qubits**, with logical error rates **800x better** than the corresponding physical error rates and **14,000 independent instances** of a quantum circuit run error-free. For a review paper, this is a clean example of the field’s new center of gravity: the useful metric is not qubit count, but whether logical computation is measurably more reliable than the underlying hardware.

**Demonstrated:** On **September 10, 2024**, Quantinuum and Microsoft reported **12 logical qubits** on the **56-qubit System Model H2**. That is still modest by classical-computing standards, but it is a meaningful jump because it shows that the logical layer can be expanded beyond a one-off demonstration.

**Roadmap:** Quantinuum’s same **September 10, 2024** roadmap says the next system, **Helios**, will support enough logical qubits to surpass classical computing for some scientific problems, and that the company’s path leads to **hundreds of logical qubits** and a fully fault-tolerant universal machine by **2030** with **millions of gates**. This should be treated as vendor roadmap language: useful for structure, not proof.

**Interpretation:** The trapped-ion approach currently looks strongest where connectivity and calibration stability help small logical blocks look good early. It does not yet settle the hard question of large-scale overhead, but it has produced some of the clearest logical-qubit demonstrations to date.

## Neutral-Atom

**Demonstrated:** The most important neutral-atom milestone in the packet is the Nature paper **published online on November 10, 2025**, titled *A fault-tolerant neutral-atom architecture for universal quantum computation*. The authors used **reconfigurable arrays of up to 448 neutral atoms** and reported **2.14(13)x below-threshold performance** in a **four-round characterization circuit** using atom-loss detection and machine-learning decoding. They also studied repeated error correction with a **distance-5 surface-code logical qubit** using up to **five rounds of stabilizer measurement**.

**Demonstrated:** The same paper reports a **4-ms cycle time** for Rabi calibration and estimates that the present methods are still **10-20x slower** than a conventional planar superconducting architecture with roughly **1 microsecond** stabilizer-measurement cycles. That detail keeps the paper realistic: neutral atoms are not “better” in every dimension, but they are now showing fault-tolerant ingredients on real hardware.

**Interpretation:** Neutral atoms are especially relevant because they expose the architecture problem directly. The milestone is not just logical error suppression; it is the combination of reconfigurable arrays, repeated QEC, loss handling, and gate synthesis into a system that could plausibly scale without looking like a superconducting chip in disguise.

## Cross-Platform Takeaways

**Interpretation:** The field has converged on a simple but important thesis: the decisive unit of progress is no longer the physical qubit count, but the ability to make a **logical qubit** improve as the code gets larger, while maintaining viable decoding, connectivity, and gate synthesis. Across all three platforms, the strongest claims now depend on threshold behavior, logical error rates, and module-level scalability rather than headline qubit counts.

**Interpretation:** A realistic review paper should separate three categories very explicitly. First are **demonstrated** results, such as Willow’s below-threshold scaling, Quantinuum’s logical-qubit experiments, IBM’s qLDPC memory, and the neutral-atom below-threshold architecture study. Second are **roadmaps**, such as IBM’s **2028-2029 Starling** sequence and Quantinuum’s **2030** Apollo path. Third are **interpretations**, such as whether any platform is “closest” overall; that answer depends on whether the reader prioritizes logical fidelity, error-correction overhead, or near-term modularity.

**Interpretation:** The paper should therefore avoid claims like “quantum computers are about to become generally useful” unless the sentence is explicitly tied to a company roadmap or a narrow application class. The stronger and more defensible framing is that the industry has finally started to demonstrate the first credible logical abstractions, but the distance from a few logical qubits to a fault-tolerant machine with broad algorithmic utility is still measured in architecture, decoding, and gate-synthesis work, not in qubit count alone.
