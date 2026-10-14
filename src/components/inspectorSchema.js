const RETRY = [
  { key: 'retries', label: 'Retries', type: 'number', min: 0, max: 10, help: 'Extra attempts after a failure (0–10).' },
  { key: 'retryDelayMs', label: 'Retry delay (ms)', type: 'number', min: 0 },
  { key: 'backoff', label: 'Backoff', type: 'select', options: ['fixed', 'exponential'], help: 'Exponential doubles the delay after each failed attempt.' },
  { key: 'continueOnError', label: 'Continue on error', type: 'checkbox', help: 'If it still fails, pass the error downstream instead of stopping this branch.' },
];

export const SCHEMA = {
  trigger: [
    { key: 'payload', label: 'Trigger payload (JSON)', type: 'json', help: 'The data this workflow starts with.' },
  ],
  action: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'url', label: 'URL', type: 'text' },
    { key: 'latencyMs', label: 'Simulated latency (ms)', type: 'number', min: 0 },
    { key: 'failFirstN', label: 'Fail the first N attempts', type: 'number', min: 0, help: 'Simulates a flaky endpoint so you can test retries.' },
    ...RETRY,
  ],
  notification: [
    { key: 'channel', label: 'Channel', type: 'select', options: ['email', 'slack', 'sms'] },
    { key: 'to', label: 'Recipient', type: 'text' },
    { key: 'message', label: 'Message', type: 'text' },
    ...RETRY,
  ],
  conditional: [
    { key: 'expression', label: 'Condition', type: 'expression', help: 'JavaScript using `input` (data from upstream). Truthy takes the "true" branch.' },
  ],
  delay: [
    { key: 'ms', label: 'Wait (ms)', type: 'number', min: 0 },
  ],
  logic: [
    { key: 'expression', label: 'Expression', type: 'expression', help: 'Return an object to merge into the data, e.g. ({ total: input.amount * 2 }).' },
    ...RETRY,
  ],
  merge: [],
};
