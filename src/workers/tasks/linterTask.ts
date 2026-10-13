import type { DiagnosticItem } from "../../types/workbench"
import { validateSyntax } from "../../utils/linter"
import type { LintPayload } from "../types"

export function handleLintTask(payload: LintPayload): DiagnosticItem[] {
  return validateSyntax(payload.filename, payload.content)
}
