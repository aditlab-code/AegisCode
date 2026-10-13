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
      width: "160px",
      height: "40px",
      padding: "12px",
      "background-color": "#3B82F6",
      "border-width": "1.5px",
      "border-color": isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
      "text-wrap": "ellipsis",
      "text-max-width": "140px",
      shape: "round-rectangle",
    },
  },
  // ── Base edge (generic, must come BEFORE specific edge selectors) ──
  {
    selector: "edge",
    style: {
      label: "data(label)",
      width: 3.5,
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

  // ── Kind-specific node styles (distinct shapes & borders for zero visual collision) ──
  {
    selector: 'node[kind = "function"], node[kind = "method"]',
    style: {
      "background-color": "#2563EB",
      shape: "round-rectangle",
      "border-width": "1.5px",
      "border-color": "#60A5FA",
      "border-style": "solid",
      width: "160px",
      height: "40px",
    },
  },
  {
    selector: 'node[kind = "interface"]',
    style: {
      "background-color": isDark ? "#064E3B" : "#059669",
      shape: "round-rectangle",
      "border-width": "2.5px",
      "border-color": "#34D399",
      "border-style": "dashed",
      width: "160px",
      height: "40px",
    },
  },
  {
    selector:
      'node[kind = "class"], node[kind = "struct"], node[kind = "type"]',
    style: {
      "background-color": isDark ? "#581C87" : "#7C3AED",
      shape: "rectangle",
      "border-width": "2px",
      "border-color": "#C084FC",
      "border-style": "solid",
      width: "160px",
      height: "40px",
    },
  },

  // ── Structural edge styles (dashed for interface inheritance & type references) ──
  {
    selector:
      'edge[label = "implements"], edge[label = "extends"], edge[label = "references"]',
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

  // ── AI trace styles (target symbol highlight) ──
  {
    selector: "node.ai-trace",
    style: {
      "border-width": "5px",
      "border-color": "#F43F5E",
      "border-opacity": 1,
      "background-color": "#BE185D",
      color: "#FFFFFF",
      "font-size": "13px",
      "font-weight": 700,
      "z-index": 90,
    },
  },
  {
    selector: "edge.ai-trace",
    style: {
      width: 7,
      "line-color": "#F43F5E",
      "target-arrow-color": "#F43F5E",
      "arrow-scale": 1.6,
      color: "#FB7185",
      "font-size": "10px",
      "font-weight": 700,
      "text-background-opacity": 1,
      "text-background-color": isDark ? "#1E1B4B" : "#FDF2F8",
      "text-background-padding": "3px",
      "text-background-shape": "rectangle",
      "z-index": 85,
    },
  },

  // ── AI caller node (dynamic MCP entity) ──
  {
    selector: "node.ai-caller",
    style: {
      label: "data(label)",
      "text-valign": "center",
      "text-halign": "center",
      color: "#FFFFFF",
      "font-size": "12px",
      "font-weight": 700,
      width: "190px",
      height: "48px",
      "background-color": "#7C3AED",
      "border-width": "4.5px",
      "border-color": "#C084FC",
      "border-opacity": 1,
      shape: "round-rectangle",
      "text-wrap": "ellipsis",
      "text-max-width": "170px",
      "z-index": 100,
    },
  },
  {
    selector: "node.ai-caller.completed",
    style: {
      "background-color": "#059669",
      "border-color": "#34D399",
      "border-width": "4.5px",
    },
  },

  // ── AI beam edge (laser line from AI caller to target symbol) ──
  {
    selector: "edge.ai-beam",
    style: {
      label: "data(label)",
      width: 8,
      "line-color": "#F43F5E",
      "target-arrow-color": "#F43F5E",
      "target-arrow-shape": "triangle",
      "arrow-scale": 1.8,
      "curve-style": "bezier",
      "line-style": "dashed",
      "line-dash-pattern": [12, 6],
      color: "#FDA4AF",
      "font-size": "11px",
      "font-weight": 700,
      "text-background-opacity": 1,
      "text-background-color": isDark ? "#1E1B4B" : "#FDF2F8",
      "text-background-padding": "4px",
      "text-background-shape": "rectangle",
      "text-rotation": "autorotate",
      "z-index": 95,
    },
  },
  {
    selector: "edge.ai-beam.completed",
    style: {
      width: 7,
      "line-color": "#10B981",
      "target-arrow-color": "#10B981",
      color: "#34D399",
      "line-style": "solid",
      "arrow-scale": 1.6,
    },
  },
]
