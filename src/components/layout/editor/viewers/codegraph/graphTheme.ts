import type cytoscape from "cytoscape"

export const getCytoscapeTheme = (
  isDark = true,
): cytoscape.StylesheetStyle[] => [
  // ── Base node (generic, must come FIRST so specifics override) ──
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-valign": "center",
      "text-halign": "center",
      color: "#FFFFFF",
      "font-size": "12px",
      "font-family":
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "font-weight": 600,
      width: "165px",
      height: "40px",
      padding: "12px",
      "background-color": "#3B82F6",
      "border-width": "1.5px",
      "border-color": isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
      "text-wrap": "ellipsis",
      "text-max-width": "145px",
      shape: "round-rectangle",
    },
  },
  // ── Base edge (generic, must come BEFORE specific edge selectors) ──
  {
    selector: "edge",
    style: {
      label: "data(label)",
      width: 3,
      "line-color": isDark ? "#94A3B8" : "#64748B",
      "target-arrow-color": isDark ? "#94A3B8" : "#64748B",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      "arrow-scale": 1.25,
      "font-size": "9px",
      "font-family": "ui-monospace, monospace",
      color: isDark ? "#E2E8F0" : "#334155",
      "text-background-opacity": 0.9,
      "text-background-color": isDark ? "#0F172A" : "#F8FAFC",
      "text-background-padding": "2px",
      "text-background-shape": "rectangle",
      "text-rotation": "autorotate",
    },
  },

  // ── @colbymchenry/codegraph 22 NodeKind taxonomy ──
  {
    selector: 'node[kind = "function"], node[kind = "method"]',
    style: {
      "background-color": "#2563EB",
      shape: "round-rectangle",
      "border-width": "1.5px",
      "border-color": "#60A5FA",
      "border-style": "solid",
    },
  },
  {
    selector:
      'node[kind = "interface"], node[kind = "trait"], node[kind = "protocol"], node[kind = "type_alias"]',
    style: {
      "background-color": isDark ? "#064E3B" : "#059669",
      shape: "round-rectangle",
      "border-width": "2.5px",
      "border-color": "#34D399",
      "border-style": "dashed",
    },
  },
  {
    selector:
      'node[kind = "class"], node[kind = "struct"], node[kind = "type"], node[kind = "enum"], node[kind = "module"], node[kind = "namespace"]',
    style: {
      "background-color": isDark ? "#581C87" : "#7C3AED",
      shape: "rectangle",
      "border-width": "2px",
      "border-color": "#C084FC",
      "border-style": "solid",
    },
  },
  {
    selector: 'node[kind = "route"], node[kind = "component"]',
    style: {
      "background-color": isDark ? "#7C2D12" : "#EA580C",
      shape: "round-tag",
      "border-width": "2px",
      "border-color": "#FB923C",
      "border-style": "solid",
    },
  },

  // ── Structural edge styles (12 EdgeKind taxonomy) ──
  {
    selector:
      'edge[label = "implements"], edge[label = "extends"], edge[label = "references"], edge[label = "imports"], edge[label = "type_of"]',
    style: {
      "line-style": "dashed",
      width: 2.5,
      "line-color": isDark ? "#6EE7B7" : "#059669",
      "target-arrow-color": isDark ? "#6EE7B7" : "#059669",
      "target-arrow-shape": "triangle",
    },
  },

  // ── Interactive state styles ──
  {
    selector: "node.active, node:selected",
    style: {
      "border-width": "4.5px",
      "border-color": "#F59E0B",
      "border-opacity": 1,
      "z-index": 80,
    },
  },
  {
    selector: "node.dimmed, edge.dimmed",
    style: {
      opacity: 0.2,
    },
  },

  // ── AI Target Trace Styles (Call-Tree Top-to-Bottom Highlight & Pulse) ──
  {
    selector: "node.ai-target-pulse",
    style: {
      "border-width": "4.5px",
      "border-color": isDark ? "#38BDF8" : "#0284C7",
      "border-opacity": 1,
      "underlay-color": isDark ? "#0284C7" : "#38BDF8",
      "underlay-padding": "8px",
      "underlay-opacity": 0.4,
      "underlay-shape": "round-rectangle",
      "font-weight": 700,
      "z-index": 100,
    },
  },
  {
    selector: "node.ai-target-pulse.ai-pulse-dim",
    style: {
      "underlay-padding": "3px",
      "underlay-opacity": 0.1,
      "border-width": "3.5px",
    },
  },
  {
    selector: "edge.ai-target-edge",
    style: {
      width: 4,
      "line-color": isDark ? "#38BDF8" : "#0284C7",
      "target-arrow-color": isDark ? "#38BDF8" : "#0284C7",
      "arrow-scale": 1.4,
      "z-index": 85,
    },
  },
  {
    selector: "edge.ai-target-edge.ai-pulse-dim",
    style: {
      width: 2.5,
      "line-color": isDark ? "#0369A1" : "#7DD3FC",
      "target-arrow-color": isDark ? "#0369A1" : "#7DD3FC",
    },
  },
]
