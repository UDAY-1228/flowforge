import { defaultConfig } from '../engine/nodeTypes.js';

const n = (id, type, x, y, config = {}, label) => ({
  id, type, x, y, label, config: { ...defaultConfig(type), ...config },
});
const e = (source, target, sourcePort = 'out') => ({ id: `${source}.${sourcePort}->${target}`, source, sourcePort, target });

export const TEMPLATES = [
  {
    key: 'order',
    name: 'Order approval',
    description: 'Branches on order value, then merges back into one confirmation.',
    build: () => ({
      name: 'Order approval',
      nodes: [
        n('trigger', 'trigger', 60, 220, { payload: { orderId: 1042, amount: 250, customer: 'Acme Co' } }),
        n('tax', 'logic', 360, 220, { expression: '({ total: Math.round(input.amount * 1.18) })' }, 'Add tax'),
        n('big', 'conditional', 660, 220, { expression: 'input.total > 250' }, 'Large order?'),
        n('review', 'notification', 980, 80, { to: 'manager@example.com', message: 'Order needs approval' }, 'Ask manager'),
        n('auto', 'action', 980, 380, { name: 'Auto-approve', url: 'https://api.example.com/approve' }),
        n('join', 'merge', 1280, 220),
        n('confirm', 'notification', 1580, 220, { to: 'customer@example.com', message: 'Order confirmed' }, 'Confirm'),
      ],
      edges: [
        e('trigger', 'tax'), e('tax', 'big'), e('big', 'review', 'true'), e('big', 'auto', 'false'),
        e('review', 'join'), e('auto', 'join'), e('join', 'confirm'),
      ],
    }),
  },
  {
    key: 'retries',
    name: 'Flaky API with retries',
    description: 'An endpoint fails twice before succeeding; watch exponential backoff in the debugger.',
    build: () => ({
      name: 'Flaky API with retries',
      nodes: [
        n('trigger', 'trigger', 60, 200, { payload: { userId: 7 } }),
        n('flaky', 'action', 380, 100, { name: 'Flaky API', failFirstN: 2, retries: 3, retryDelayMs: 200, backoff: 'exponential' }),
        n('broken', 'action', 380, 320, { name: 'Always failing API', failFirstN: 99, retries: 1, retryDelayMs: 150 }),
        n('notify', 'notification', 700, 100, { message: 'Synced user' }, 'Notify'),
        n('cleanup', 'logic', 700, 320, { expression: '({ cleaned: true })' }, 'Cleanup (skipped on failure)'),
      ],
      edges: [e('trigger', 'flaky'), e('trigger', 'broken'), e('flaky', 'notify'), e('broken', 'cleanup')],
    }),
  },
  {
    key: 'parallel',
    name: 'Parallel fan-out and merge',
    description: 'Three independent branches run together and join before the final step.',
    build: () => ({
      name: 'Parallel fan-out and merge',
      nodes: [
        n('trigger', 'trigger', 60, 240, { payload: { sku: 'A-100', qty: 3 } }),
        n('stock', 'logic', 380, 80, { expression: '({ inStock: input.qty < 10 })' }, 'Check stock'),
        n('price', 'logic', 380, 240, { expression: '({ price: input.qty * 19.5 })' }, 'Price it'),
        n('wait', 'delay', 380, 400, { ms: 400 }, 'Fraud check (delay)'),
        n('join', 'merge', 700, 240),
        n('ship', 'notification', 1000, 240, { message: 'Ready to ship' }, 'Ship notice'),
      ],
      edges: [
        e('trigger', 'stock'), e('trigger', 'price'), e('trigger', 'wait'),
        e('stock', 'join'), e('price', 'join'), e('wait', 'join'), e('join', 'ship'),
      ],
    }),
  },
  {
    key: 'cycle',
    name: 'Invalid: contains a cycle',
    description: 'Deliberately broken, so you can see validation catch the loop and refuse to run.',
    build: () => ({
      name: 'Invalid: contains a cycle',
      nodes: [
        n('trigger', 'trigger', 60, 180),
        n('a', 'logic', 360, 180, {}, 'Step A'),
        n('b', 'logic', 660, 80, {}, 'Step B'),
        n('c', 'logic', 660, 300, {}, 'Step C'),
      ],
      edges: [e('trigger', 'a'), e('a', 'b'), e('b', 'c'), e('c', 'a')],
    }),
  },
];

export function buildTemplate(key) {
  const t = TEMPLATES.find((x) => x.key === key) || TEMPLATES[0];
  return t.build();
}
