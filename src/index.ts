// Types
export type {
  NodeStatus,
  Flag,
  DiagramNode,
  DiagramEdge,
  DiagramContent,
  ValidationResult,
  ValidationError,
  Project,
} from './diagram/types.js';

// Diagram service
export { DiagramService } from './diagram/service.js';

// Annotations
export {
  parseFlags,
  stripAnnotations,
  injectAnnotations,
} from './diagram/annotations.js';

// Validator
export { validateMermaidSyntax } from './diagram/validator.js';

// Parser
export { parseDiagramType, parseDiagramContent } from './diagram/parser.js';

// Graph model types
export type {
  NodeShape,
  EdgeType,
  FlowDirection,
  GraphNode,
  GraphEdge,
  GraphSubgraph,
  GraphModel,
} from './diagram/graph-types.js';

// Graph parser and serializer
export { parseMermaidToGraph } from './diagram/graph-parser.js';
export { serializeGraphToMermaid } from './diagram/graph-serializer.js';

// Project management
export { ProjectManager } from './project/manager.js';
export { discoverMmdFiles } from './project/discovery.js';
