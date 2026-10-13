import type cytoscape from "cytoscape"

export const getCytoscapeTheme = (
  isDark = true,
): cytoscape.StylesheetStyle[] => [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-valign": "center",
      "text-halign": "center",
      color: "#FFFFFF",
      "font-size": "11px",
      "font-family":
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "font-weight": 600,
      width: "label",
      height: "label",
      padding: "10px",
      "background-color": "#3B82F6",
      "border-width": "1.5px",
      "border-color": isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
      "text-wrap": "ellipsis",
      "text-max-width": "180px",
      shape: "round-rectangle",
    },
  },
  {
    selector: 'node[kind = "function"], node[kind = "method"]',
    style: {
      "background-color": "#3B82F6",
      shape: "round-rectangle",
    },
  },
  {
    selector: 'node[kind = "interface"]',
    style: {
      "background-color": "#10B981",
      shape: "diamond",
      padding: "12px",
    },
  },
  {
    selector:
      'node[kind = "class"], node[kind = "struct"], node[kind = "type"]',
    style: {
      "background-color": "#8B5CF6",
      shape: "ellipse",
      padding: "10px",
    },
  },
  {
    selector: "node.active, node:selected",
    style: {
      "border-width": "3px",
      "border-color": "#F59E0B",
      "border-opacity": 1,
      "shadow-blur": "10px",
      "shadow-color": "#F59E0B",
      "shadow-opacity": 0.5,
    },
  },
  {
    selector: "node.ai-trace",
    style: {
      "border-width": "3px",
      "border-color": "#EC4899",
      "border-opacity": 1,
      "background-color": "#EC4899",
      "shadow-blur": "14px",
      "shadow-color": "#EC4899",
      "shadow-opacity": 0.8,
    },
  },
  {
    selector: "edge",
    style: {
      label: "data(label)",
      width: 1.5,
      "line-color": isDark ? "#475569" : "#94A3B8",
      "target-arrow-color": isDark ? "#475569" : "#94A3B8",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      "arrow-scale": 0.9,
      "font-size": "9px",
      "font-family": "ui-monospace, monospace",
      color: isDark ? "#94A3B8" : "#64748B",
      "text-background-opacity": 0.9,
      "text-background-color": isDark ? "#0F172A" : "#F8FAFC",
      "text-background-padding": "2px",
      "text-background-shape": "roundrectangle",
      "text-rotation": "autorotate",
    },
  },
  {
    selector: "edge.ai-trace",
    style: {
      width: 2.5,
      "line-color": "#EC4899",
      "target-arrow-color": "#EC4899",
      color: "#EC4899",
      "text-background-color": isDark ? "#1E1B4B" : "#FDF2F8",
    },
  },
  {
    selector: "node.dimmed, edge.dimmed",
    style: {
      opacity: 0.2,
    },
  },
]
