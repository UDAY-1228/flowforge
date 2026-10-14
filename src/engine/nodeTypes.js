// Node type registry. Pure data + small helpers; no React, no DOM.
// Each type declares its ports and default config so the validator, the
// executor and the UI all agree on one source of truth.

export const NODE_TYPES = {
  trigger: {
    label: 'Trigger',
    subtitle: 'Initiate workflows',
    inputs: [],
    outputs: ['out'],
    defaults: { kind: 'manual', payload: { orderId: 1042, amount: 250, customer: 'Acme Co' } },
  },
  action: {
    label: 'Action',
    subtitle: 'Perform tasks',
    inputs: ['in'],
    outputs: ['out'],
    // failFirstN simulates a flaky call so retries can be demonstrated.
    defaults: { name: 'HTTP Request', url: 'https://api.example.com/orders', failFirstN: 0, latencyMs: 40, retries: 0, retryDelayMs: 100, backoff: 'fixed', continueOnError: false },
  },
  notification: {
    label: 'Notification',
    subtitle: 'Send alerts or notifications',
    inputs: ['in'],
    outputs: ['out'],
    defaults: { channel: 'email', to: 'ops@example.com', message: 'Workflow update', retries: 0, retryDelayMs: 100, backoff: 'fixed', continueOnError: false },
  },
  conditional: {
    label: 'Conditional',
    subtitle: 'Branch the workflow',
    inputs: ['in'],
    outputs: ['true', 'false'],
    // expression sees `input` (merged upstream data). Returns truthy -> "true" port.
    defaults: { expression: 'input.amount > 100' },
  },
  delay: {
    label: 'Delay',
    subtitle: 'Pause the workflow',
    inputs: ['in'],
    outputs: ['out'],
    defaults: { ms: 200 },
  },
  logic: {
    label: 'Logic',
    subtitle: 'Logic function',
    inputs: ['in'],
    outputs: ['out'],
    // expression returns an object that is merged into the data flowing on.
    defaults: { expression: '({ total: input.amount * 1.18 })', retries: 0, retryDelayMs: 100, backoff: 'fixed', continueOnError: false },
  },
  merge: {
    label: 'Merge',
    subtitle: 'Combine multiple branches',
    inputs: ['in'],
    outputs: ['out'],
    defaults: {},
  },
};

export const NODE_TYPE_IDS = Object.keys(NODE_TYPES);

export function getType(type) {
  return NODE_TYPES[type] || null;
}

export function portsOf(node) {
  const t = getType(node.type);
  return t ? { inputs: t.inputs, outputs: t.outputs } : { inputs: [], outputs: [] };
}

export function defaultConfig(type) {
  const t = getType(type);
  return t ? JSON.parse(JSON.stringify(t.defaults)) : {};
}
