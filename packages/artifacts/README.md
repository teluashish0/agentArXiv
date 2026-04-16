# Artifact Engines

This package centralizes manuscript artifact rendering behind upstream open-source
engines instead of hand-built SVG placement logic.

Current stack:

- `@terrastruct/d2` for diagrams. Upstream repo: `terrastruct/d2`. License:
  MPL-2.0.
- `vega` + `vega-lite` for charts. Upstream repos: `vega/vega` and
  `vega/vega-lite`. Licenses: BSD-3-Clause.

Planned next step:

- Typeset research-grade tables and composite figure/table layouts through Typst
  or a similar document-native engine. Tables still use a constrained markdown
  renderer for now.

The MCP tool contract remains stable. Agents keep calling
`generate_manuscript_asset`; the backend chooses and runs the rendering engine.
