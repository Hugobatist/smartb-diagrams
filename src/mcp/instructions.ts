/**
 * MCP server instructions sent to AI clients on connection.
 * Teaches the AI HOW to use SmartB Diagrams effectively —
 * optimized for minimal tool calls and maximum proactive usage.
 */
export const MCP_INSTRUCTIONS = `
# SmartB Diagrams — Show Your Reasoning Visually

You have SmartB Diagrams. Use it to show the developer your reasoning in real-time
as a visual flowchart in their browser. ONE tool call = complete diagram with colors,
risks, and rejected alternatives.

## Session Management

At the START of each conversation, call \`create_mcp_session\` with a descriptive label:
\`\`\`json
{ "label": "Debug auth bug" }
\`\`\`
This groups all diagrams from this conversation into one session visible in the browser.
If you forget, diagrams still work but will go into a default session.

## When to Use (PROACTIVELY, without being asked)

- Planning any implementation with 3+ steps
- Debugging: show your hypothesis tree
- Refactoring: show before/after or decision points
- Architecture analysis: show components and data flow
- Any task where visualizing your plan prevents wasted effort

Do NOT use for: one-line fixes, simple answers, obvious tasks.

## How to Use: ONE Call Does Everything

\`update_diagram\` accepts everything at once — diagram + annotations:

\`\`\`json
{
  "filePath": "reasoning.mmd",
  "content": "flowchart TD\\n  ANALYZE[\\"Analyze Code\\"] --> PLAN[\\"Create Plan\\"]\\n  PLAN --> IMPL[\\"Implement\\"]\\n  IMPL --> TEST[\\"Run Tests\\"]",
  "nodeStatuses": {
    "ANALYZE": "ok",
    "PLAN": "in-progress",
    "IMPL": "problem"
  },
  "riskLevels": {
    "IMPL": { "level": "high", "reason": "Touches auth module, could break login flow" }
  },
  "ghostPaths": [
    { "from": "ANALYZE", "to": "IMPL", "label": "Skip planning: rejected, too complex" }
  ]
}
\`\`\`

### Status Colors (nodeStatuses)
- **"ok"** (green) = verified, working, done
- **"in-progress"** (yellow) = currently working on this
- **"problem"** (red) = found issue, needs attention
- **"discarded"** (gray) = ruled out, not pursuing

### Risk Levels (riskLevels)
- **"high"** = likely bugs, edge cases, or failures — ALWAYS explain why
- **"medium"** = moderate complexity, worth watching
- **"low"** = straightforward

### Ghost Paths (ghostPaths)
Alternatives you considered but rejected. Include WHY you rejected them.

## Diagram Design Rules

- **Max 15 nodes** — be concise, not comprehensive
- **Short labels** — "Validate Input" not "Validate all user input fields and return errors"
- **Meaningful IDs** — use \`VALIDATE\` not \`A\` or \`node1\`
- **Use subgraphs** to group phases
- **TD** for sequential flows, **LR** for comparison/parallel

## CRITICAL: Never Block Work for Diagrams

**NEVER stop your workflow just to update a diagram.** Diagram calls must NOT interrupt your task flow.

Rules:
1. **Always batch diagram calls with other tool calls** — if you're about to run a command, edit a file, or read something, include the \`update_diagram\` call in the SAME parallel tool call batch. Never make a dedicated turn just for a diagram.
2. **If you have nothing else to do in this turn**, then a standalone diagram call is OK (e.g., initial plan before starting work, or final summary).
3. **Prefer fewer, bigger updates** over many small ones. Update the diagram 2-3 times max per task: plan, mid-progress, done.

Good pattern:
\`\`\`
Turn 1: [update_diagram (plan)] + [read_file] — parallel
Turn 2: [edit_file] + [update_diagram (progress)] — parallel
Turn 3: [run_tests] + [update_diagram (final)] — parallel
\`\`\`

Bad pattern (NEVER do this):
\`\`\`
Turn 1: [read_file]
Turn 2: [update_diagram] ← BLOCKING! Wasted turn
Turn 3: [edit_file]
Turn 4: [update_diagram] ← BLOCKING again!
\`\`\`

## Workflow During a Task

1. **Before coding**: Create diagram showing your plan — batch it with your first read/search call
2. **As you work**: Update statuses — batch it with your next edit/command call
3. **When done**: Final update with all nodes green (ok) or red (problem) — batch with summary

Each update is ONE \`update_diagram\` call — fast and fluid.

## Incremental Updates

For small changes to an existing diagram, you can also use:
- \`update_node_status\` — change one node's color
- \`set_risk_level\` — add/change one risk assessment
- \`record_ghost_path\` — add one rejected alternative

But prefer \`update_diagram\` for initial creation and major updates.

## Developer Feedback (Flags)

Use \`read_flags\` to check if the developer flagged any nodes for correction.
If flags exist, use \`get_correction_context\` to understand what they want.

## Sessions (Optional, for long tasks)

For tasks spanning many steps, use sessions to generate heatmaps:
- \`start_session\` → \`record_step\` per node → \`end_session\`

## Breakpoints

If \`check_breakpoints\` returns "pause", STOP and wait for the developer.
`.trim();
